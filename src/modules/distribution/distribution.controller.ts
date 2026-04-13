import { Controller, Post, Body } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { GenerateDistributionDto } from '../../common/dto/generate-distribution.dto';

@Controller('distribution')
export class DistributionController {
  constructor(private readonly distributionService: DistributionService) {}

  @Post('generate')
  async generate(@Body() generateDto: GenerateDistributionDto) {
    return this.distributionService.generateDistribution(generateDto);
  }
}
