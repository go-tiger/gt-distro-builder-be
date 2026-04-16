import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../common/entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(username: string, password: string, role: 'admin' | 'user' = 'user') {
    const existingUser = await this.usersRepository.findOne({ where: { username } });
    if (existingUser) {
      throw new BadRequestException('사용자명이 이미 존재합니다');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      username,
      password: hashedPassword,
      role,
    });

    return this.usersRepository.save(user);
  }

  async findByUsername(username: string) {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findById(id: string) {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findAll() {
    return this.usersRepository.find({
      select: ['id', 'username', 'role', 'quota', 'usedCount', 'isActive', 'createdAt'],
    });
  }

  async updateQuota(id: string, quota: number) {
    return this.usersRepository.update(id, { quota });
  }

  async setActive(id: string, isActive: boolean) {
    return this.usersRepository.update(id, { isActive });
  }

  async incrementUsedCount(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new BadRequestException('사용자를 찾을 수 없습니다');
    }
    return this.usersRepository.update(id, { usedCount: user.usedCount + 1 });
  }

  async validatePassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }
}
