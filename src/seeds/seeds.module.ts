import { Module } from '@nestjs/common';
import { SeedsController } from './seeds.controller';
import { SeedsService } from './seeds.service';
import { AiModule } from 'src/ai/ai.module';
import { PlansModule } from 'src/plans/plans.module';
import { UsersModule } from 'src/users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [AiModule, PlansModule, UsersModule],
  providers: [SeedsService],
  controllers: [SeedsController],
  exports: [],
})
export class SeedsModule {}
