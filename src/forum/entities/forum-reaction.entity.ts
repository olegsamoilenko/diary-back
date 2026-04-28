import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ForumReactionTargetType } from '../types/forum-reaction-target-type.enum';
import { ForumReactionType } from '../types/forum-reaction-type.enum';
import { User } from 'src/users/entities/user.entity';

@Entity('forum_reactions')
@Unique('UQ_forum_reactions_user_target', ['userId', 'targetType', 'targetId'])
@Index(['targetType', 'targetId'])
@Index(['userId', 'createdAt'])
export class ForumReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, (user) => user.forumReactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ForumReactionTargetType,
  })
  targetType: ForumReactionTargetType;

  @Index()
  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Index()
  @Column({
    name: 'reaction_type',
    type: 'enum',
    enum: ForumReactionType,
  })
  reactionType: ForumReactionType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
