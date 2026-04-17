import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async create(@Body() body: { username: string; password: string; role?: 'admin' | 'user' }) {
    const user = await this.usersService.create(body.username, body.password, body.role);
    const { password, ...rest } = user;
    return rest;
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id/quota')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateQuota(@Param('id') id: string, @Body() body: { quota: number }) {
    await this.usersService.updateQuota(id, body.quota);
    return { success: true };
  }

  @Patch(':id/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    await this.usersService.setActive(id, body.isActive);
    return { success: true };
  }
}
