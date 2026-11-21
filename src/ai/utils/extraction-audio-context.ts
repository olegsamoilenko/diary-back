import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ExtractionAudioContextDto } from '../dto/extraction-audio-context.dto';
import type { MediaAnalysisService } from '../media/media-analysis.service';

/** Enrich request data, not instructions. Keep historical speech separate from
 * the current authorization; never use the assistant's paraphrase as speech. */
export async function withExtractionAudioContext<
  T extends {
    audioContext?: ExtractionAudioContextDto;
    userText?: string;
    plannerContext?: string;
  },
>(userId: number, dto: T, media?: MediaAnalysisService): Promise<T> {
  const context = dto.audioContext;
  if (!context) return dto;
  if (JSON.stringify(context).length > 60000)
    throw new BadRequestException('AUDIO_CONTEXT_TOO_LARGE');
  if (
    context.history.some(
      (turn) => turn.role === 'assistant' && turn.mediaIds.length,
    )
  )
    throw new BadRequestException('INVALID_AUDIO_CONTEXT_ROLE');
  const ids = [
    ...new Set([
      ...context.currentIds,
      ...context.history.flatMap((turn) => turn.mediaIds),
    ]),
  ];
  if (!ids.length) return dto;
  if (!media) throw new ConflictException('AUDIO_CONTEXT_UNAVAILABLE');
  const transcripts = await media.readReadyAudioTranscripts(userId, ids);
  const append = (text: string, mediaIds: string[]) =>
    [
      text,
      ...mediaIds.map(
        (id) =>
          `[Speech transcript (may contain recognition errors)]\n${transcripts[id]}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
  const history = context.history.map((turn) => ({
    role: turn.role,
    text: append(turn.text, turn.mediaIds),
  }));
  const userText = append(dto.userText ?? '', context.currentIds);
  const plannerContext = history.some(
    (_, i) => context.history[i].mediaIds.length,
  )
    ? JSON.stringify({
        history: dto.plannerContext ?? null,
        audioHistory: history,
      })
    : dto.plannerContext;
  if (userText.length > 60000 || (plannerContext?.length ?? 0) > 120000)
    throw new BadRequestException('AUDIO_CONTEXT_TOO_LARGE');
  return { ...dto, userText, plannerContext };
}
