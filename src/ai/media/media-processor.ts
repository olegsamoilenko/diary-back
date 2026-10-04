import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { writeContextAudit } from '../../logs/context-audit';
import {
  MEDIA_POLICY,
  MediaKind,
  MediaMetadata,
  fitMediaImage,
  videoFrameTimes,
} from './media-policy';

const exec = promisify(execFile);
const INPUT_FORMATS =
  'jpeg_pipe,png_pipe,webp_pipe,mov,mp3,wav,matroska,webm,ogg,flac,aac';
export type PreparedImage = {
  base64: string;
  width: number;
  height: number;
  atSeconds?: number;
};
export type PreparedMedia = {
  images: PreparedImage[];
  audioBase64?: string;
  transcript?: string;
  transcriptionUsage?: { inputTokens: number; outputTokens: number };
};
type Probe = {
  streams?: {
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    side_data_list?: { rotation?: number }[];
    tags?: { rotate?: string };
  }[];
  format?: { duration?: string };
};

@Injectable()
export class MediaProcessor {
  private async run(binary: 'ffmpeg' | 'ffprobe', args: string[]) {
    try {
      return await exec(
        process.env[binary === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'] ||
          binary,
        ['-format_whitelist', INPUT_FORMATS, ...args],
        { timeout: 60_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new ServiceUnavailableException('MEDIA_PROCESSOR_UNAVAILABLE');
      throw new BadRequestException('MEDIA_DECODE_FAILED');
    }
  }
  async prepare(
    buffer: Buffer,
    kind: MediaKind,
    assetId?: string,
  ): Promise<{ metadata: MediaMetadata; payload: PreparedMedia }> {
    const startedAt = Date.now();
    let previousAt = startedAt;
    const mark = (phase: string, details: Record<string, unknown> = {}) => {
      const now = Date.now();
      writeContextAudit('timing.media.backend', {
        assetId,
        kind,
        phase,
        elapsedMs: now - startedAt,
        phaseDurationMs: now - previousAt,
        ...details,
      });
      previousAt = now;
    };
    mark('processor_start', { bytes: buffer.length });
    if (!buffer.length || buffer.length > MEDIA_POLICY.maxUploadBytes)
      throw new BadRequestException('MEDIA_FILE_TOO_LARGE');
    const directory = await mkdtemp(join(tmpdir(), 'nemory-ai-media-'));
    try {
      const input = join(directory, 'input');
      await writeFile(input, buffer, { mode: 0o600 });
      mark('temporary_file_written');
      const { stdout } = await this.run('ffprobe', [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        input,
      ]);
      const probe = JSON.parse(stdout) as Probe;
      mark('probe_done');
      const video = probe.streams?.find((s) => s.codec_type === 'video');
      const hasAudio =
        probe.streams?.some((s) => s.codec_type === 'audio') === true;
      const duration = Number(probe.format?.duration ?? video?.duration);
      if ((kind !== 'audio' && !video) || (kind === 'audio' && !hasAudio))
        throw new BadRequestException('MEDIA_TYPE_MISMATCH');
      if (
        kind !== 'image' &&
        (!Number.isFinite(duration) ||
          duration <= 0 ||
          duration >
            (kind === 'video'
              ? MEDIA_POLICY.maxVideoSeconds
              : MEDIA_POLICY.maxAudioSeconds))
      )
        throw new BadRequestException('INVALID_MEDIA_DURATION');
      if (
        video &&
        (!video.width ||
          !video.height ||
          video.width * video.height > MEDIA_POLICY.maxSourcePixels)
      )
        throw new BadRequestException('INVALID_MEDIA_DIMENSIONS');
      let width = video?.width ?? 0,
        height = video?.height ?? 0;
      const rotation = Number(
        video?.side_data_list?.find((s) => s.rotation !== undefined)
          ?.rotation ??
          video?.tags?.rotate ??
          0,
      );
      if (Math.abs(rotation % 180) === 90) [width, height] = [height, width];
      const metadata: MediaMetadata = {
        kind,
        ...(video ? { width, height } : {}),
        ...(kind === 'image' ? {} : { durationSeconds: duration, hasAudio }),
      };
      const payload: PreparedMedia = { images: [] };
      if (kind !== 'audio') {
        const size = fitMediaImage(
          width,
          height,
          kind === 'image'
            ? MEDIA_POLICY.photoLongEdge
            : MEDIA_POLICY.videoLongEdge,
        );
        const times = kind === 'image' ? [0] : videoFrameTimes(duration);
        for (const [i, time] of times.entries()) {
          const output = join(directory, `frame-${i}.jpg`);
          await this.run('ffmpeg', [
            '-v',
            'error',
            '-nostdin',
            '-threads',
            '1',
            '-protocol_whitelist',
            'file,pipe',
            ...(kind === 'video' ? ['-ss', String(time)] : []),
            '-i',
            input,
            '-map',
            '0:v:0',
            '-frames:v',
            '1',
            '-vf',
            `scale=${size.width}:${size.height}`,
            '-q:v',
            '3',
            '-map_metadata',
            '-1',
            output,
          ]);
          const image = await readFile(output);
          if (image.length > 2 * 1024 * 1024)
            throw new BadRequestException('MEDIA_IMAGE_TOO_LARGE');
          payload.images.push({
            base64: image.toString('base64'),
            ...size,
            ...(kind === 'video' ? { atSeconds: time } : {}),
          });
        }
        mark('frames_done', { count: payload.images.length });
      }
      if (kind !== 'image' && hasAudio) {
        const output = join(directory, 'speech.mp3');
        await this.run('ffmpeg', [
          '-v',
          'error',
          '-nostdin',
          '-threads',
          '1',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          input,
          '-vn',
          '-map',
          '0:a:0',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-b:a',
          '32k',
          '-map_metadata',
          '-1',
          output,
        ]);
        payload.audioBase64 = (await readFile(output)).toString('base64');
        mark('audio_extraction_done');
      }
      return { metadata, payload };
    } finally {
      mark('processor_finished');
      // Only the freshly allocated temporary child may be removed recursively.
      const target = resolve(directory);
      if (
        target.startsWith(resolve(tmpdir()) + sep) &&
        target.includes('nemory-ai-media-')
      )
        await rm(target, { recursive: true, force: true });
    }
  }
}
