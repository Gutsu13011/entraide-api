import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    register: vi.fn(),
    login: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should send an accessToken', async () => {
      const loginDto = {
        email: 'test@mail.com',
        password: 'un-mot-de-passe-pour-le-test',
      };

      authServiceMock.login.mockResolvedValue({ accessToken: 'fake-token' });

      const result = await controller.login(loginDto);

      expect(authServiceMock.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual({ accessToken: 'fake-token' });
    });
  });
});
