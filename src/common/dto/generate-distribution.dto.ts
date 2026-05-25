import {
  IsString,
  IsEnum,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsNumber,
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

export class FileDto {
  @IsString()
  url: string;

  @IsBoolean()
  tracked: boolean;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsNumber()
  @IsOptional()
  size?: number;

  @IsString()
  @IsOptional()
  md5?: string;
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileDto)
  @IsOptional()
  resourcePacks?: FileDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileDto)
  @IsOptional()
  shaderPacks?: FileDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileDto)
  @IsOptional()
  extraFiles?: FileDto[];
}
