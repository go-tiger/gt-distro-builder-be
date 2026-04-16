import { Module } from '@nestjs/common';
import { ModrinthModule } from '../modrinth/modrinth.module';
import { UsersModule } from '../users/users.module';
import { CacheModule } from '../cache/cache.module';
import { DistributionService } from './distribution.service';
import { DistributionController } from './distribution.controller';

@Module({
  imports: [ModrinthModule, UsersModule, CacheModule],
  providers: [DistributionService],
  controllers: [DistributionController],
})
export class DistributionModule {}
