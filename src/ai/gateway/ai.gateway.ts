import {
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { TiktokenModel } from 'tiktoken';
import { AiService } from '../ai.service';
import { DiaryService } from 'src/diary/diary.service';
import { OpenAiMessage, AuthenticatedSocket } from '../types';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from '../guards/ws-auth.guard';
import { PlanGuard } from '../guards/plan.guard';

@UseGuards(WsAuthGuard, PlanGuard)
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AiGateway {
  constructor(
    private readonly aiService: AiService,
    private readonly diaryService: DiaryService,
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
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { entryId, content, aiModel, mood } = data;

    const userId = Number(client.user?.id);
    console.log('data', data);

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
