import {
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { TiktokenModel } from 'tiktoken';
import { AiService } from '../ai.service';
import { DiaryService } from 'src/diary/diary.service';
import {
  OpenAiMessage,
  AuthenticatedSocket,
  SocketAuthPayload,
} from '../types';
import { UseGuards } from '@nestjs/common';
import { PlanGuard } from '../guards/plan.guard';
import { User } from '../../users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { CryptoService } from 'src/kms/crypto.service';
import { decrypt } from 'src/kms/utils/decrypt';

@UseGuards(PlanGuard)
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AiGateway implements OnGatewayConnection {
  constructor(
    private readonly aiService: AiService,
    private readonly diaryService: DiaryService,
    private readonly jwtService: JwtService,
    private readonly crypto: CryptoService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      const { token } = client.handshake.auth as SocketAuthPayload;
      if (!token) {
        client.emit('unauthorized_error', {
          statusMessage: 'tokenRequired',
          message: 'tokenIsRequiredForAuthentication',
        });
        client.disconnect();
        return false;
      }
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
      entryId: number;
      content: string;
      aiModel: TiktokenModel;
      mood: string;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { entryId, content, aiModel, mood } = data;

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_comment_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    try {
      const entry = await this.diaryService.getEntryById(entryId, userId);
      if (!entry) {
        client.emit('ai_stream_comment_error', {
          statusMessage: 'entryNotFound',
          message: 'entryNotFoundOrAccessDenied',
        });
        return;
      }

      let prompt: OpenAiMessage[] = [];
      if (entry.prompt) {
        try {
          const decPrompt = await decrypt(this.crypto, userId, entry.prompt);
          prompt = JSON.parse(decPrompt) as OpenAiMessage[];
        } catch (e: any) {
          console.log('Error decrypting or parsing prompt:', e);
          prompt = [];
        }
      }

      let fullResponse = '';

      await this.aiService.generateComment(
        userId,
        prompt,
        content,
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
      );

      const aiComment = await this.aiService.createAiComment(
        userId,
        fullResponse,
        aiModel,
        entryId,
      );

      client.emit('ai_stream_comment_done', {
        aiComment: {
          id: aiComment.id,
          createdAt: aiComment.createdAt,
          aiModel: aiComment.aiModel,
          content: fullResponse,
        },
      });
    } catch (err: any) {
      console.log('handleStreamAiComment error:', err);
      client.emit('ai_stream_comment_error', {
        statusMessage: 'internal',
        message: 'failedToGenerateComment',
      });
    }
  }

  @SubscribeMessage('stream_ai_dialog')
  async handleStreamAiDialog(
    @MessageBody()
    data: {
      entryId: number;
      uuid: string;
      content: string;
      aiModel: TiktokenModel;
      mood: string;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { entryId, uuid, content, aiModel, mood } = data;

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_dialog_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    try {
      const entry = await this.diaryService.getEntryById(entryId, userId);

      if (!entry) {
        client.emit('ai_stream_dialog_error', {
          statusMessage: 'entryNotFound',
          message: 'entryNotFoundOrAccessDenied',
        });
        return;
      }

      let prompt: OpenAiMessage[] = [];
      if (entry.prompt) {
        try {
          const decPrompt = await decrypt(this.crypto, userId, entry.prompt);
          prompt = JSON.parse(decPrompt) as OpenAiMessage[];
        } catch {
          console.log('Error decrypting or parsing prompt');
          prompt = [];
        }
      }

      let fullResponse = '';

      await this.aiService.generateComment(
        userId,
        prompt,
        content,
        aiModel,
        mood,
        (chunk) => {
          fullResponse += chunk;
          client.emit('ai_stream_dialog_chunk', { text: chunk });
        },
        true,
        entry.content,
        entry.aiComment?.content,
        entry.dialogs ?? [],
      );

      const dialog = await this.diaryService.saveDialog(
        userId,
        entryId,
        uuid,
        content,
        fullResponse,
      );

      client.emit('ai_stream_dialog_done', {
        respDialog: {
          id: dialog?.id,
          uuid: dialog?.uuid,
          createdAt: dialog?.createdAt,
          loading: false,
          question: content,
          answer: fullResponse,
        },
      });
    } catch (e) {
      console.log('handleStreamAiDialog error:', e);
      client.emit('ai_stream_dialog_error', {
        statusMessage: 'internal',
        message: 'failedToGenerateDialog',
      });
    }
  }
}
