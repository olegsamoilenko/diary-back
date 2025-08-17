import {
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OpenAI } from 'openai';
import { TiktokenModel } from 'tiktoken';
import { AiService } from '../ai.service';
import { DiaryService } from 'src/diary/diary.service';
import { JwtService } from '@nestjs/jwt';
import { OpenAiMessage } from '../types';

interface JwtPayload {
  id: number;
}

interface SocketAuthPayload {
  token: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class AiGateway {
  constructor(
    private readonly aiService: AiService,
    private readonly diaryService: DiaryService,
    private jwtService: JwtService,
  ) {}

  @SubscribeMessage('stream_ai_comment')
  async handleStreamAiComment(
    @MessageBody()
    data: {
      entryId: number;
      content: string;
      aiModel: TiktokenModel;
      mood: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { entryId, content, aiModel, mood } = data;
    const auth = client.handshake.auth as SocketAuthPayload;
    const token = auth.token;
    if (!token) {
      client.disconnect();
      return;
    }

    const payload = this.jwtService.verify<JwtPayload>(token);

    const userId = Number(payload.id);

    if (!userId) {
      client.emit('ai_stream_comment_error', { error: 'Invalid user ID' });
      return;
    }

    const entry = await this.diaryService.getEntryById(entryId);

    if (!entry) {
      client.emit('ai_stream_comment_error', {
        error: 'Entry not found or access denied',
      });
      return;
    }

    const prompt = JSON.parse(entry.prompt) as OpenAiMessage[];

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
    @ConnectedSocket() client: Socket,
  ) {
    const { entryId, uuid, content, aiModel, mood } = data;
    const auth = client.handshake.auth as SocketAuthPayload;
    const token = auth.token;
    if (!token) {
      client.disconnect();
      return;
    }

    const payload = this.jwtService.verify<JwtPayload>(token);

    const userId = Number(payload.id);

    if (!userId) {
      client.emit('ai_stream_dialog_error', { error: 'Invalid user ID' });
      return;
    }

    const entry = await this.diaryService.getEntryById(entryId);

    if (!entry) {
      client.emit('ai_stream_dialog_error', {
        error: 'Entry not found or access denied',
      });
      return;
    }

    const prompt = JSON.parse(entry.prompt) as OpenAiMessage[];

    const dialogs = await this.diaryService.getDialogsByEntryId(entryId);

    const aiComment = await this.aiService.getAiCommentByEntryId(entryId);

    if (!aiComment) {
      client.emit('ai_stream_dialog_error', {
        error: 'AI comment not found for this entry',
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
