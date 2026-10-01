import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity.js';

describe('UsersService', () => {
  const usersRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
  };

  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: usersRepository }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should findOne mail', async () => {
      const emailToBeTested = '      ALICE@EXAMPLE.COM   ';
      const emailExpected = 'alice@example.com';
      const mockUser = { email: emailExpected };

      usersRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail(emailToBeTested);

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { email: emailExpected },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe('create', () => {
    it('should create an user', async () => {
      const mockUser = {
        firstName: 'Alice',
        lastName: 'Martin',
        email: '      ALICE@EXAMPLE.COM   ',
        passwordHash: 'hAsHpAsSwOrD123456',
      };
      const expectedUser = {
        ...mockUser,
        email: 'alice@example.com',
      };
      const mockResolvedUser = {
        id: 1,
        ...expectedUser,
      };

      usersRepository.create.mockReturnValue(expectedUser);
      usersRepository.save.mockResolvedValue(mockResolvedUser);

      const result = await service.create(
        mockUser.firstName,
        mockUser.lastName,
        mockUser.email,
        mockUser.passwordHash,
      );

      expect(usersRepository.create).toHaveBeenCalledWith(expectedUser);
      expect(usersRepository.save).toHaveBeenCalledWith(expectedUser);
      expect(result).toBe(mockResolvedUser);
    });
  });
});
