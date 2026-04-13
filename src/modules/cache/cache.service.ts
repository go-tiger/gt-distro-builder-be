import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ModCache } from '../../common/entities/mod-cache.entity';

@Injectable()
export class CacheService {
  private readonly ttlHours: number;

  constructor(
    @InjectRepository(ModCache)
    private modCacheRepository: Repository<ModCache>,
    private configService: ConfigService,
  ) {
    this.ttlHours = this.configService.get<number>('CACHE_TTL_HOURS', 24);
  }

  async get(
    slug: string,
    loader: string,
    version: string,
  ): Promise<Record<string, unknown> | null> {
    const cache = await this.modCacheRepository.findOne({
      where: { slug, loader, minecraftVersion: version },
    });

    if (!cache) return null;

    const expiryDate = new Date(cache.updatedAt);
    expiryDate.setHours(expiryDate.getHours() + this.ttlHours);

    if (new Date() > expiryDate) {
      await this.modCacheRepository.remove(cache);
      return null;
    }

    return cache.data;
  }

  async set(
    slug: string,
    loader: string,
    version: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    let cache = await this.modCacheRepository.findOne({
      where: { slug, loader, minecraftVersion: version },
    });

    if (cache) {
      cache.data = data;
    } else {
      cache = this.modCacheRepository.create({
        slug,
        loader,
        minecraftVersion: version,
        data,
      });
    }

    await this.modCacheRepository.save(cache);
  }

  async clearExpired(): Promise<void> {
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() - this.ttlHours);

    await this.modCacheRepository.delete({
      updatedAt: LessThan(expiryDate),
    });
  }
}
