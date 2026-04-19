import { Injectable } from '@nestjs/common';

@Injectable()
export class LoaderService {
  async getForgeVersions(mcVersion: string): Promise<string[]> {
    try {
      // 1. promotions에서 recommended/latest 조회
      const promosRes = await fetch(
        'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
      );
      const promosData = await promosRes.json();
      const result: string[] = [];

      const recommended = promosData.promos[`${mcVersion}-recommended`];
      const latest = promosData.promos[`${mcVersion}-latest`];

      if (recommended) result.push(`${mcVersion}-${recommended} (recommended)`);
      if (latest && latest !== recommended)
        result.push(`${mcVersion}-${latest} (latest)`);

      // 2. Maven 메타데이터에서 모든 버전 조회
      const res = await fetch(
        'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
      );
      const text = await res.text();

      // XML 파싱: <version>1.21.1-52.1.0</version> 추출
      const versionRegex = /<version>([^<]+)<\/version>/g;
      const allVersions: string[] = [];
      let match: RegExpExecArray | null;

      while ((match = versionRegex.exec(text)) !== null) {
        const version = match[1];
        // mcVersion과 일치하고, recommended/latest가 아닌 버전만 필터링
        if (
          version.startsWith(`${mcVersion}-`) &&
          version !== `${mcVersion}-${recommended}` &&
          version !== `${mcVersion}-${latest}`
        ) {
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
      console.error(
        `[LoaderService] Forge 버전 조회 오류 (${mcVersion}):`,
        error,
      );
      return [];
    }
  }

  async getNeoForgeVersions(mcVersion: string): Promise<string[]> {
    try {
      const res = await fetch(
        'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
      );
      const text = await res.text();

      const versionRegex = /<version>([^<]+)<\/version>/g;
      const allVersions: string[] = [];
      let match: RegExpExecArray | null;

      // "1.21.1" → "21.1", "26.1" → "26.1.0", "26.1.1" → "26.1.1"
      let prefix: string;
      if (mcVersion.startsWith('1.')) {
        prefix = mcVersion.split('.').slice(1).join('.') + '.';
      } else {
        const parts = mcVersion.split('.');
        if (parts.length === 2) {
          // "26.1" → 26.1.0.x
          prefix = `${mcVersion}.0.`;
        } else {
          // "26.1.1" → 26.1.1.x
          prefix = `${mcVersion}.`;
        }
      }

      const excluded = [
        '20.2.89',
        '20.2.90',
        '20.2.91',
        '20.2.92',
        '20.4.0-beta',
        '20.4.2-beta',
        '20.4.17-beta',
        '20.4.18-beta',
        '20.4.19-beta',
        '20.4.24-beta',
        '20.4.30-beta',
        '20.4.38-beta',
        '20.4.41-beta',
        '20.4.43-beta',
        '20.4.48-beta',
        '20.4.53-beta',
        '20.4.54-beta',
        '20.4.57-beta',
        '20.4.58-beta',
        '20.4.67-beta',
        '20.4.69-beta',
        '20.4.73-beta',
        '20.4.75-beta',
        '20.4.9-beta',
      ];

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
      console.error(
        `[LoaderService] NeoForge 버전 조회 오류 (${mcVersion}):`,
        error,
      );
      return [];
    }
  }
}
