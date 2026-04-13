import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export enum ModLoader {
  FABRIC = 'fabric',
  FORGE = 'forge',
  NEOFORGE = 'neoforge',
}

export class SearchModDto {
  @IsString()
  query: string;

  @IsEnum(ModLoader)
  loader: ModLoader;

  @IsString()
  version: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number;
}
