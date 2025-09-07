import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './entities/admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Admin])],
  providers: [AdminsService],
  controllers: [AdminsController],
  exports: [AdminsService],
})
export class AdminsModule {}
