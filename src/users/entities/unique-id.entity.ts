import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('unique_ids')
export class UniqueId {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  uniqueId: string;
}
