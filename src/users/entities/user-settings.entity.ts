import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { AiModel, TimeFormat, DateFormat, Lang, Font, Theme } from '../types';
import { Platform } from 'src/common/types/platform';

@Entity('user_settings')
export class UserSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, default: null })
  theme: Theme;

  @Column({ type: 'varchar', length: 255, default: Font.NUNITO })
  font: Font;

  @Column({ type: 'varchar', length: 255, default: TimeFormat['12_H'] })
  timeFormat: TimeFormat;

  @Column({ type: 'varchar', length: 255, default: DateFormat.DMY })
  dateFormat: DateFormat;

  @Column({ type: 'varchar', length: 255, default: null })
  lang: Lang;

  @Column({ type: 'varchar', length: 255, default: AiModel.GPT_5 })
  aiModel: AiModel;

  @OneToOne(() => User, (user) => user.settings)
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  appBuild: number;

  @Column({ type: 'varchar', length: 100 })
  appVersion: string;

  @Column({ type: 'enum', enum: Platform })
  platform: Platform;

  @Column({ type: 'varchar', length: 100 })
  locale: string;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ type: 'varchar', length: 100 })
  osVersion: string;

  @Column({ type: 'varchar', length: 100 })
  osBuildId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  uniqueId: string | null;
}
