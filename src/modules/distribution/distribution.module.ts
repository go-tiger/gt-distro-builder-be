import { Module } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { DistributionController } from './distribution.controller';

@Module({
  providers: [DistributionService],
  controllers: [DistributionController]
})
export class DistributionModule {}
