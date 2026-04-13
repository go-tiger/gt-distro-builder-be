import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchModDto } from '../../common/dto/search-mod.dto';
import {
  ModrinthSearchResult,
  ModrinthVersion,
} from '../../common/types/modrinth.types';

@Injectable()
export class ModrinthService {
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>(
      'MODRINTH_API_URL',
      'https://api.modrinth.com/v2',
    );
  }

  async searchMods(searchDto: SearchModDto): Promise<ModrinthSearchResult> {
    const { query, loader, version, limit = 20, offset = 0 } = searchDto;

    const facets = JSON.stringify([
      [`categories:${loader}`],
      [`versions:${version}`],
      ['project_type:mod'],
    ]);

    const params = new URLSearchParams({
      query,
      facets,
      limit: limit.toString(),
      offset: offset.toString(),
    });

    const response = await fetch(`${this.apiUrl}/search?${params}`);

    if (!response.ok) {
      throw new Error('Modrinth API request failed');
    }

    return response.json() as Promise<ModrinthSearchResult>;
  }

  async getModDetails(slug: string): Promise<ModrinthVersion> {
    const response = await fetch(`${this.apiUrl}/project/${slug}`);

    if (!response.ok) {
      throw new Error('Failed to fetch mod details');
    }

    return response.json() as Promise<ModrinthVersion>;
  }

  async getModVersions(
    slug: string,
    loader: string,
    gameVersion: string,
  ): Promise<ModrinthVersion[]> {
    const params = new URLSearchParams({
      loaders: JSON.stringify([loader]),
      game_versions: JSON.stringify([gameVersion]),
    });

    const response = await fetch(
      `${this.apiUrl}/project/${slug}/version?${params}`,
    );

    if (!response.ok) {
      throw new Error('Failed to fetch mod versions');
    }

    return response.json() as Promise<ModrinthVersion[]>;
  }
}
