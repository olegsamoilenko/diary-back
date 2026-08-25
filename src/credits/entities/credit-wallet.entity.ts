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

@Entity('credit_wallets')
export class CreditWallet {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('uq_credit_wallets_user_id', { unique: true })
  @Column()
  userId!: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'int', default: 0 })
  balance!: number;

  @Column({ type: 'int', default: 0 })
  totalPurchased!: number;

  @Column({ type: 'int', default: 0 })
  totalSpent!: number;

  @Column({ type: 'int', default: 0 })
  totalRevoked!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
