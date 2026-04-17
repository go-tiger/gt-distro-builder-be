import { Controller, Get, Param } from '@nestjs/common';
import { LoaderService } from './loader.service';

@Controller('loaders')
export class LoaderController {
  constructor(private loaderService: LoaderService) {}

  @Get('forge/:mcVersion')
  async getForgeVersions(@Param('mcVersion') mcVersion: string) {
    return this.loaderService.getForgeVersions(mcVersion);
  }

  @Get('neoforge/:mcVersion')
  async getNeoForgeVersions(@Param('mcVersion') mcVersion: string) {
    return this.loaderService.getNeoForgeVersions(mcVersion);
  }
}
