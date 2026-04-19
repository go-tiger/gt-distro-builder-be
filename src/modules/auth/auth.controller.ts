import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  @Post('register')
  async register(@Body() body: { username: string; password: string }) {
    const user = await this.usersService.create(
      body.username,
      body.password,
      'user',
    );
    const { password, ...rest } = user;
    return rest;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: any) {
    const user = req.user;
    const userData = await this.usersService.findById(user.id);

    if (!userData) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    const { password, ...rest } = userData;
    const remainingQuota =
      userData.quota === -1 ? '무제한' : userData.quota - userData.usedCount;
    return { ...rest, remainingQuota };
  }
}
