import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Unique,
  OneToMany,
} from 'typeorm';
import { DiaryEntry } from '../../diary/entities/diary.entity';

@Entity()
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  uuid: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true, type: 'text' })
  passwordResetToken: string | null;

  @Column({ nullable: true, type: 'text' })
  passwordChangeToken?: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true, type: 'text' })
  emailVerificationToken: string | null;

  @OneToMany(() => DiaryEntry, (diaryEntry) => diaryEntry.user)
  diaryEntries: DiaryEntry[];
}
