import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ForumUserRestrictionType } from '../types/forum-user-restriction-type.enum';
import { Admin } from 'src/admins/entities/admin.entity';

@Entity('forum_user_restrictions')
export class ForumUserRestriction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: ForumUserRestrictionType,
  })
  type: ForumUserRestrictionType;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'violation_count', type: 'int', default: 0 })
  violationCount: number;

  @Column({ name: 'created_by_admin_id', type: 'int' })
  createdByAdminId: number;

  @ManyToOne(() => Admin)
  @JoinColumn({ name: 'created_by_admin_id' })
  createdByAdmin: Admin;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'lifted_at', type: 'timestamptz', nullable: true })
  liftedAt: Date | null;

  @Column({ name: 'lifted_by_admin_id', type: 'int', nullable: true })
  liftedByAdminId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
