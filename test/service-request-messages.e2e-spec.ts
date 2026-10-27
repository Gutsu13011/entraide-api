import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { io, type Socket } from 'socket.io-client';
import type { Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/user.entity.js';
import { ServiceRequest } from '../src/service-requests/service-request.entity.js';
import { ServicePricingType } from '../src/service-offerings/service-pricing-type.enum.js';
import { ServiceRequestMessagesGateway } from '../src/service-requests/service-request-messages.gateway.js';

const namespace = '/service-request-messages';

describe('Private conversation notifications (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let participants: User[];
  let conversation: ServiceRequest;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    jwt = new JwtService({ secret: app.get(ConfigService).getOrThrow<string>('JWT_SECRET') });
    const users = app.get<Repository<User>>(getRepositoryToken(User));
    participants = await users.save(
      ['Alice', 'Bruno', 'Charlie'].map((firstName) => ({
        firstName,
        lastName: 'Socket Test',
        email: `${firstName.toLowerCase()}.socket@example.test`,
        passwordHash: 'unused-test-only-hash',
      })),
    );
    conversation = await app
      .get<Repository<ServiceRequest>>(getRepositoryToken(ServiceRequest))
      .save({
        message: 'Test conversation',
        requesterUserId: participants[0].id,
        recipientUserId: participants[1].id,
        serviceProviderId: null,
        serviceOfferingId: null,
        offeringTitleSnapshot: 'Test service',
        offeringPricingTypeSnapshot: ServicePricingType.FREE,
        offeringHourlyRateSnapshot: null,
      });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.disconnect();
    await app?.close();
  });

  function createClient(accessToken: unknown, extraAuth: Record<string, unknown> = {}) {
    const socket = io(`${baseUrl}${namespace}`, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      auth: { accessToken, ...extraAuth },
    });
    sockets.push(socket);
    return socket;
  }

  async function connectUser(userId: number, extraAuth: Record<string, unknown> = {}) {
    const token = await jwt.signAsync({ sub: String(userId) }, { expiresIn: '15m' });
    const socket = createClient(token, extraAuth);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return { socket, token };
  }

  it('should notify both participants and the sender’s other tab, but never an unrelated user', async () => {
    const alice = await connectUser(participants[0].id);
    const otherTab = await connectUser(participants[0].id);
    const bruno = await connectUser(participants[1].id);
    const outsider = await connectUser(participants[2].id, { userId: participants[1].id });
    const handlers = [alice, otherTab, bruno, outsider].map(({ socket }) => {
      const handler = vi.fn();
      socket.on('conversation.changed', handler);
      return handler;
    });

    const response = await request(app.getHttpServer())
      .post(`/service-requests/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ content: 'Bonjour, disponible samedi ?' })
      .expect(201);

    await vi.waitFor(() => {
      for (const handler of handlers.slice(0, 3)) {
        expect(handler).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: conversation.id });
      }
    });
    // Allow a wrongly broadcast packet to arrive before checking isolation.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handlers[3]).not.toHaveBeenCalled();
    const history = await request(app.getHttpServer())
      .get(`/service-requests/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${bruno.token}`)
      .expect(200);
    expect(history.body).toEqual([expect.objectContaining({ id: response.body.id })]);
  });

  it('should not notify anyone when message validation or participant authorization fails', async () => {
    const alice = await connectUser(participants[0].id);
    const outsider = await connectUser(participants[2].id);
    const notify = vi.spyOn(app.get(ServiceRequestMessagesGateway), 'notifyConversationChanged');

    await request(app.getHttpServer())
      .post(`/service-requests/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ content: 'Forbidden message' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/service-requests/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ content: '' })
      .expect(400);

    expect(notify).not.toHaveBeenCalled();
  });

  it.each([1, 2])(
    'should notify read changes to participant tabs only and suppress repeated reads (%s messages read)',
    async (readCount) => {
      const alice = await connectUser(participants[0].id);
      const bruno = await connectUser(participants[1].id);
      const otherTab = await connectUser(participants[1].id);
      const outsider = await connectUser(participants[2].id);
      const handlers = [alice, bruno, otherTab, outsider].map(({ socket }) => {
        const handler = vi.fn();
        socket.on('conversation.changed', handler);
        return handler;
      });
      const messageIds: number[] = [];
      for (const content of ['Premier message', 'Second message']) {
        const response = await request(app.getHttpServer())
          .post(`/service-requests/${conversation.id}/messages`)
          .set('Authorization', `Bearer ${alice.token}`)
          .send({ content })
          .expect(201);
        messageIds.push(response.body.id);
      }
      // Drain creation notifications before observing read notifications.
      await vi.waitFor(() => {
        for (const handler of handlers.slice(0, 3)) expect(handler).toHaveBeenCalledTimes(2);
      });
      expect(handlers[3]).not.toHaveBeenCalled();
      for (const handler of handlers) handler.mockClear();
      const notify = vi.spyOn(app.get(ServiceRequestMessagesGateway), 'notifyConversationChanged');
      const boundary = messageIds[readCount - 1];

      await request(app.getHttpServer())
        .patch(`/service-requests/${conversation.id}/messages/read`)
        .set('Authorization', `Bearer ${bruno.token}`)
        .send({ upToMessageId: boundary })
        .expect(204);

      await vi.waitFor(() => {
        for (const handler of handlers.slice(0, 3)) {
          expect(handler).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: conversation.id });
        }
      });
      expect(notify).toHaveBeenCalledExactlyOnceWith(
        conversation.id,
        participants[0].id,
        participants[1].id,
      );
      const history = await request(app.getHttpServer())
        .get(`/service-requests/${conversation.id}/messages`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);
      expect(
        history.body.filter((message: { readAt: string | null }) => message.readAt !== null),
      ).toHaveLength(readCount);
      const counts = await request(app.getHttpServer())
        .get('/service-requests/messages/unread-counts')
        .set('Authorization', `Bearer ${bruno.token}`)
        .expect(200);
      expect(counts.body.total).toBe(2 - readCount);

      await request(app.getHttpServer())
        .patch(`/service-requests/${conversation.id}/messages/read`)
        .set('Authorization', `Bearer ${bruno.token}`)
        .send({ upToMessageId: boundary })
        .expect(204);

      // Give any incorrectly emitted packet a chance to reach the clients.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(notify).toHaveBeenCalledOnce();
      for (const handler of handlers.slice(0, 3)) expect(handler).toHaveBeenCalledOnce();
      expect(handlers[3]).not.toHaveBeenCalled();
    },
  );

  it('should not notify when read authorization or boundary validation fails', async () => {
    const alice = await connectUser(participants[0].id);
    const outsider = await connectUser(participants[2].id);
    const notify = vi.spyOn(app.get(ServiceRequestMessagesGateway), 'notifyConversationChanged');

    await request(app.getHttpServer())
      .patch(`/service-requests/${conversation.id}/messages/read`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ upToMessageId: 999 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/service-requests/${conversation.id}/messages/read`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ upToMessageId: 999 })
      .expect(404);

    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['missing', 'invalid', 'expired', 'missing-exp', 'invalid-sub'] as const)(
    'should refuse a connection with a %s token',
    async (kind) => {
      let token: unknown;
      if (kind === 'invalid') token = 'not-a-jwt';
      if (kind === 'expired') {
        token = await jwt.signAsync({ sub: String(participants[0].id) }, { expiresIn: -1 });
      }
      if (kind === 'missing-exp') token = await jwt.signAsync({ sub: String(participants[0].id) });
      if (kind === 'invalid-sub') token = await jwt.signAsync({ sub: '0' }, { expiresIn: '15m' });
      const socket = createClient(token);
      const onConnect = vi.fn();
      socket.on('connect', onConnect);
      const error = await new Promise<Error>((resolve) => {
        socket.once('connect_error', resolve);
        socket.connect();
      });

      expect(error.message).toBe('Unauthorized');
      expect(onConnect).not.toHaveBeenCalled();
      expect(socket.connected).toBe(false);
    },
  );

  it('should disconnect a real client when the access token expires', async () => {
    const token = await jwt.signAsync({ sub: String(participants[0].id) }, { expiresIn: 2 });
    const socket = createClient(token);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    const reason = await new Promise<string>((resolve) => socket.once('disconnect', resolve));

    expect(reason).toBe('io server disconnect');
    expect(socket.connected).toBe(false);
  });
});
