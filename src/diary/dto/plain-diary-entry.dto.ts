import { PlainDiaryEntryDialogDto } from './plain-diary-entry-dialog.dto';
import { PlainAiCommentDto } from 'src/ai/dto/plain-ai-comment.dto';
import { CipherBlobV1 } from 'src/kms/types';

export class PlainDiaryEntryDto {
  id: number;
  title?: string;
  content: string;
  mood?: string;
  dialogs: PlainDiaryEntryDialogDto[];
  aiComment?: PlainAiCommentDto;
  prompt?: CipherBlobV1;
  createdAt: Date;
}
