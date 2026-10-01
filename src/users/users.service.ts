import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();

    return this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
  }

  async create(
    firstName: string,
    lastName: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.userRepository.create({
      firstName,
      lastName,
      email: normalizedEmail,
      passwordHash,
    });

    return this.userRepository.save(user);
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();

    return this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email: normalizedEmail })
      .addSelect('user.passwordHash')
      .getOne();
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }
}
