import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModCache } from '../../common/entities/mod-cache.entity';
import { CacheService } from './cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModCache])],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
