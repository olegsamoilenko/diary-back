import {
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { TiktokenModel } from 'tiktoken';
import { AiService } from '../ai.service';
import type { AiContentMode } from '../ai.service';
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
import { EntryMetrics } from '../../common/types/metrics';

const AI_STREAM_CLIENT_DISCONNECTED = 'AI_STREAM_CLIENT_DISCONNECTED';

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
      goalsPrompt: string | null;
      timeContext: TimeContext;
      metrics: EntryMetrics | null;
      isFirstEntry?: boolean;
      generateShortReflection?: boolean;
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
      goalsPrompt,
      timeContext,
      metrics,
      isFirstEntry,
      generateShortReflection,
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

      const result = await this.aiService.generateComment(
        userId,
        aboutMe ?? '',
        userMemory,
        assistantMemory,
        assistantCommitment,
        prompt,
        goalsPrompt ?? '',
        content,
        timeContext,
        aiModel,
        mood,
        (chunk) => {
          if (client.disconnected) {
            throw new Error(AI_STREAM_CLIENT_DISCONNECTED);
          }

          fullResponse += chunk;
          client.emit('ai_stream_comment_chunk', { text: chunk });
        },
        'entry',
        metrics,
        undefined,
        undefined,
        [],
        isFirstEntry,
        generateShortReflection === true,
      );

      if (client.disconnected) return;

      if (generateShortReflection === true && result.shortText) {
        client.emit('ai_stream_comment_done', {
          content: result.content,
          fullText: result.fullText ?? result.content,
          shortText: result.shortText,
          tags: result.tags ?? [],
        });
        return;
      }

      client.emit('ai_stream_comment_done', {
        content: result.content || fullResponse,
        tags: result.tags ?? [],
      });
    } catch (e: any) {
      if (
        client.disconnected ||
        e?.message === AI_STREAM_CLIENT_DISCONNECTED
      ) {
        return;
      }

      console.error('handleStreamAiComment error:', e);

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

  @SubscribeMessage('stream_ai_checkin')
  async handleStreamAiCheckin(
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
      goalsPrompt: string | null;
      timeContext: TimeContext;
      metrics: EntryMetrics | null;
      generateShortReflection?: boolean;
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
      goalsPrompt,
      timeContext,
      metrics,
      generateShortReflection,
    } = data;

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_checkin_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    try {
      let fullResponse = '';
      const mode: AiContentMode = 'checkin';

      const result = await this.aiService.generateComment(
        userId,
        aboutMe ?? '',
        userMemory,
        assistantMemory,
        assistantCommitment,
        prompt,
        goalsPrompt ?? '',
        content,
        timeContext,
        aiModel,
        mood,
        (chunk) => {
          if (client.disconnected) {
            throw new Error(AI_STREAM_CLIENT_DISCONNECTED);
          }

          fullResponse += chunk;
          client.emit('ai_stream_checkin_chunk', { text: chunk });
        },
        mode,
        metrics,
        undefined,
        undefined,
        [],
        false,
        generateShortReflection === true,
      );

      if (client.disconnected) return;

      if (generateShortReflection === true && result.shortText) {
        client.emit('ai_stream_checkin_done', {
          content: result.content,
          fullText: result.fullText ?? result.content,
          shortText: result.shortText,
          tags: result.tags ?? [],
        });
        return;
      }

      client.emit('ai_stream_checkin_done', {
        content: result.content || fullResponse,
        tags: result.tags ?? [],
      });
    } catch (e: any) {
      if (
        client.disconnected ||
        e?.message === AI_STREAM_CLIENT_DISCONNECTED
      ) {
        return;
      }

      console.error('handleStreamAiCheckin error:', e);

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

      client.emit('ai_stream_checkin_error', {
        statusMessage: 'internal',
        message: 'failedToGenerateCheckin',
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
      metrics: EntryMetrics | null;
      aboutMe?: string;
      entryContent: OpenAiMessage;
      entryAiComment: OpenAiMessage;
      entryDialogs?: OpenAiMessage[];
      userMemory: OpenAiMessage;
      assistantMemory: OpenAiMessage;
      assistantCommitment: OpenAiMessage;
      prompt: OpenAiMessage[];
      goalsPrompt: string | null;
      timeContext: TimeContext;
      mode?: AiContentMode;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const {
      content,
      aiModel,
      mood,
      metrics,
      aboutMe,
      entryContent,
      entryAiComment,
      entryDialogs,
      userMemory,
      assistantMemory,
      assistantCommitment,
      prompt,
      goalsPrompt,
      timeContext,
      mode: requestedMode,
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
      const mode: AiContentMode =
        requestedMode === 'checkin_dialog' ? 'checkin_dialog' : 'dialog';

      await this.aiService.generateComment(
        userId,
        aboutMe ?? '',
        userMemory,
        assistantMemory,
        assistantCommitment,
        prompt,
        goalsPrompt ?? '',
        content,
        timeContext,
        aiModel,
        mood,
        (chunk) => {
          if (client.disconnected) {
            throw new Error(AI_STREAM_CLIENT_DISCONNECTED);
          }

          fullResponse += chunk;
          client.emit('ai_stream_dialog_chunk', { text: chunk });
        },
        mode,
        metrics,
        entryContent,
        entryAiComment,
        entryDialogs ?? [],
        false,
      );

      if (client.disconnected) return;

      client.emit('ai_stream_dialog_done', {
        content: fullResponse,
        tags: [],
      });
    } catch (e) {
      if (
        client.disconnected ||
        (e as Error)?.message === AI_STREAM_CLIENT_DISCONNECTED
      ) {
        return;
      }

      console.error('handleStreamAiDialog error:', e);

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
