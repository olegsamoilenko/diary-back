import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('forum_public_profiles')
export class ForumPublicProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ name: 'display_name', type: 'varchar', length: 80 })
  displayName: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  username: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  bio: string | null;

  @Index()
  @Column({ name: 'is_forum_enabled', type: 'boolean', default: true })
  isForumEnabled: boolean;

  @Column({ name: 'allow_direct_messages', type: 'boolean', default: true })
  allowDirectMessages: boolean;

  @Index()
  @Column({ name: 'is_banned', type: 'boolean', default: false })
  isBanned: boolean;

  @Column({ name: 'ban_reason', type: 'text', nullable: true })
  banReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
