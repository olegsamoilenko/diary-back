import {
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { TiktokenModel } from 'tiktoken';
import { AiService } from '../ai.service';
import {
  OpenAiMessage,
  AuthenticatedSocket,
  SocketAuthPayload,
  TimeContext,
} from '../types';
import { UseGuards } from '@nestjs/common';
import { PlanGuard } from '../guards/plan.guard';
import { User } from '../../users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { CryptoService } from 'src/kms/crypto.service';
import { AiModel } from '../../users/types';

@UseGuards(PlanGuard)
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AiGateway implements OnGatewayConnection {
  constructor(
    private readonly aiService: AiService,
    private readonly jwtService: JwtService,
    private readonly crypto: CryptoService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      const auth = client.handshake.auth as SocketAuthPayload;

      const { token, appVersion, appBuild, platform } = auth;
      if (!token) {
        client.emit('unauthorized_error', {
          statusMessage: 'tokenRequired',
          message: 'tokenIsRequiredForAuthentication',
        });
        client.disconnect();
        return false;
      }

      client.data.appVersion = appVersion;
      client.data.appBuild = appBuild;
      client.data.platform = platform;
      client.user = this.jwtService.verify<User>(token);
    } catch {
      client.emit('unauthorized_error', {
        statusMessage: 'invalidToken',
        message: 'invalidTokenProvided',
      });
      client.disconnect();
      return false;
    }
  }

  // handleDisconnect(client: AuthenticatedSocket) {
  //   console.log('AiGateway: Client disconnected:', client.id);
  // }

  @SubscribeMessage('stream_ai_comment')
  async handleStreamAiComment(
    @MessageBody()
    data: {
      content: string;
      aiModel: AiModel;
      mood: string;
      aboutMe?: string;
      userMemory: OpenAiMessage;
      assistantMemory: OpenAiMessage;
      assistantCommitment: OpenAiMessage;
      prompt: OpenAiMessage[];
      timeContext: TimeContext;
      isFirstEntry?: boolean;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const {
      content,
      aiModel,
      mood,
      aboutMe,
      userMemory,
      assistantMemory,
      assistantCommitment,
      prompt,
      timeContext,
      isFirstEntry,
    } = data;

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_comment_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    try {
      let fullResponse = '';

      await this.aiService.generateComment(
        userId,
        aboutMe ?? '',
        userMemory,
        assistantMemory,
        assistantCommitment,
        prompt,
        content,
        timeContext,
        aiModel,
        mood,
        (chunk) => {
          fullResponse += chunk;
          client.emit('ai_stream_comment_chunk', { text: chunk });
        },
        false,
        undefined,
        undefined,
        [],
        isFirstEntry,
      );

      client.emit('ai_stream_comment_done', {
        content: fullResponse,
        tags: [],
      });
    } catch (e: any) {
      console.log('handleStreamAiComment error:', e);

      const err =
        e instanceof Error
          ? {
              name: e.name,
              message: e.message,
              stack: e.stack,
            }
          : {
              message: String(e),
            };

      client.emit('ai_stream_comment_error', {
        statusMessage: 'internal',
        message: 'failedToGenerateComment',
        err,
      });
    }
  }

  @SubscribeMessage('stream_ai_dialog')
  async handleStreamAiDialog(
    @MessageBody()
    data: {
      content: string;
      aiModel: AiModel;
      mood: string;
      aboutMe?: string;
      entryContent: OpenAiMessage;
      entryAiComment: OpenAiMessage;
      entryDialogs?: OpenAiMessage[];
      userMemory: OpenAiMessage;
      assistantMemory: OpenAiMessage;
      assistantCommitment: OpenAiMessage;
      prompt: OpenAiMessage[];
      timeContext: TimeContext;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const {
      content,
      aiModel,
      mood,
      aboutMe,
      entryContent,
      entryAiComment,
      entryDialogs,
      userMemory,
      assistantMemory,
      assistantCommitment,
      prompt,
      timeContext,
    } = data;

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_dialog_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    try {
      let fullResponse = '';

      await this.aiService.generateComment(
        userId,
        aboutMe ?? '',
        userMemory,
        assistantMemory,
        assistantCommitment,
        prompt,
        content,
        timeContext,
        aiModel,
        mood,
        (chunk) => {
          fullResponse += chunk;
          client.emit('ai_stream_dialog_chunk', { text: chunk });
        },
        true,
        entryContent,
        entryAiComment,
        entryDialogs ?? [],
        false,
      );

      client.emit('ai_stream_dialog_done', {
        content: fullResponse,
        tags: [],
      });
    } catch (e) {
      console.log('handleStreamAiDialog error:', e);

      const err =
        e instanceof Error
          ? {
              name: e.name,
              message: e.message,
              stack: e.stack,
            }
          : {
              message: String(e),
            };

      client.emit('ai_stream_dialog_error', {
        statusMessage: 'internal',
        message: 'failedToGenerateDialog',
        err,
      });
    }
  }
}
