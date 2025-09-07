import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS',
      useFactory: () => new Redis(process.env.REDIS_URL!),
    },
  ],
  exports: ['REDIS'],
})
export class RedisModule {}
