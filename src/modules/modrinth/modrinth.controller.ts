import { Controller, Get, Query } from '@nestjs/common';
import { ModrinthService } from './modrinth.service';
import { SearchModDto } from '../../common/dto/search-mod.dto';

@Controller('modrinth')
export class ModrinthController {
  constructor(private readonly modrinthService: ModrinthService) {}

  @Get('search')
  async search(@Query() searchDto: SearchModDto) {
    return this.modrinthService.searchMods(searchDto);
  }
}
