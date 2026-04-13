import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';

export const corsConfig = (configService: ConfigService): CorsOptions => ({
  origin: configService.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
  credentials: true,
});
