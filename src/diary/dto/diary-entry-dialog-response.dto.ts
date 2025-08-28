import { CipherBlobV1 } from 'src/kms/types';

export class DiaryEntryDialogResponseDto {
  id: number;
  uuid: string;
  question: CipherBlobV1;
  answer: CipherBlobV1;
  loading: boolean;
  createdAt: Date;
}
