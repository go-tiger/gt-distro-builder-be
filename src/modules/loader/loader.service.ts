import { Injectable } from '@nestjs/common';

@Injectable()
export class LoaderService {
  async getForgeVersions(mcVersion: string): Promise<string[]> {
    try {
      const res = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const data = await res.json();
      const result: string[] = [];
      const recommended = data.promos[`${mcVersion}-recommended`];
      const latest = data.promos[`${mcVersion}-latest`];
      if (recommended) result.push(`${mcVersion}-${recommended} (recommended)`);
      if (latest && latest !== recommended) result.push(`${mcVersion}-${latest} (latest)`);
      return result;
    } catch (error) {
      console.error(`[LoaderService] Forge 버전 조회 오류 (${mcVersion}):`, error);
      return [];
    }
  }
}
