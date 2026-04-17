import {
  IsString,
  IsEnum,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModLoader } from './search-mod.dto';

export class SelectedModDto {
  @IsString()
  slug: string;

  @IsString()
  name: string;

  @IsString()
  version: string;

  @IsBoolean()
  required: boolean;

  @IsString()
  option?: string;
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

  @IsString()
  loaderVersion: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedModDto)
  mods: SelectedModDto[];
}
