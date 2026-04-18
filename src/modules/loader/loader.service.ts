import { Injectable } from '@nestjs/common';

@Injectable()
export class LoaderService {
  async getForgeVersions(mcVersion: string): Promise<string[]> {
    try {
      // 1. promotions에서 recommended/latest 조회
      const promosRes = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const promosData = await promosRes.json();
      const result: string[] = [];

      const recommended = promosData.promos[`${mcVersion}-recommended`];
      const latest = promosData.promos[`${mcVersion}-latest`];

      if (recommended) result.push(`${mcVersion}-${recommended} (recommended)`);
      if (latest && latest !== recommended) result.push(`${mcVersion}-${latest} (latest)`);

      // 2. Maven 메타데이터에서 모든 버전 조회
      const res = await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
      const text = await res.text();

      // XML 파싱: <version>1.21.1-52.1.0</version> 추출
      const versionRegex = /<version>([^<]+)<\/version>/g;
      const allVersions: string[] = [];
      let match: RegExpExecArray | null;

      while ((match = versionRegex.exec(text)) !== null) {
        const version = match[1];
        // mcVersion과 일치하고, recommended/latest가 아닌 버전만 필터링
        if (version.startsWith(`${mcVersion}-`) && version !== `${mcVersion}-${recommended}` && version !== `${mcVersion}-${latest}`) {
          allVersions.push(version);
        }
      }

      // 역순 정렬 (최신 버전이 먼저)
      allVersions.sort((a, b) => {
        const aParts = a.split('-')[1].split('.').map(Number);
        const bParts = b.split('-')[1].split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal !== bVal) return bVal - aVal;
        }
        return 0;
      });

      return [...result, ...allVersions];
    } catch (error) {
      console.error(`[LoaderService] Forge 버전 조회 오류 (${mcVersion}):`, error);
      return [];
    }
  }

  async getNeoForgeVersions(mcVersion: string): Promise<string[]> {
    try {
      const res = await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
      const text = await res.text();

      const versionRegex = /<version>([^<]+)<\/version>/g;
      const allVersions: string[] = [];
      let match: RegExpExecArray | null;

      // mcVersion에서 앞자리 제거: "1.21.1" → "21.1."
      const prefix = mcVersion.split('.').slice(1).join('.') + '.';

      const excluded = ['20.2.89', '20.2.90', '20.2.91', '20.2.92'];

      while ((match = versionRegex.exec(text)) !== null) {
        const version = match[1];
        if (version.startsWith(prefix) && !excluded.includes(version)) {
          allVersions.push(version);
        }
      }

      // 역순 정렬
      allVersions.sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal !== bVal) return bVal - aVal;
        }
        return 0;
      });

      return allVersions;
    } catch (error) {
      console.error(`[LoaderService] NeoForge 버전 조회 오류 (${mcVersion}):`, error);
      return [];
    }
  }
}
