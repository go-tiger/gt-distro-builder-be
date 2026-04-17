import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GenerateDistributionDto } from '../../common/dto/generate-distribution.dto';
import { ModrinthService } from '../modrinth/modrinth.service';

@Injectable()
export class DistributionService {
  private nebulaCli: string;
  private nebulaRoot: string;

  constructor(
    private configService: ConfigService,
    private modrinthService: ModrinthService,
  ) {
    this.nebulaCli = this.configService.get<string>('NEBULA_CLI_PATH', '/app/nebula/dist/index.js');
    this.nebulaRoot = this.configService.get<string>('NEBULA_WORKSPACE_PATH', path.join(os.tmpdir(), 'nebula-workspace'));
  }

  async generateDistribution(dto: GenerateDistributionDto) {
    const workspaceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workspaceDir = path.join(this.nebulaRoot, workspaceId);

    try {
      console.log(`[Nebula] 워크스페이스 생성: ${workspaceDir}`);
      fs.mkdirSync(workspaceDir, { recursive: true });

      const envFilePath = path.join(workspaceDir, '.env');
      const envContent = this._generateEnvFile(workspaceDir, dto);
      fs.writeFileSync(envFilePath, envContent);
      console.log(`[Nebula] .env 파일 생성 완료`);

      await this._executeNebula('init', 'root', workspaceDir);
      console.log(`[Nebula] init root 완료`);

      const loaderFlag = dto.loader === 'fabric' ? '--fabric' : '--forge';
      // Forge 버전 형식: "1.21.1-52.1.14" → "52.1.14"만 추출
      // Fabric 버전 형식: "0.19.2" (이미 올바름)
      let loaderVersionArg = dto.loaderVersion;
      if (dto.loader === 'forge') {
        const parts = dto.loaderVersion.split('-');
        loaderVersionArg = parts.slice(1).join('-');
      }

      await this._executeNebula(
        'generate',
        'server',
        dto.serverId,
        dto.minecraftVersion,
        loaderFlag,
        loaderVersionArg,
        workspaceDir,
      );
      console.log(`[Nebula] generate server 완료`);

      const loaderFolderName = dto.loader === 'fabric' ? 'fabricmods' : 'forgemods';
      const fileUrlMap = await this._downloadMods(workspaceDir, loaderFolderName, dto.mods, dto.loader, dto.minecraftVersion, dto.serverId);
      console.log(`[Nebula] 모드 다운로드 완료`);

      this._generateMetaFiles(workspaceDir, dto);
      console.log(`[Nebula] meta 파일 생성 완료`);

      await this._executeNebula('generate', 'distro', workspaceDir);
      console.log(`[Nebula] generate distro 완료`);

      const distroPath = path.join(workspaceDir, 'distribution.json');
      console.log(`[Nebula] 경로: ${distroPath}`);
      console.log(`[Nebula] 파일 존재: ${fs.existsSync(distroPath)}`);

      if (!fs.existsSync(distroPath)) {
        const files = fs.readdirSync(workspaceDir, { recursive: true });
        console.log(`[Nebula] 워크스페이스 파일:`, files);
        throw new Error(`distribution.json을 찾을 수 없습니다`);
      }

      const distribution = JSON.parse(fs.readFileSync(distroPath, 'utf-8'));
      console.log(`[Nebula] distribution.json 파싱 완료`);

      await this._replaceModUrlsWithModrinth(distribution, dto.mods, fileUrlMap);
      console.log(`[Nebula] URL 변환 완료`);

      return distribution;
    } catch (error) {
      console.error(`[Nebula] 오류:`, error);
      throw new BadRequestException(
        `Distribution 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      console.log(`[Nebula] 워크스페이스 유지: ${workspaceDir}`);
      // this._cleanupWorkspace(workspaceDir);
    }
  }

  private async _downloadMods(
    workspaceDir: string,
    loaderFolderName: string,
    mods: Array<{ slug: string; name: string; version: string; required: boolean; option?: string }>,
    loader: string,
    minecraftVersion: string,
    serverId: string,
  ): Promise<Map<string, string>> {
    const baseModsDir = path.join(workspaceDir, 'servers', `${serverId}-${minecraftVersion}`, loaderFolderName);
    fs.mkdirSync(baseModsDir, { recursive: true });

    const optionMap: Record<string, string> = {
      'required': 'required',
      'optional-on': 'optionalon',
      'optional-off': 'optionaloff',
    };

    // 파일명 → Modrinth URL 맵
    const fileUrlMap = new Map<string, string>();

    for (const mod of mods) {
      try {
        const versions = await this.modrinthService.getModVersions(mod.slug, loader, minecraftVersion);
        const targetVersion = versions.find(v => v.version_number === mod.version);

        if (!targetVersion || !targetVersion.files || targetVersion.files.length === 0) {
          console.warn(`[Nebula] 모드를 찾을 수 없음: ${mod.slug} ${mod.version}`);
          continue;
        }

        const file = targetVersion.files[0];
        const downloadUrl = file.url;
        const fileName = file.filename;

        fileUrlMap.set(fileName, downloadUrl);

        const folderName = mod.option ? optionMap[mod.option] || 'required' : 'required';
        const modFolder = path.join(baseModsDir, folderName);
        fs.mkdirSync(modFolder, { recursive: true });

        const filePath = path.join(modFolder, fileName);

        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`다운로드 실패: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));
        console.log(`[Nebula] 모드 다운로드 (${folderName}): ${fileName}`);
      } catch (error) {
        console.error(`[Nebula] 모드 다운로드 오류 (${mod.slug}):`, error);
      }
    }

    return fileUrlMap;
  }

  private _generateEnvFile(workspaceDir: string, dto: GenerateDistributionDto): string {
    const javaExecutable = this.configService.get<string>('JAVA_EXECUTABLE', 'java');
    return `ROOT=${workspaceDir}
BASE_URL=http://localhost:8080/
JAVA_EXECUTABLE=${javaExecutable}
HELIOS_DATA_FOLDER=${path.join(os.homedir(), '.helios')}`;
  }

  private async _replaceModUrlsWithModrinth(
    distribution: any,
    mods: Array<{ slug: string; name: string; version: string; required: boolean; option?: string }>,
    fileUrlMap: Map<string, string>,
  ): Promise<void> {
    if (!distribution.servers || distribution.servers.length === 0) return;

    for (const server of distribution.servers) {
      if (!server.modules) continue;

      for (const module of server.modules) {
        // FabricMod / ForgeMod → 다운로드 시 기록한 Modrinth URL로 변환
        if (module.type === 'FabricMod' || module.type === 'ForgeMod') {
          const artifactUrl: string = module.artifact?.url ?? '';
          const fileName = artifactUrl.split('/').pop() ?? '';
          const modrinthUrl = fileUrlMap.get(fileName);
          if (modrinthUrl) {
            module.artifact.url = modrinthUrl;
            console.log(`[Nebula] 모드 URL 변환: ${fileName} → ${modrinthUrl}`);
          } else {
            // fallback: Modrinth API로 slug 매칭 시도
            const modEntry = Array.from(mods).find(m => module.id.includes(m.slug));
            if (modEntry) {
              try {
                const versions = await this.modrinthService.getModVersions(modEntry.slug, '', '');
                const targetVersion = versions.find(v =>
                  v.version_number === modEntry.version ||
                  v.version_number.endsWith(`-${modEntry.version}`) ||
                  v.version_number.endsWith(modEntry.version)
                );
                if (targetVersion?.files?.[0]?.url) {
                  module.artifact.url = targetVersion.files[0].url;
                  console.log(`[Nebula] 모드 URL 변환: ${modEntry.slug} → ${module.artifact.url}`);
                }
              } catch (error) {
                console.error(`[Nebula] 모드 URL 변환 오류 (${modEntry.slug}):`, error);
              }
            }
          }
          continue;
        }

        // Fabric 로더 → maven.fabricmc.net
        if (module.type === 'Fabric') {
          if (module.artifact?.url?.includes('localhost')) {
            const url = module.artifact.url;
            if (url.includes('/repo/lib/')) {
              module.artifact.url = `https://maven.fabricmc.net/${url.split('/repo/lib/')[1]}`;
            }
          }
        }

        // ForgeHosted 로더 메인 artifact → maven.minecraftforge.net
        if (module.type === 'ForgeHosted') {
          if (module.artifact?.url?.includes('localhost')) {
            const url = module.artifact.url;
            if (url.includes('/repo/lib/')) {
              module.artifact.url = `https://maven.minecraftforge.net/${url.split('/repo/lib/')[1]}`;
            }
          }
        }

        // 서브모듈 변환
        if (module.subModules) {
          for (const subModule of module.subModules) {
            if (!subModule.artifact?.url?.includes('localhost')) continue;
            const url = subModule.artifact.url;

            if (module.type === 'Fabric') {
              // Fabric 서브모듈 → maven.fabricmc.net
              if (url.includes('/repo/lib/')) {
                subModule.artifact.url = `https://maven.fabricmc.net/${url.split('/repo/lib/')[1]}`;
              } else if (url.includes('/repo/versions/')) {
                subModule.artifact.url = `https://maven.fabricmc.net/${url.split('/repo/versions/')[1]}`;
              }
            } else if (module.type === 'ForgeHosted') {
              // Forge 서브모듈 → maven.minecraftforge.net
              if (url.includes('/repo/lib/')) {
                subModule.artifact.url = `https://maven.minecraftforge.net/${url.split('/repo/lib/')[1]}`;
              } else if (url.includes('/repo/versions/')) {
                subModule.artifact.url = `https://maven.minecraftforge.net/${url.split('/repo/versions/')[1]}`;
              }
            }

            console.log(`[Nebula] 서브모듈 URL 변환: ${subModule.id} → ${subModule.artifact.url}`);
          }
        }
      }
    }
  }

  private _generateMetaFiles(workspaceDir: string, dto: GenerateDistributionDto): void {
    const metaDir = path.join(workspaceDir, 'meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const distroMeta = {
      meta: {
        rss: 'https://example.com/feed',
        discord: {
          clientId: 'example',
          smallImageText: 'Example Server',
          smallImageKey: 'example',
        },
      },
    };
    fs.writeFileSync(
      path.join(metaDir, 'distrometa.json'),
      JSON.stringify(distroMeta, null, 2),
    );
  }

  private async _executeNebula(...args: string[]): Promise<void> {
    const workspaceDir = args[args.length - 1];
    const filteredArgs = args.slice(0, -1);
    const label = filteredArgs.join(' ');

    // Claritas.jar을 찾기 위해 cwd는 Nebula 루트 디렉토리로 설정
    const nebulaRoot = path.dirname(path.dirname(this.nebulaCli));

    // .env 파일을 직접 파싱해서 환경변수로 주입
    const envFilePath = path.join(workspaceDir, '.env');
    const envVars: Record<string, string> = {};
    if (fs.existsSync(envFilePath)) {
      const envContent = fs.readFileSync(envFilePath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const [key, ...rest] = line.split('=');
        if (key && rest.length) envVars[key.trim()] = rest.join('=').trim();
      }
    }

    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.nebulaCli, ...filteredArgs], {
        cwd: nebulaRoot,
        env: { ...process.env, ...envVars },
      });

      child.stdout.on('data', (data: Buffer) => process.stdout.write(`[Nebula stdout] ${label}: ${data}`));
      child.stderr.on('data', (data: Buffer) => process.stdout.write(`[Nebula stderr] ${label}: ${data}`));

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Nebula 명령 실패 (${label}): exit code ${code}`));
        }
      });

      child.on('error', (err) => reject(new Error(`Nebula 명령 실패 (${label}): ${err.message}`)));
    });
  }

  private _cleanupWorkspace(workspaceDir: string): void {
    try {
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
    } catch {
      // 정리 실패는 무시
    }
  }
}
