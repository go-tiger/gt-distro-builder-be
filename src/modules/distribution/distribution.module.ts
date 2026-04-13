import { Module } from '@nestjs/common';
import { ModrinthModule } from '../modrinth/modrinth.module';
import { DistributionService } from './distribution.service';
import { DistributionController } from './distribution.controller';

@Module({
  imports: [ModrinthModule],
  providers: [DistributionService],
  controllers: [DistributionController],
})
export class DistributionModule {}
