import { EntryMetrics } from 'src/common/types/metrics';
import { AiModel } from 'src/users/types';
import { AiResponseMonitoringMode } from '../types/ai-response-monitoring-mode';

export class CaptureAiResponseMonitoringDto {
  mode: AiResponseMonitoringMode;
  entryText: string;
  responseText: string;
  aiModel: AiModel;
  mood?: string | null;
  metrics?: EntryMetrics | null;
  fullResponseText?: string | null;
  shortResponseText?: string | null;
  tags?: string[] | null;
}
