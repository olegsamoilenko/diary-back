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
import { Logger, UseGuards } from '@nestjs/common';
import { PlanGuard } from '../guards/plan.guard';
import { User } from '../../users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { CryptoService } from 'src/kms/crypto.service';
import { AiModel } from '../../users/types';
import { EntryMetrics } from '../../common/types/metrics';
import { AiResponseMonitoringService } from 'src/ai-response-monitoring/ai-response-monitoring.service';
import { AiErrorReporterService } from 'src/ai-errors/ai-error-reporter.service';
import { BackendAiTimingContext, markBackendAiTiming } from '../ai-timing';
import {
  logServerEntryTiming,
  logServerMemoryReview,
} from '../entry-flow-debug';

const AI_STREAM_CLIENT_DISCONNECTED = 'AI_STREAM_CLIENT_DISCONNECTED';

@UseGuards(PlanGuard)
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AiGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AiGateway.name);

  constructor(
    private readonly aiService: AiService,
    private readonly jwtService: JwtService,
    private readonly crypto: CryptoService,
    private readonly aiResponseMonitoringService: AiResponseMonitoringService,
    private readonly aiErrorReporter: AiErrorReporterService,
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
      title?: string;
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
      timingTraceId?: string;
      supportsStructuredProgress?: boolean;
      contextProtocol?: 'memory_capsules_v2';
      itemDateMs?: number;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const {
      content,
      title,
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
      timingTraceId,
      supportsStructuredProgress,
      contextProtocol,
      itemDateMs,
    } = data;

    const timing: BackendAiTimingContext | undefined = timingTraceId
      ? {
          traceId: timingTraceId,
          flow: 'create_entry',
          startedAtMs: Date.now(),
          marks: [],
        }
      : undefined;
    markBackendAiTiming(this.logger, timing, 'gateway_request_received');

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_comment_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    const serverFlowStartedAt = Date.now();

    try {
      let fullResponse = '';
      let firstResponseChunk = true;

      markBackendAiTiming(this.logger, timing, 'ai_service_start');
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
          if (firstResponseChunk) {
            firstResponseChunk = false;
            logServerEntryTiming({
              traceId: timingTraceId,
              event: 'FIRST_AI_REFLECTION_CHUNK',
              elapsedMs: Date.now() - serverFlowStartedAt,
              data: { characters: chunk.length },
            });
            markBackendAiTiming(
              this.logger,
              timing,
              'structured_first_chunk_emitted',
            );
          }
          client.emit('ai_stream_comment_chunk', { text: chunk });
        },
        'entry',
        metrics,
        undefined,
        undefined,
        [],
        isFirstEntry,
        generateShortReflection === true,
        timing,
        supportsStructuredProgress === true,
        contextProtocol,
        itemDateMs,
        title,
      );
      markBackendAiTiming(this.logger, timing, 'ai_service_done');

      if (client.disconnected) return;

      if (result.shortText) {
        this.captureMonitoringRecord({
          mode: 'entry',
          content,
          responseText: result.content,
          fullResponseText: result.fullText ?? result.content,
          shortResponseText: result.shortText,
          tags: result.tags ?? [],
          aiModel,
          mood,
          metrics,
        });

        const donePayload = {
          content: result.content,
          fullText: result.fullText ?? result.content,
          shortText: result.shortText,
          tags: result.tags ?? [],
          serverTimings: timing?.marks,
        };
        logServerMemoryReview({
          step: 3,
          title: 'ВІДПОВІДЬ МОДЕЛІ',
          sourceType: 'entry',
          traceId: timingTraceId,
          userId,
          durationMs: Date.now() - serverFlowStartedAt,
          sections: [
            { label: 'КОРОТКА РЕФЛЕКСІЯ', value: result.shortText },
            {
              label: 'ПОВНА РЕФЛЕКСІЯ',
              value: result.fullText ?? result.content,
            },
          ],
        });
        markBackendAiTiming(this.logger, timing, 'gateway_done_emit_start');
        client.emit('ai_stream_comment_done', donePayload);
        markBackendAiTiming(this.logger, timing, 'gateway_done_emitted');
        return;
      }

      const responseText = result.content || fullResponse;
      this.captureMonitoringRecord({
        mode: 'entry',
        content,
        responseText,
        fullResponseText: result.fullText ?? responseText,
        shortResponseText: result.shortText ?? null,
        tags: result.tags ?? [],
        aiModel,
        mood,
        metrics,
      });

      const donePayload = {
        content: responseText,
        tags: result.tags ?? [],
      };
      logServerMemoryReview({
        step: 3,
        title: 'ВІДПОВІДЬ МОДЕЛІ',
        sourceType: 'entry',
        traceId: timingTraceId,
        userId,
        durationMs: Date.now() - serverFlowStartedAt,
        sections: [{ label: 'ПОВНА РЕФЛЕКСІЯ', value: responseText }],
      });
      client.emit('ai_stream_comment_done', donePayload);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : undefined;

      if (
        client.disconnected ||
        errorMessage === AI_STREAM_CLIENT_DISCONNECTED
      ) {
        return;
      }

      console.error('handleStreamAiComment error:', e);
      this.aiErrorReporter.report({
        operation: 'stream_ai_comment',
        transport: 'websocket',
        error: e,
        userId,
        model: aiModel,
        meta: {
          appVersion: client.data.appVersion,
          appBuild: client.data.appBuild,
          platform: client.data.platform,
        },
      });

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
      timingTraceId?: string;
      contextProtocol?: 'memory_capsules_v2';
      itemDateMs?: number;
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
      timingTraceId,
      contextProtocol,
      itemDateMs,
    } = data;

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_checkin_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    const mode: AiContentMode = 'checkin';
    const timing: BackendAiTimingContext | undefined = timingTraceId
      ? {
          traceId: timingTraceId,
          flow: 'create_checkin',
          startedAtMs: Date.now(),
          marks: [],
        }
      : undefined;
    markBackendAiTiming(this.logger, timing, 'gateway_request_received');

    try {
      let fullResponse = '';
      let firstResponseChunk = true;

      markBackendAiTiming(this.logger, timing, 'ai_service_start');
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
          if (firstResponseChunk) {
            firstResponseChunk = false;
            markBackendAiTiming(this.logger, timing, 'first_chunk_emitted');
          }
          client.emit('ai_stream_checkin_chunk', { text: chunk });
        },
        mode,
        metrics,
        undefined,
        undefined,
        [],
        false,
        generateShortReflection === true,
        timing,
        false,
        contextProtocol,
        itemDateMs,
      );
      markBackendAiTiming(this.logger, timing, 'ai_service_done');

      if (client.disconnected) return;

      if (result.shortText) {
        this.captureMonitoringRecord({
          mode,
          content,
          responseText: result.content,
          fullResponseText: result.fullText ?? result.content,
          shortResponseText: result.shortText,
          tags: result.tags ?? [],
          aiModel,
          mood,
          metrics,
        });

        const donePayload = {
          content: result.content,
          fullText: result.fullText ?? result.content,
          shortText: result.shortText,
          tags: result.tags ?? [],
          serverTimings: timing?.marks,
        };
        logServerMemoryReview({
          step: 3,
          title: 'ВІДПОВІДЬ МОДЕЛІ',
          sourceType: 'checkin',
          traceId: timingTraceId,
          userId,
          sections: [
            { label: 'КОРОТКА РЕФЛЕКСІЯ', value: result.shortText },
            {
              label: 'ПОВНА РЕФЛЕКСІЯ',
              value: result.fullText ?? result.content,
            },
          ],
        });
        client.emit('ai_stream_checkin_done', donePayload);
        markBackendAiTiming(this.logger, timing, 'gateway_done_emitted');
        return;
      }

      const responseText = result.content || fullResponse;
      this.captureMonitoringRecord({
        mode,
        content,
        responseText,
        fullResponseText: result.fullText ?? responseText,
        shortResponseText: result.shortText ?? null,
        tags: result.tags ?? [],
        aiModel,
        mood,
        metrics,
      });

      const donePayload = {
        content: responseText,
        tags: result.tags ?? [],
        serverTimings: timing?.marks,
      };
      logServerMemoryReview({
        step: 3,
        title: 'ВІДПОВІДЬ МОДЕЛІ',
        sourceType: 'checkin',
        traceId: timingTraceId,
        userId,
        sections: [{ label: 'ПОВНА РЕФЛЕКСІЯ', value: responseText }],
      });
      client.emit('ai_stream_checkin_done', donePayload);
      markBackendAiTiming(this.logger, timing, 'gateway_done_emitted');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : undefined;

      if (
        client.disconnected ||
        errorMessage === AI_STREAM_CLIENT_DISCONNECTED
      ) {
        return;
      }

      console.error('handleStreamAiCheckin error:', e);
      this.aiErrorReporter.report({
        operation: 'stream_ai_checkin',
        transport: 'websocket',
        error: e,
        userId,
        model: aiModel,
        meta: {
          mode,
          appVersion: client.data.appVersion,
          appBuild: client.data.appBuild,
          platform: client.data.platform,
        },
      });

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
      contextProtocol?: 'memory_capsules_v2';
      timingTraceId?: string;
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
      contextProtocol,
      timingTraceId,
    } = data;

    const userId = Number(client.user?.id);

    if (!userId) {
      client.emit('ai_stream_dialog_error', {
        statusMessage: 'invalidUserID',
        message: 'invalidUserID',
      });
      return;
    }

    const mode: AiContentMode =
      requestedMode === 'checkin_dialog' ? 'checkin_dialog' : 'dialog';
    const timing: BackendAiTimingContext | undefined = timingTraceId
      ? {
          traceId: timingTraceId,
          flow: mode,
          startedAtMs: Date.now(),
          marks: [],
        }
      : undefined;
    markBackendAiTiming(this.logger, timing, 'gateway_request_received');

    try {
      let fullResponse = '';

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
        false,
        timing,
        false,
        contextProtocol,
      );

      if (client.disconnected) return;

      this.captureMonitoringRecord({
        mode,
        content,
        responseText: fullResponse,
        aiModel,
        mood,
        metrics,
      });

      logServerMemoryReview({
        step: 3,
        title: 'ВІДПОВІДЬ МОДЕЛІ',
        sourceType: mode,
        traceId: timingTraceId,
        userId,
        durationMs: timing ? Date.now() - timing.startedAtMs : undefined,
        sections: [{ label: 'ПОВНА ВІДПОВІДЬ', value: fullResponse }],
      });

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
      this.aiErrorReporter.report({
        operation: 'stream_ai_dialog',
        transport: 'websocket',
        error: e,
        userId,
        model: aiModel,
        meta: {
          mode,
          appVersion: client.data.appVersion,
          appBuild: client.data.appBuild,
          platform: client.data.platform,
        },
      });

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

  private captureMonitoringRecord(params: {
    mode: AiContentMode;
    content: string;
    responseText: string;
    aiModel: AiModel;
    mood: string;
    metrics: EntryMetrics | null;
    fullResponseText?: string | null;
    shortResponseText?: string | null;
    tags?: string[] | null;
  }) {
    void this.aiResponseMonitoringService.captureSafely({
      mode: params.mode,
      entryText: params.content,
      responseText: params.responseText,
      aiModel: params.aiModel,
      mood: params.mood,
      metrics: params.metrics,
      fullResponseText: params.fullResponseText ?? null,
      shortResponseText: params.shortResponseText ?? null,
      tags: params.tags ?? null,
    });
  }
}
