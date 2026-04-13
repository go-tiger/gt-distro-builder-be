import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ModrinthModule } from './modules/modrinth/modrinth.module';
import { CacheModule } from './modules/cache/cache.module';
import { DistributionModule } from './modules/distribution/distribution.module';

@Module({
  imports: [ModrinthModule, CacheModule, DistributionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
