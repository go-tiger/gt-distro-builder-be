import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmAsyncConfig } from './config/typeorm.config';
import { ModrinthModule } from './modules/modrinth/modrinth.module';
import { CacheModule } from './modules/cache/cache.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    ModrinthModule,
    CacheModule,
    DistributionModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
