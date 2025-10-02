import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('user_sessions')
@Index(['userId', 'deviceId'], { unique: true })
export class UserSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.sessions)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ length: 64 })
  deviceId: string;

  @Column({ type: 'text' })
  refreshTokenHash: string;

  @Column({ type: 'text', nullable: true })
  devicePubKey: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ed25519' })
  deviceKeyAlg: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastUsedAt: Date;
}
