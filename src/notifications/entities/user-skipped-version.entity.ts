import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Platform } from 'src/common/types/platform';
import { User } from 'src/users/entities/user.entity';

@Entity('user_skipped_versions')
@Unique('uniq_user_platform_build', ['user', 'platform', 'build'])
export class UserSkippedVersion {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => User, (user) => user.skippedVersions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  user: User;

  @Column()
  platform: Platform;

  @Column({ type: 'int' })
  build: number;

  @CreateDateColumn() createdAt: Date;
}
