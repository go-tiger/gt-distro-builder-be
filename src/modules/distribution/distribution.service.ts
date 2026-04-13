import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ModrinthService } from '../modrinth/modrinth.service';
import { GenerateDistributionDto } from '../../common/dto/generate-distribution.dto';
import { ModrinthFile } from '../../common/types/modrinth.types';

@Injectable()
export class DistributionService {
  constructor(private modrinthService: ModrinthService) {}

  async generateDistribution(dto: GenerateDistributionDto) {
    const modules: {
      id: string;
      name: string;
      type: string;
      artifact: { size: number; MD5: string; url: string };
      required: { value: boolean };
    }[] = [];

    for (const mod of dto.mods) {
      const versions = await this.modrinthService.getModVersions(
        mod.slug,
        dto.loader,
        dto.minecraftVersion,
      );

      if (!versions || versions.length === 0) {
        throw new Error(`No version found for mod: ${mod.slug}`);
      }

      const version = versions[0];
      const file: ModrinthFile =
        version.files.find((f) => f.primary) ?? version.files[0];
      const md5 = await this.calculateMD5(file.url);

      modules.push({
        id: `${mod.slug}@${version.version_number}`,
        name: version.name,
        type: 'ForgeMod',
        artifact: {
          size: file.size,
          MD5: md5,
          url: file.url,
        },
        required: {
          value: mod.required,
        },
      });
    }

    return {
      version: '1.0.0',
      servers: [
        {
          id: dto.serverId,
          name: dto.serverName,
          description: `Minecraft ${dto.minecraftVersion} with ${dto.loader}`,
          mainServer: true,
          autoconnect: true,
          modules,
        },
      ],
    };
  }

  private async calculateMD5(url: string): Promise<string> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const hash = crypto.createHash('md5');
    hash.update(Buffer.from(buffer));
    return hash.digest('hex');
  }
}
