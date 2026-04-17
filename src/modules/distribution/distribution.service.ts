import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GenerateDistributionDto } from '../../common/dto/generate-distribution.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class DistributionService {
  private nebulaCli: string;
  private nebulaRoot: string;

  constructor(private configService: ConfigService) {
    this.nebulaCli = this.configService.get<string>('NEBULA_CLI_PATH', '/app/nebula/dist/index.js');
    this.nebulaRoot = this.configService.get<string>('NEBULA_WORKSPACE_PATH', path.join(os.tmpdir(), 'nebula-workspace'));
  }

  async generateDistribution(dto: GenerateDistributionDto) {
    const workspaceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workspaceDir = path.join(this.nebulaRoot, workspaceId);

    try {
      fs.mkdirSync(workspaceDir, { recursive: true });

      const envFilePath = path.join(workspaceDir, '.env');
      const envContent = this._generateEnvFile(workspaceDir, dto);
      fs.writeFileSync(envFilePath, envContent);

      await this._executeNebula('init', 'root', workspaceDir);

      const loaderFlag = dto.loader === 'fabric' ? '--fabric' : '--forge';
      await this._executeNebula(
        'generate',
        'server',
        dto.serverId,
        dto.minecraftVersion,
        loaderFlag,
        'latest',
        workspaceDir,
      );

      this._generateMetaFiles(workspaceDir, dto);

      await this._executeNebula('generate', 'distro', workspaceDir);

      const distroPath = path.join(workspaceDir, 'distro', 'distribution.json');
      const distribution = JSON.parse(fs.readFileSync(distroPath, 'utf-8'));

      return distribution;
    } catch (error) {
      throw new BadRequestException(
        `Distribution 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this._cleanupWorkspace(workspaceDir);
    }
  }

  private _generateEnvFile(workspaceDir: string, dto: GenerateDistributionDto): string {
    return `ROOT=${workspaceDir}
BASE_URL=http://localhost:8080/
JAVA_EXECUTABLE=java
HELIOS_DATA_FOLDER=${path.join(os.homedir(), '.helios')}`;
  }

  private _generateMetaFiles(workspaceDir: string, dto: GenerateDistributionDto): void {
    const metaDir = path.join(workspaceDir, 'meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const distroMeta = {
      rss: '',
      discord: {},
    };
    fs.writeFileSync(
      path.join(metaDir, 'distrometa.json'),
      JSON.stringify(distroMeta, null, 2),
    );

    const serverMetaPath = path.join(
      workspaceDir,
      'servers',
      `${dto.serverId}-${dto.minecraftVersion}`,
      'servermeta.json',
    );
    fs.mkdirSync(path.dirname(serverMetaPath), { recursive: true });

    const serverMeta = {
      name: dto.serverName || dto.serverId,
      description: `Minecraft ${dto.minecraftVersion}`,
      icon: '',
      address: 'localhost:25565',
      discord: {},
      untracked: [],
    };
    fs.writeFileSync(serverMetaPath, JSON.stringify(serverMeta, null, 2));
  }

  private async _executeNebula(...args: string[]): Promise<void> {
    const workspaceDir = args[args.length - 1];
    const filteredArgs = args.slice(0, -1);

    try {
      await execFileAsync('node', [this.nebulaCli, ...filteredArgs], {
        cwd: workspaceDir,
        env: { ...process.env, ROOT: workspaceDir },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Nebula 명령 실패 (${filteredArgs.join(' ')}): ${errorMsg}`);
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
