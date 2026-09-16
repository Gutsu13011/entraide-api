import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';

describe('HealthController', () => {
  let controller: HealthController;

  const healthCheckServiceMock = {
    check: vi.fn(),
  };
  const typeOrmHealthIndicatorMock = {
    pingCheck: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: healthCheckServiceMock,
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: typeOrmHealthIndicatorMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return the health check result', async () => {
    const expectedResult: HealthCheckResult = {
      status: 'ok',
      info: {
        database: {
          status: 'up',
          responseTime: 3,
        },
      },
      error: {},
      details: {
        database: {
          status: 'up',
          responseTime: 3,
        },
      },
    };

    healthCheckServiceMock.check.mockResolvedValue(expectedResult);

    const result = await controller.check();

    expect(healthCheckServiceMock.check).toHaveBeenCalledWith([expect.any(Function)]);
    expect(result).toBe(expectedResult);
  });

  it('should check the database with a one-second timeout', async () => {
    const withTimeoutMock = vi.fn();

    typeOrmHealthIndicatorMock.pingCheck.mockReturnValue({
      withTimeout: withTimeoutMock,
    });

    healthCheckServiceMock.check.mockImplementation(
      async (healthIndicators: Array<() => unknown>) => {
        healthIndicators[0]();

        return {
          status: 'ok',
          info: {},
          error: {},
          details: {},
        };
      },
    );

    await controller.check();

    expect(typeOrmHealthIndicatorMock.pingCheck).toHaveBeenCalledWith('database');
    expect(withTimeoutMock).toHaveBeenCalledWith(1000);
  });
});
