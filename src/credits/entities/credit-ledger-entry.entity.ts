import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { CreditLedgerEntryType } from '../types';
import { CreditPurchase } from './credit-purchase.entity';
import { CreditWallet } from './credit-wallet.entity';

@Entity('credit_ledger_entries')
export class CreditLedgerEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_credit_ledger_entries_user_id')
  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Index('idx_credit_ledger_entries_wallet_id')
  @Column()
  walletId!: number;

  @ManyToOne(() => CreditWallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet!: CreditWallet;

  @Index('idx_credit_ledger_entries_purchase_id')
  @Column({ type: 'int', nullable: true })
  purchaseId!: number | null;

  @ManyToOne(() => CreditPurchase, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'purchaseId' })
  purchase!: CreditPurchase | null;

  @Index('idx_credit_ledger_entries_type')
  @Column({ type: 'varchar' })
  type!: CreditLedgerEntryType;

  @Column({ type: 'int' })
  amount!: number;

  @Column({ type: 'int' })
  balanceAfter!: number;

  @Index('uq_credit_ledger_entries_idempotency_key', { unique: true })
  @Column({ type: 'varchar' })
  idempotencyKey!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
