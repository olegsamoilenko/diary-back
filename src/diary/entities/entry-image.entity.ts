import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DiaryEntry } from './diary.entity';

@Entity('entry_images')
@Index(['entryId', 'imageId'], { unique: true })
@Unique('UQ_entry_image_filename', ['entryId', 'filename'])
export class EntryImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  entryId: number;

  @ManyToOne(() => DiaryEntry, (e) => e.images)
  entry: DiaryEntry;

  @Column({ length: 128 })
  imageId: string;

  @Column({ length: 255 })
  filename: string;

  @Column({ length: 64 })
  sha256: string;

  @Column('bigint')
  fileSize: string;

  @Column({ type: 'int', nullable: true })
  width?: number;

  @Column({ type: 'int', nullable: true })
  height?: number;

  @Column({ type: 'timestamptz', nullable: true })
  capturedAt?: Date;

  @Column({ nullable: true })
  assetId?: string;

  @CreateDateColumn()
  createdAt: Date;
}
