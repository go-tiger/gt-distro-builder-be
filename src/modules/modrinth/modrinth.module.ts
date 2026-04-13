import { Module } from '@nestjs/common';
import { ModrinthService } from './modrinth.service';
import { ModrinthController } from './modrinth.controller';

@Module({
  providers: [ModrinthService],
  controllers: [ModrinthController],
  exports: [ModrinthService],
})
export class ModrinthModule {}
