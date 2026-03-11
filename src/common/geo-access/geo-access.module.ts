import { Module } from '@nestjs/common';
import { GeoAccessService } from './geo-access.service';
import { BlockedCountriesGuard } from './blocked-countries.guard';

@Module({
  providers: [GeoAccessService, BlockedCountriesGuard],
  exports: [GeoAccessService, BlockedCountriesGuard],
})
export class GeoAccessModule {}
