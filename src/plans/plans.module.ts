import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Plan]), UsersModule],
  providers: [PlansService],
  controllers: [PlansController],
  exports: [PlansService],
})
export class PlansModule {}
