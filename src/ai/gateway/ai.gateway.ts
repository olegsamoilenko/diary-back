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

@UseGuards(PlanGuard)
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AiGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly aiService: AiService,
    private readonly diaryService: DiaryService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    console.log('Client connected:', client.id);
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
      const payload = this.jwtService.verify<User>(token);
      client.user = payload;
      console.log('WsAuthGuard2', payload);
    } catch {
      client.emit('unauthorized_error', {
        statusMessage: 'invalidToken',
        message: 'invalidTokenProvided',
      });
      client.disconnect();
      return false;
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log('Client disconnect:', client.id);
  }

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
    console.log('data', data);
    console.log('userId', userId);

    if (!userId) {
      client.emit('ai_stream_comment_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    const entry = await this.diaryService.getEntryById(entryId);

    if (!entry) {
      client.emit('ai_stream_comment_error', {
        statusMessage: 'entryNotFound',
        message: 'entryNotFoundOrAccessDenied',
      });
      return;
    }

    let prompt: OpenAiMessage[] = [];
    if (entry.prompt) {
      prompt = JSON.parse(entry.prompt) as OpenAiMessage[];
    }

    console.log('log 1');

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
      fullResponse,
      aiModel,
      entryId,
    );

    client.emit('ai_stream_comment_done', { aiComment });
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

    const entry = await this.diaryService.getEntryById(entryId);

    if (!entry) {
      client.emit('ai_stream_dialog_error', {
        statusMessage: 'entryNotFound',
        message: 'entryNotFoundOrAccessDenied',
      });
      return;
    }

    let prompt: OpenAiMessage[] = [];
    if (entry.prompt) {
      prompt = JSON.parse(entry.prompt) as OpenAiMessage[];
    }

    const dialogs = await this.diaryService.getDialogsByEntryId(entryId);

    const aiComment = await this.aiService.getAiCommentByEntryId(entryId);

    if (!aiComment) {
      client.emit('ai_stream_dialog_error', {
        statusMessage: 'commentNotFound ',
        message: 'aiCommentNoFoundForThisEntry',
      });
      return;
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
      aiComment.content,
      dialogs ?? [],
    );

    const dialog = await this.diaryService.saveDialog(
      userId,
      entryId,
      uuid,
      content,
      fullResponse,
    );

    client.emit('ai_stream_dialog_done', { respDialog: dialog });
  }
}
