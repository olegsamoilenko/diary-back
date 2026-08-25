import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { CreditPurchaseProvider, CreditPurchaseStatus } from '../types';

@Entity('credit_purchases')
@Index('uq_credit_purchases_provider_token', ['provider', 'purchaseToken'], {
  unique: true,
})
export class CreditPurchase {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_credit_purchases_user_id')
  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar' })
  provider!: CreditPurchaseProvider;

  @Index('idx_credit_purchases_product_id')
  @Column({ type: 'varchar' })
  productId!: string;

  @Column({ type: 'varchar', nullable: true })
  purchaseOptionId!: string | null;

  @Column({ type: 'text' })
  purchaseToken!: string;

  @Index('idx_credit_purchases_order_id')
  @Column({ type: 'varchar', nullable: true })
  orderId!: string | null;

  @Index('idx_credit_purchases_status')
  @Column({ type: 'varchar' })
  status!: CreditPurchaseStatus;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'int' })
  creditsGranted!: number;

  @Column({ type: 'int', default: 0 })
  creditsRevoked!: number;

  @Column({ type: 'varchar', nullable: true })
  regionCode!: string | null;

  @Column({ type: 'varchar', nullable: true })
  obfuscatedAccountId!: string | null;

  @Column({ type: 'boolean', default: false })
  testPurchase!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  purchasedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  rawStoreData!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
