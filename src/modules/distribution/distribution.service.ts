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
    this.nebulaCli = this.configService.get<string>(
      'NEBULA_CLI_PATH',
      '/app/nebula/dist/index.js',
    );
    this.nebulaRoot = this.configService.get<string>(
      'NEBULA_WORKSPACE_PATH',
      path.join(os.tmpdir(), 'nebula-workspace'),
    );
  }

  async generateDistribution(dto: GenerateDistributionDto) {
    const workspaceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workspaceDir = path.join(this.nebulaRoot, workspaceId);
    const logFile = path.join(workspaceDir, 'debug.log');
    const log = (...args: any[]) => {
      const line = args
        .map((a) =>
          typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a),
        )
        .join(' ');
      console.log(line);
      try {
        fs.appendFileSync(logFile, line + '\n');
      } catch {}
    };

    try {
      fs.mkdirSync(workspaceDir, { recursive: true });
      log(`[Nebula] 워크스페이스 생성: ${workspaceDir}`);

      const envFilePath = path.join(workspaceDir, '.env');
      const envContent = this._generateEnvFile(workspaceDir, dto);
      fs.writeFileSync(envFilePath, envContent);
      log(`[Nebula] .env 파일 생성 완료`);

      await this._executeNebula('init', 'root', workspaceDir);
      log(`[Nebula] init root 완료`);

      let loaderFlag: string;
      let loaderVersionArg = dto.loaderVersion;
      if (dto.loader === 'fabric') {
        loaderFlag = '--fabric';
      } else if (dto.loader === 'neoforge') {
        loaderFlag = '--neoforge';
      } else {
        loaderFlag = '--forge';
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
      log(`[Nebula] generate server 완료`);

      const loaderFolderName =
        dto.loader === 'fabric'
          ? 'fabricmods'
          : dto.loader === 'neoforge'
            ? 'neoforgemods'
            : 'forgemods';
      const fileUrlMap = await this._downloadMods(
        workspaceDir,
        loaderFolderName,
        dto.mods,
        dto.loader,
        dto.minecraftVersion,
        dto.serverId,
      );
      log(`[Nebula] 모드 다운로드 완료`);

      const serverDir = path.join(
        workspaceDir,
        'servers',
        `${dto.serverId}-${dto.minecraftVersion}`,
      );

      const resourcePackSizes = await this._downloadFiles(
        serverDir,
        'resourcepacks',
        dto.resourcePacks || [],
      );
      log(`[Nebula] 리소스팩 다운로드 완료`);

      const shaderPackSizes = await this._downloadFiles(
        serverDir,
        'shaderpacks',
        dto.shaderPacks || [],
      );
      log(`[Nebula] 쉐이더팩 다운로드 완료`);

      if (dto.extraFiles && dto.extraFiles.length > 0) {
        for (const extraFile of dto.extraFiles) {
          try {
            const response = await fetch(extraFile.url);
            if (!response.ok) {
              console.warn(`[Nebula] 파일 다운로드 실패: ${extraFile.url}`);
              continue;
            }

            const filePath = path.join(serverDir, 'files', extraFile.path || 'file');
            const dir = path.dirname(filePath);
            fs.mkdirSync(dir, { recursive: true });

            const buffer = await response.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(buffer));
            log(`[Nebula] 기타 파일 다운로드: ${extraFile.path}`);
          } catch (error) {
            console.error(`[Nebula] 기타 파일 다운로드 오류:`, error);
          }
        }
      }

      this._generateMetaFiles(workspaceDir, dto);
      log(`[Nebula] meta 파일 생성 완료`);

      await this._executeNebula('generate', 'distro', workspaceDir);
      log(`[Nebula] generate distro 완료`);

      const distroPath = path.join(workspaceDir, 'distribution.json');
      log(`[Nebula] 경로: ${distroPath}`);
      log(`[Nebula] 파일 존재: ${fs.existsSync(distroPath)}`);

      if (!fs.existsSync(distroPath)) {
        throw new Error(`distribution.json을 찾을 수 없습니다`);
      }

      const distribution = JSON.parse(fs.readFileSync(distroPath, 'utf-8'));
      log(`[Nebula] distribution.json 파싱 완료`);

      await this._replaceModUrlsWithModrinth(
        distribution,
        dto.mods,
        fileUrlMap,
        log,
      );
      log(`[Nebula] URL 변환 완료`);

      this._updateFileMetadata(
        distribution,
        dto.resourcePacks || [],
        dto.shaderPacks || [],
        dto.extraFiles || [],
        resourcePackSizes,
        shaderPackSizes,
        log,
      );
      log(`[Nebula] 파일 메타데이터 업데이트 완료`);

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
    mods: Array<{
      slug: string;
      name: string;
      version: string;
      required: boolean;
      option?: string;
    }>,
    loader: string,
    minecraftVersion: string,
    serverId: string,
  ): Promise<Map<string, string>> {
    const baseModsDir = path.join(
      workspaceDir,
      'servers',
      `${serverId}-${minecraftVersion}`,
      loaderFolderName,
    );
    fs.mkdirSync(baseModsDir, { recursive: true });

    const optionMap: Record<string, string> = {
      required: 'required',
      'optional-on': 'optionalon',
      'optional-off': 'optionaloff',
    };

    // 파일명 → Modrinth URL 맵
    const fileUrlMap = new Map<string, string>();

    for (const mod of mods) {
      try {
        const versions = await this.modrinthService.getModVersions(
          mod.slug,
          loader,
          minecraftVersion,
        );
        const targetVersion = versions.find(
          (v) => v.version_number === mod.version,
        );

        if (
          !targetVersion ||
          !targetVersion.files ||
          targetVersion.files.length === 0
        ) {
          console.warn(
            `[Nebula] 모드를 찾을 수 없음: ${mod.slug} ${mod.version}`,
          );
          continue;
        }

        const file = targetVersion.files[0];
        const downloadUrl = file.url;
        const fileName = file.filename;

        fileUrlMap.set(fileName, downloadUrl);

        const folderName = mod.option
          ? optionMap[mod.option] || 'required'
          : 'required';
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

  private async _downloadFiles(
    serverDir: string,
    folderName: string,
    files: Array<{ url: string; tracked: boolean; fileName?: string }>,
  ): Promise<Map<string, number>> {
    if (files.length === 0) return new Map();

    const filesDir = path.join(serverDir, 'files', folderName);
    fs.mkdirSync(filesDir, { recursive: true });

    const fileSizeMap = new Map<string, number>();
    const maxRetries = 3;
    const retryDelay = 2000; // 2초

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let lastError: Error | null = null;

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(file.url, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (!response.ok) {
            console.warn(
              `[Nebula] 파일 다운로드 실패 (${folderName}): ${file.url} - HTTP ${response.status}`,
            );
            continue;
          }

          let fileName = new URL(file.url).pathname.split('/').pop() || `file-${i}`;
          // URL 디코딩 (띄어쓰기 등 처리)
          fileName = decodeURIComponent(fileName);
          const filePath = path.join(filesDir, fileName);

          const buffer = await response.arrayBuffer();
          fs.writeFileSync(filePath, Buffer.from(buffer));

          const fileSize = buffer.byteLength;
          fileSizeMap.set(fileName, fileSize);

          console.log(`[Nebula] 파일 다운로드 (${folderName}): ${fileName} (${fileSize} bytes)`);
          lastError = null;
          break; // 성공하면 재시도 루프 탈출
        } catch (error) {
          lastError = error as Error;
          if (retry < maxRetries - 1) {
            console.warn(
              `[Nebula] 파일 다운로드 재시도 (${folderName}) - 시도 ${retry + 1}/${maxRetries}: ${file.url}`,
            );
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          } else {
            console.error(
              `[Nebula] 파일 다운로드 최종 실패 (${folderName}): ${file.url}`,
              error,
            );
          }
        }
      }

      if (lastError) {
        console.error(`[Nebula] 파일 다운로드 오류 (${folderName}):`, lastError.message);
      }
    }

    return fileSizeMap;
  }

  private _generateEnvFile(
    workspaceDir: string,
    dto: GenerateDistributionDto,
  ): string {
    const javaExecutable = this.configService.get<string>(
      'JAVA_EXECUTABLE',
      'java',
    );
    return `ROOT=${workspaceDir}
BASE_URL=http://localhost:8080/
JAVA_EXECUTABLE=${javaExecutable}
HELIOS_DATA_FOLDER=${path.join(os.homedir(), '.helios')}`;
  }

  private async _replaceModUrlsWithModrinth(
    distribution: any,
    mods: Array<{
      slug: string;
      name: string;
      version: string;
      required: boolean;
      option?: string;
    }>,
    fileUrlMap: Map<string, string>,
    log: (...args: any[]) => void = console.log,
  ): Promise<void> {
    if (!distribution.servers || distribution.servers.length === 0) return;

    for (const server of distribution.servers) {
      if (!server.modules) continue;

      for (const module of server.modules) {
        // File 타입 (리소스팩, 쉐이더팩, 기타 파일) → 원본 URL 유지
        if (module.type === 'File') {
          // 프론트에서 받은 URL을 그대로 유지 (Modrinth CDN 주소)
          continue;
        }

        // FabricMod / ForgeMod → 다운로드 시 기록한 Modrinth URL로 변환
        if (module.type === 'FabricMod' || module.type === 'ForgeMod') {
          const artifactUrl: string = module.artifact?.url ?? '';
          const fileName = artifactUrl.split('/').pop() ?? '';
          const modrinthUrl = fileUrlMap.get(fileName);
          if (modrinthUrl) {
            module.artifact.url = modrinthUrl;
            log(`[Nebula] 모드 URL 변환: ${fileName} → ${modrinthUrl}`);
          } else {
            // fallback: Modrinth API로 slug 매칭 시도
            const modEntry = Array.from(mods).find((m) =>
              module.id.includes(m.slug),
            );
            if (modEntry) {
              try {
                const versions = await this.modrinthService.getModVersions(
                  modEntry.slug,
                  '',
                  '',
                );
                const targetVersion = versions.find(
                  (v) =>
                    v.version_number === modEntry.version ||
                    v.version_number.endsWith(`-${modEntry.version}`) ||
                    v.version_number.endsWith(modEntry.version),
                );
                if (targetVersion?.files?.[0]?.url) {
                  module.artifact.url = targetVersion.files[0].url;
                  log(
                    `[Nebula] 모드 URL 변환: ${modEntry.slug} → ${module.artifact.url}`,
                  );
                }
              } catch (error) {
                console.error(
                  `[Nebula] 모드 URL 변환 오류 (${modEntry.slug}):`,
                  error,
                );
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

        // ForgeHosted 로더 메인 artifact
        if (module.type === 'ForgeHosted') {
          if (module.artifact?.url?.includes('localhost')) {
            const url = module.artifact.url;
            if (url.includes('/repo/lib/')) {
              const libPath = url.split('/repo/lib/')[1];
              const isNeoForge = (module.id as string).includes(
                'net.neoforged',
              );
              module.artifact.url = isNeoForge
                ? `https://maven.neoforged.net/releases/${libPath}`
                : `https://maven.minecraftforge.net/${libPath}`;
            }
          }
        }

        // 서브모듈 변환
        if (module.subModules) {
          const isNeoForge =
            module.type === 'ForgeHosted' &&
            (module.id as string).includes('net.neoforged');

          for (const subModule of module.subModules) {
            if (!subModule.artifact?.url?.includes('localhost')) continue;
            const url = subModule.artifact.url;

            if (module.type === 'Fabric') {
              if (url.includes('/repo/lib/')) {
                subModule.artifact.url = `https://maven.fabricmc.net/${url.split('/repo/lib/')[1]}`;
              } else if (url.includes('/repo/versions/')) {
                subModule.artifact.url = `https://maven.fabricmc.net/${url.split('/repo/versions/')[1]}`;
              }
            } else if (module.type === 'ForgeHosted') {
              if (url.includes('/repo/lib/')) {
                const libPath = url.split('/repo/lib/')[1];
                subModule.artifact.url = isNeoForge
                  ? `https://maven.neoforged.net/releases/${libPath}`
                  : `https://maven.minecraftforge.net/${libPath}`;
              } else if (isNeoForge && url.includes('/repo/versions/')) {
                // NeoForge VersionManifest → GitHub raw
                // url 패턴: .../repo/versions/1.21.1-neoforge-21.1.226/1.21.1-neoforge-21.1.226.json
                const versionFolder = url.split('/repo/versions/')[1]?.split('/')[0];
                if (versionFolder) {
                  // "1.21.1-neoforge-21.1.226" → mcVersion="1.21.1", nfVersion="21.1.226"
                  const neoforgeIdx = versionFolder.indexOf('-neoforge-');
                  if (neoforgeIdx !== -1) {
                    const mcVersion = versionFolder.substring(0, neoforgeIdx);
                    const nfVersion = versionFolder.substring(neoforgeIdx + '-neoforge-'.length);
                    subModule.artifact.url = `https://raw.githubusercontent.com/go-tiger/neoforge-version-manifests/main/${mcVersion}/${nfVersion}/version.json`;
                  }
                }
              }
            }

            log(
              `[Nebula] 서브모듈 URL 변환: ${subModule.id} → ${subModule.artifact.url}`,
            );
          }
        }
      }
    }
  }

  private _generateMetaFiles(
    workspaceDir: string,
    dto: GenerateDistributionDto,
  ): void {
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

      child.stdout.on('data', (data: Buffer) =>
        process.stdout.write(`[Nebula stdout] ${label}: ${data}`),
      );
      child.stderr.on('data', (data: Buffer) =>
        process.stdout.write(`[Nebula stderr] ${label}: ${data}`),
      );

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Nebula 명령 실패 (${label}): exit code ${code}`));
        }
      });

      child.on('error', (err) =>
        reject(new Error(`Nebula 명령 실패 (${label}): ${err.message}`)),
      );
    });
  }

  private _updateFileMetadata(
    distribution: any,
    resourcePacks: Array<{ fileName?: string; size?: number; md5?: string; url?: string }>,
    shaderPacks: Array<{ fileName?: string; size?: number; md5?: string; url?: string }>,
    extraFiles: Array<{ path?: string; url?: string; tracked?: boolean }>,
    resourcePackSizes: Map<string, number>,
    shaderPackSizes: Map<string, number>,
    log: (...args: any[]) => void,
  ): void {
    const allPacks = [...resourcePacks, ...shaderPacks];
    if (allPacks.length === 0 && extraFiles.length === 0) return;

    if (!distribution.servers || distribution.servers.length === 0) return;

    log(`[Nebula] 업데이트할 파일 목록: ${allPacks.map(p => p.fileName).join(', ')}, 기타파일: ${extraFiles.length}`);

    for (const server of distribution.servers) {
      if (!server.modules) continue;

      for (const module of server.modules) {
        if (module.type !== 'File') continue;

        log(`[Nebula] File 모듈 확인: id=${module.id}, name=${module.name}`);

        // 리소스팩/쉐이더팩 매칭
        const packData = allPacks.find(p => {
          const matches = p.fileName && (module.id.includes(p.fileName) || module.name === p.fileName);
          if (matches) {
            log(`[Nebula] 매칭됨: ${p.fileName}`);
          }
          return matches;
        });

        if (packData) {
          module.id = packData.fileName;
          module.name = packData.fileName;

          // 다운로드된 파일의 실제 크기 사용
          const actualSize = resourcePackSizes.get(packData.fileName!) || shaderPackSizes.get(packData.fileName!);
          if (actualSize !== undefined) {
            module.artifact.size = actualSize;
          }

          if (packData.md5) module.artifact.MD5 = packData.md5;

          // 프론트에서 받은 원본 URL 복원
          if (packData.url) {
            module.artifact.url = packData.url;
          }

          log(`[Nebula] 파일 메타데이터 설정 완료: ${packData.fileName} (size: ${module.artifact.size})`);
          continue;
        }

        // 기타 파일 매칭 (path 기반)
        const extraFileData = extraFiles.find(ef => {
          const filePath = ef.path || '';
          const matches = module.id.includes(filePath.replace(/\//g, '-')) || module.artifact?.path === filePath;
          if (matches) {
            log(`[Nebula] 기타파일 매칭됨: ${filePath}`);
          }
          return matches;
        });

        if (extraFileData) {
          const fileName = (extraFileData.path || '').split('/').pop() || module.id;
          module.id = fileName;
          module.name = fileName;

          // 프론트에서 받은 원본 URL 복원
          if (extraFileData.url) {
            log(`[Nebula] URL 변경 전: ${module.artifact.url}`);
            module.artifact.url = extraFileData.url;
            log(`[Nebula] URL 변경 후: ${module.artifact.url}`);
          }

          log(`[Nebula] 기타파일 메타데이터 설정 완료: ${fileName}`);
        }
      }
    }
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
