import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { AiModel, TimeFormat, Lang, Font, Theme } from '../types';

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

  @Column({ type: 'varchar', length: 255, default: null })
  lang: Lang;

  @Column({ type: 'varchar', length: 255, default: AiModel.GPT_5 })
  aiModel: AiModel;

  @OneToOne(() => User, (user) => user.settings)
  @JoinColumn()
  user: User;
}
