import { Module } from '@nestjs/common';
import { LoaderService } from './loader.service';
import { LoaderController } from './loader.controller';

@Module({
  providers: [LoaderService],
  controllers: [LoaderController],
})
export class LoaderModule {}
