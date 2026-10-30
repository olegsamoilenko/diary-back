import { Column, Entity, PrimaryColumn } from 'typeorm';

// One ordering cursor per existing installation signing key. Keeping it after
// logout prevents a delayed registration from resurrecting that binding.
@Entity('push_device_states')
export class PushDeviceState {
  @PrimaryColumn({ length: 64 })
  keyHash: string;

  @Column({ type: 'text' })
  publicKey: string;

  @Column({ type: 'bigint' })
  revision: string;

  @Column({ length: 64 })
  requestHash: string;
}
