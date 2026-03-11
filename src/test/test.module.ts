import { Module } from '@nestjs/common';
import { TestService } from './test.service';
import { TestController } from './test.controller';
import { GeoAccessModule } from '../common/geo-access/geo-access.module';

@Module({
  imports: [GeoAccessModule],
  providers: [TestService],
  controllers: [TestController],
})
export class TestModule {}
