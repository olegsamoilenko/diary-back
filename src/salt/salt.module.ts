import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Salt } from './entities/salt.entity';
import { SaltService } from './salt.service';

@Module({
  imports: [TypeOrmModule.forFeature([Salt])],
  providers: [SaltService],
  controllers: [],
  exports: [SaltService],
})
export class SaltModule {}
