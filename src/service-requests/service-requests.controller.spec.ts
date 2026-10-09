import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceRequest } from './service-request.entity.js';

describe('ServiceRequestsController', () => {
  it('should pass both route ids, the DTO and authenticated user id to the service', async () => {
    const serviceMock = { create: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [ServiceRequestsController],
      providers: [{ provide: ServiceRequestsService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    try {
      const controller = module.get(ServiceRequestsController);
      const dto = { message: 'Bonjour, je souhaite repeindre ma chambre.' };
      const requestMock = { user: { id: 8 } } as Request & { user: { id: number } };
      const savedRequest = Object.assign(new ServiceRequest(), { id: 42 });
      serviceMock.create.mockResolvedValue(savedRequest);

      const result = await controller.create(1, 12, dto, requestMock);

      expect(serviceMock.create).toHaveBeenCalledExactlyOnceWith(1, 12, dto, 8);
      expect(result).toBe(savedRequest);
    } finally {
      await module.close();
    }
  });
  it.each(['findSentByUser', 'findReceivedByUser'] as const)(
    'should use the authenticated user id for %s and return the service results',
    async (method) => {
      const serviceMock = { findSentByUser: vi.fn(), findReceivedByUser: vi.fn() };
      const module = await Test.createTestingModule({
        controllers: [ServiceRequestsController],
        providers: [{ provide: ServiceRequestsService, useValue: serviceMock }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .compile();
      try {
        const controller = module.get(ServiceRequestsController);
        const requestMock = { user: { id: 8 } } as Request & { user: { id: number } };
        const requests = [Object.assign(new ServiceRequest(), { id: 42 })];
        serviceMock[method].mockResolvedValue(requests);

        const result = await controller[method](requestMock);

        expect(serviceMock[method]).toHaveBeenCalledExactlyOnceWith(8);
        expect(result).toBe(requests);
        const otherMethod = method === 'findSentByUser' ? 'findReceivedByUser' : 'findSentByUser';
        expect(serviceMock[otherMethod]).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    },
  );
});
