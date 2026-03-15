import { Module } from '@nestjs/common';
import { UserMonitoringService } from './user-monitoring.service';
import { UserMonitoringController } from './user-monitoring.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserMonitoring } from './entities/user-monitoring.entity';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserMonitoring]), UsersModule],
  controllers: [UserMonitoringController],
  providers: [UserMonitoringService],
})
export class UserMonitoringModule {}
