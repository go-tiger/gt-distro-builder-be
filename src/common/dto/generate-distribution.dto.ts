import {
  IsString,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModLoader } from './search-mod.dto';

export class SelectedModDto {
  @IsString()
  slug: string;

  @IsString()
  version: string;

  @IsBoolean()
  required: boolean;
}

export class GenerateDistributionDto {
  @IsString()
  serverId: string;

  @IsString()
  serverName: string;

  @IsString()
  minecraftVersion: string;

  @IsEnum(ModLoader)
  loader: ModLoader;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedModDto)
  mods: SelectedModDto[];
}
