import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { GenerateDistributionDto } from '../../common/dto/generate-distribution.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('distribution')
export class DistributionController {
  constructor(
    private readonly distributionService: DistributionService,
    private readonly usersService: UsersService,
  ) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generate(
    @Body() generateDto: GenerateDistributionDto,
    @Req() req: any,
  ) {
    const user = req.user;
    const userData = await this.usersService.findById(user.id);

    if (!userData) {
      throw new BadRequestException('사용자를 찾을 수 없습니다');
    }

    if (userData.quota !== -1 && userData.usedCount >= userData.quota) {
      throw new BadRequestException('사용 횟수를 초과하였습니다');
    }

    const result =
      await this.distributionService.generateDistribution(generateDto);
    await this.usersService.incrementUsedCount(user.id);

    return result;
  }
}
