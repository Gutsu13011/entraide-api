import { ServiceRequestStatus } from './service-request-status.enum.js';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceRequestResponseDto } from './dto/service-request-response.dto.js';
import { ServiceRequestMessageResponseDto } from './dto/service-request-message-response.dto.js';

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
      const savedRequest = Object.assign(new ServiceRequestResponseDto(), { id: 42 });
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
        const requests = [Object.assign(new ServiceRequestResponseDto(), { id: 42 })];
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
  it('should pass the request id, status DTO and authenticated recipient id to the service', async () => {
    const serviceMock = { updateStatus: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [ServiceRequestsController],
      providers: [{ provide: ServiceRequestsService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    try {
      const controller = module.get(ServiceRequestsController);
      const dto = { status: ServiceRequestStatus.ACCEPTED };
      const requestMock = { user: { id: 7 } } as Request & { user: { id: number } };
      const response = Object.assign(new ServiceRequestResponseDto(), {
        id: 42,
        status: ServiceRequestStatus.ACCEPTED,
      });
      serviceMock.updateStatus.mockResolvedValue(response);

      const result = await controller.updateStatus(42, dto, requestMock);

      expect(serviceMock.updateStatus).toHaveBeenCalledExactlyOnceWith(42, dto, 7);
      expect(result).toBe(response);
    } finally {
      await module.close();
    }
  });
  it('should pass the conversation id, content DTO and authenticated author id to message creation', async () => {
    const serviceMock = { createMessage: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [ServiceRequestsController],
      providers: [{ provide: ServiceRequestsService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    try {
      const controller = module.get(ServiceRequestsController);
      const dto = { content: 'Bonjour, disponible samedi ?' };
      const requestMock = { user: { id: 8 } } as Request & { user: { id: number } };
      const response = Object.assign(new ServiceRequestMessageResponseDto(), {
        id: 101,
        content: dto.content,
        serviceRequestId: 42,
        authorUserId: 8,
        readAt: null,
      });
      serviceMock.createMessage.mockResolvedValue(response);

      const result = await controller.createMessage(42, dto, requestMock);

      expect(serviceMock.createMessage).toHaveBeenCalledExactlyOnceWith(42, dto, 8);
      expect(result).toBe(response);
    } finally {
      await module.close();
    }
  });
  it('should pass the conversation id and authenticated reader id to message listing and return the service array', async () => {
    const serviceMock = { findMessages: vi.fn() };
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
      const response = [
        Object.assign(new ServiceRequestMessageResponseDto(), {
          id: 101,
          content: 'Bonjour',
          serviceRequestId: 42,
          authorUserId: 7,
          readAt: null,
        }),
      ];
      serviceMock.findMessages.mockResolvedValue(response);

      const result = await controller.findMessages(42, requestMock);

      expect(serviceMock.findMessages).toHaveBeenCalledExactlyOnceWith(42, 8);
      expect(result).toBe(response);
    } finally {
      await module.close();
    }
  });
  it('should pass the conversation id, read boundary and authenticated reader id without returning a response body', async () => {
    const serviceMock = { markMessagesAsRead: vi.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      controllers: [ServiceRequestsController],
      providers: [{ provide: ServiceRequestsService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    try {
      const controller = module.get(ServiceRequestsController);
      const dto = { upToMessageId: 105 };
      const requestMock = { user: { id: 8 } } as Request & { user: { id: number } };

      const result = await controller.markMessagesAsRead(42, dto, requestMock);

      expect(serviceMock.markMessagesAsRead).toHaveBeenCalledExactlyOnceWith(42, dto, 8);
      expect(result).toBeUndefined();
    } finally {
      await module.close();
    }
  });
});
