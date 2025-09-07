import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AdminRole } from '../types';

@Entity('admins')
@Unique(['email'])
export class Admin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.ADMIN })
  role: AdminRole;

  @Column({ type: 'boolean', default: false })
  active: boolean;

  @Column({ default: 'admin' })
  type: string;
}
