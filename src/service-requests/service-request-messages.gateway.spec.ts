import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import { ServiceRequestMessagesGateway } from './service-request-messages.gateway.js';

type ConnectionMiddleware = Parameters<Namespace['use']>[0];

describe('ServiceRequestMessagesGateway', () => {
  const now = new Date('2026-10-27T12:00:00.000Z');
  const expiresAt = now.getTime() + 15 * 60 * 1000;
  let gateway: ServiceRequestMessagesGateway;
  let middleware: ConnectionMiddleware;
  const verifyAsync = vi.fn();

  function createSocket(accessToken: unknown = 'test-access-token') {
    let onDisconnect: (() => void) | undefined;
    const socket = {
      handshake: { auth: { accessToken } },
      data: {} as { userId?: number; expiresAt?: number },
      join: vi.fn().mockResolvedValue(undefined),
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'disconnect') onDisconnect = listener;
      }),
      disconnect: vi.fn(() => {
        const listener = onDisconnect;
        onDisconnect = undefined;
        listener?.();
      }),
    };
    return socket;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    verifyAsync.mockReset();
    verifyAsync.mockResolvedValue({ sub: '13', exp: expiresAt / 1000 });
    gateway = new ServiceRequestMessagesGateway({ verifyAsync } as unknown as JwtService);
    const server = {
      use: vi.fn((handler: ConnectionMiddleware) => {
        middleware = handler;
      }),
    };
    gateway.afterInit(server as unknown as Namespace);
    expect(server.use).toHaveBeenCalledOnce();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([
    { requesterUserId: 13, recipientUserId: 7 },
    { requesterUserId: 7, recipientUserId: 13 },
  ])(
    'should notify both participant rooms with only the conversation id: %j',
    ({ requesterUserId, recipientUserId }) => {
      const emit = vi.fn();
      const to = vi.fn().mockReturnValue({ emit });
      Reflect.set(gateway, 'server', { to });

      gateway.notifyConversationChanged(42, requesterUserId, recipientUserId);

      expect(to).toHaveBeenCalledExactlyOnceWith([
        `user:${requesterUserId}`,
        `user:${recipientUserId}`,
      ]);
      expect(emit).toHaveBeenCalledExactlyOnceWith('conversation.changed', {
        serviceRequestId: 42,
      });
    },
  );

  it('should authenticate a connection and store its verified identity', async () => {
    const socket = createSocket();
    const next = vi.fn();

    await middleware(socket as unknown as Socket, next);

    expect(verifyAsync).toHaveBeenCalledWith('test-access-token');
    expect(socket.data).toEqual({ userId: 13, expiresAt });
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([null, 42, {}, '', '   '])(
    'should reject a missing or malformed access token: %j',
    async (accessToken) => {
      const socket = createSocket(accessToken);
      const next = vi.fn();

      await middleware(socket as unknown as Socket, next);

      expect(verifyAsync).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledExactlyOnceWith(new Error('Unauthorized'));
      expect(socket.data).toEqual({});
    },
  );

  it('should reject a connection without an access token', async () => {
    const socket = createSocket();
    delete (socket.handshake.auth as { accessToken?: unknown }).accessToken;
    const next = vi.fn();

    await middleware(socket as unknown as Socket, next);

    expect(verifyAsync).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledExactlyOnceWith(new Error('Unauthorized'));
  });

  it('should refuse an invalid JWT without exposing the verification error', async () => {
    verifyAsync.mockRejectedValue(new Error('Signature verification failed'));
    const socket = createSocket();
    const next = vi.fn();

    await middleware(socket as unknown as Socket, next);

    expect(next).toHaveBeenCalledExactlyOnceWith(new Error('Unauthorized'));
    expect(socket.data).toEqual({});
  });

  it.each([undefined, 13, '0', '-1', '13abc', '13s', '01', '9007199254740992'])(
    'should reject an invalid user id claim: %j',
    async (sub) => {
      verifyAsync.mockResolvedValue({ sub, exp: expiresAt / 1000 });
      const socket = createSocket();
      const next = vi.fn();

      await middleware(socket as unknown as Socket, next);

      expect(next).toHaveBeenCalledExactlyOnceWith(new Error('Unauthorized'));
      expect(socket.data).toEqual({});
    },
  );

  it.each([
    undefined,
    '1793103300',
    NaN,
    Infinity,
    1.5,
    now.getTime() / 1000 - 1,
    now.getTime() / 1000,
  ])('should reject a missing, malformed or expired expiration claim: %j', async (exp) => {
    verifyAsync.mockResolvedValue({ sub: '13', exp });
    const socket = createSocket();
    const next = vi.fn();

    await middleware(socket as unknown as Socket, next);

    expect(next).toHaveBeenCalledExactlyOnceWith(new Error('Unauthorized'));
    expect(socket.data).toEqual({});
  });

  it('should use the verified identity instead of a client-supplied user id', async () => {
    const socket = createSocket();
    Object.assign(socket.handshake.auth, { userId: 99 });
    await middleware(socket as unknown as Socket, vi.fn());

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.join).toHaveBeenCalledExactlyOnceWith('user:13');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('should join both connections of the same user to the same room', async () => {
    const first = createSocket();
    const second = createSocket();
    for (const socket of [first, second]) {
      await middleware(socket as unknown as Socket, vi.fn());
      await gateway.handleConnection(socket as unknown as Socket);
    }

    expect(first.join).toHaveBeenCalledExactlyOnceWith('user:13');
    expect(second.join).toHaveBeenCalledExactlyOnceWith('user:13');
  });

  it('should close the connection when its access token expires', async () => {
    const socket = createSocket();
    await middleware(socket as unknown as Socket, vi.fn());
    await gateway.handleConnection(socket as unknown as Socket);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should refuse to join a room if the token expired after authentication', async () => {
    const socket = createSocket();
    await middleware(socket as unknown as Socket, vi.fn());
    vi.setSystemTime(expiresAt);

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.join).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should cancel the expiration timer when the socket disconnects early', async () => {
    const socket = createSocket();
    await middleware(socket as unknown as Socket, vi.fn());
    await gateway.handleConnection(socket as unknown as Socket);
    expect(vi.getTimerCount()).toBe(1);

    socket.disconnect();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('should disconnect and clear the timer if joining the room fails', async () => {
    const socket = createSocket();
    socket.join.mockRejectedValue(new Error('Adapter unavailable'));
    await middleware(socket as unknown as Socket, vi.fn());

    await gateway.handleConnection(socket as unknown as Socket);

    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
