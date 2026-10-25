import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/user.entity.js';
import { ServiceRequest } from '../src/service-requests/service-request.entity.js';
import { ServiceRequestStatus } from '../src/service-requests/service-request-status.enum.js';
import { ServicePricingType } from '../src/service-offerings/service-pricing-type.enum.js';
import { ServiceRequestMessage } from '../src/service-requests/service-request-message.entity.js';
import { ServiceRequestMessageReminder } from '../src/service-requests/service-request-message-reminder.entity.js';
import { ServiceRequestMessageReminderStatus as ReminderStatus } from '../src/service-requests/service-request-message-reminder-status.enum.js';
import { ServiceRequestMessageRemindersService } from '../src/service-requests/service-request-message-reminders.service.js';

describe('ServiceRequestMessageRemindersService (database integration)', () => {
  let app: INestApplication;
  let service: ServiceRequestMessageRemindersService;
  let reminders: Repository<ServiceRequestMessageReminder>;
  let requests: Repository<ServiceRequest>;
  let messages: Repository<ServiceRequestMessage>;
  let users: User[];
  const now = new Date('2026-10-25T10:05:00.123Z');

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    service = app.get(ServiceRequestMessageRemindersService);
    reminders = app.get(getRepositoryToken(ServiceRequestMessageReminder));
    requests = app.get(getRepositoryToken(ServiceRequest));
    messages = app.get(getRepositoryToken(ServiceRequestMessage));
    users = await app.get<Repository<User>>(getRepositoryToken(User)).save([
      {
        firstName: 'Alice',
        lastName: 'Martin',
        email: 'alice@example.test',
        passwordHash: 'test-only-placeholder',
      },
      {
        firstName: 'Bruno',
        lastName: 'Leroy',
        email: 'bruno@example.test',
        passwordHash: 'test-only-placeholder',
      },
    ]);
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.useRealTimers();
  });

  async function seedReminders(
    values: {
      dueAt: Date;
      status?: ReminderStatus;
      recipientUserId?: number;
    }[],
  ) {
    // A distinct request for each reminder respects the pending-pair unique index.
    const conversations = await requests.save(
      values.map(() => ({
        message: 'Aide pour une petite réparation',
        status: ServiceRequestStatus.SENT,
        requesterUserId: users[0].id,
        recipientUserId: users[1].id,
        serviceOfferingId: null,
        serviceProviderId: null,
        offeringTitleSnapshot: 'Conseil',
        offeringPricingTypeSnapshot: ServicePricingType.FREE,
        offeringHourlyRateSnapshot: null,
      })),
    );
    return reminders.save(
      values.map((value, index) => ({
        serviceRequestId: conversations[index].id,
        recipientUserId: value.recipientUserId ?? users[1].id,
        status: value.status ?? ReminderStatus.PENDING,
        dueAt: value.dueAt,
        sentAt: value.status === ReminderStatus.SENT ? new Date('2026-10-24T10:00:00.000Z') : null,
      })),
    );
  }

  it('should resolve the registered service and return an empty list without reminders', async () => {
    await expect(service.findDueReminders(now)).resolves.toEqual([]);
  });

  it('should include pending reminders exactly at the deadline, exclude later deadlines by one millisecond and ignore terminal statuses', async () => {
    const past = new Date(now.getTime() - 1);
    const future = new Date(now.getTime() + 1);
    const rows = await seedReminders([
      { dueAt: future },
      { dueAt: now },
      { dueAt: past, status: ReminderStatus.SENT },
      { dueAt: past, recipientUserId: users[0].id },
      { dueAt: past, status: ReminderStatus.CANCELLED },
      { dueAt: now, status: ReminderStatus.SENT },
      { dueAt: now, status: ReminderStatus.CANCELLED },
    ]);

    await expect(service.findDueReminders(now)).resolves.toEqual([rows[3], rows[1]]);
  });

  it('should return no candidates when all reminders are future, sent or cancelled', async () => {
    await seedReminders([
      { dueAt: new Date(now.getTime() + 1) },
      { dueAt: new Date(now.getTime() - 60_000), status: ReminderStatus.SENT },
      { dueAt: new Date(now.getTime() - 60_000), status: ReminderStatus.CANCELLED },
    ]);

    await expect(service.findDueReminders(now)).resolves.toEqual([]);
  });

  it('should return the oldest deadlines first and break equal-deadline ties by ascending id', async () => {
    const rows = await seedReminders([
      { dueAt: new Date(now.getTime() - 1000) },
      { dueAt: new Date(now.getTime() - 3000) },
      { dueAt: new Date(now.getTime() - 3000) },
      { dueAt: new Date(now.getTime() - 2000) },
    ]);

    await expect(service.findDueReminders(now)).resolves.toEqual([
      rows[1],
      rows[2],
      rows[3],
      rows[0],
    ]);
  });

  it('should return only the first 50 eligible reminders after filtering and sorting across recipients', async () => {
    const excluded = await seedReminders(
      Array.from({ length: 5 }, () => ({
        dueAt: new Date(now.getTime() - 120_000),
        status: ReminderStatus.SENT,
      })),
    );
    const eligible = await seedReminders(
      Array.from({ length: 55 }, (_, index) => ({
        dueAt: new Date(now.getTime() - (index % 7) * 1000),
        recipientUserId: users[index % 2].id,
      })),
    );
    await seedReminders([{ dueAt: new Date(now.getTime() + 1) }]);
    const expected = [...eligible]
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id - b.id)
      .slice(0, 50);

    const selected = await service.findDueReminders(now);

    expect(selected).toEqual(expected);
    expect(selected).toHaveLength(50);
    expect(selected.some((row) => excluded.some((sent) => sent.id === row.id))).toBe(false);
    expect(await reminders.count()).toBe(61);
  });

  it('should use the current time when no date is supplied and select without changing any stored data', async () => {
    const rows = await seedReminders([{ dueAt: now }, { dueAt: new Date(now.getTime() + 1) }]);
    await messages.save({
      serviceRequestId: rows[0].serviceRequestId,
      authorUserId: users[0].id,
      content: 'Message encore non lu',
      readAt: null,
    });
    const before = {
      reminders: await reminders.find({ order: { id: 'ASC' } }),
      requests: await requests.find({ order: { id: 'ASC' } }),
      messages: await messages.find({ order: { id: 'ASC' } }),
    };
    // Freeze Date only: Nest and database cleanup retain their real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      await expect(service.findDueReminders()).resolves.toEqual([rows[0]]);
      await expect(service.findDueReminders()).resolves.toEqual([rows[0]]);
    } finally {
      vi.useRealTimers();
    }

    expect(await reminders.find({ order: { id: 'ASC' } })).toEqual(before.reminders);
    expect(await requests.find({ order: { id: 'ASC' } })).toEqual(before.requests);
    expect(await messages.find({ order: { id: 'ASC' } })).toEqual(before.messages);
  });

  describe('prepareReminder', () => {
    let reminder: ServiceRequestMessageReminder;

    beforeEach(async () => {
      [reminder] = await seedReminders([{ dueAt: now }]);
    });

    function addMessage(values: Partial<ServiceRequestMessage> = {}) {
      return messages.save({
        serviceRequestId: reminder.serviceRequestId,
        authorUserId: users[0].id,
        content: 'Un message reçu',
        createdAt: new Date(now.getTime() - 60_000),
        readAt: null,
        ...values,
      });
    }

    async function snapshot() {
      return {
        reminders: await reminders.find({ order: { id: 'ASC' } }),
        requests: await requests.find({ order: { id: 'ASC' } }),
        messages: await messages.find({ order: { id: 'ASC' } }),
      };
    }

    it.each(['missing', 'sent', 'cancelled', 'future'] as const)(
      'should ignore a %s reminder without changing any stored data',
      async (kind) => {
        if (kind === 'sent') {
          await reminders.update(reminder.id, { status: ReminderStatus.SENT, sentAt: now });
        } else if (kind === 'cancelled') {
          await reminders.update(reminder.id, { status: ReminderStatus.CANCELLED });
        } else if (kind === 'future') {
          await reminders.update(reminder.id, { dueAt: new Date(now.getTime() + 1) });
        }
        const before = await snapshot();

        await expect(
          service.prepareReminder(kind === 'missing' ? 999_999 : reminder.id, now),
        ).resolves.toBeNull();

        expect(await snapshot()).toEqual(before);
      },
    );

    it.each(['cancelled', 'postponed'] as const)(
      'should recheck a candidate that was %s after batch selection',
      async (change) => {
        const candidates = await service.findDueReminders(now);
        expect(candidates).toEqual([reminder]);
        await reminders.update(
          reminder.id,
          change === 'cancelled'
            ? { status: ReminderStatus.CANCELLED }
            : { dueAt: new Date(now.getTime() + 60_000) },
        );
        const before = await snapshot();

        await expect(service.prepareReminder(candidates[0].id, now)).resolves.toBeNull();

        expect(await snapshot()).toEqual(before);
      },
    );

    it('should cancel only the target reminder when no received unread message remains, ignoring own, read and other-conversation messages', async () => {
      const [other] = await seedReminders([{ dueAt: now }]);
      await reminders.save({
        serviceRequestId: reminder.serviceRequestId,
        recipientUserId: users[0].id,
        dueAt: now,
      });
      await reminders.save({
        serviceRequestId: reminder.serviceRequestId,
        recipientUserId: reminder.recipientUserId,
        status: ReminderStatus.SENT,
        dueAt: now,
        sentAt: now,
      });
      await addMessage({
        authorUserId: reminder.recipientUserId,
        createdAt: new Date(now.getTime() - 600_000),
      });
      await addMessage({
        readAt: new Date(now.getTime() - 60_000),
        createdAt: new Date(now.getTime() - 600_000),
      });
      await addMessage({
        serviceRequestId: other.serviceRequestId,
        createdAt: new Date(now.getTime() - 600_000),
      });
      const before = await snapshot();

      await expect(service.prepareReminder(reminder.id, now)).resolves.toBeNull();

      expect(await snapshot()).toEqual({
        ...before,
        reminders: before.reminders.map((row) =>
          row.id === reminder.id ? { ...row, status: ReminderStatus.CANCELLED } : row,
        ),
      });
      await expect(service.prepareReminder(reminder.id, now)).resolves.toBeNull();
    });

    it('should postpone to the oldest received unread message plus five minutes after older messages were read', async () => {
      await seedReminders([{ dueAt: now }]);
      await addMessage({ createdAt: new Date(now.getTime() - 600_000), readAt: now });
      await addMessage({
        createdAt: new Date(now.getTime() - 600_000),
        authorUserId: reminder.recipientUserId,
      });
      // Insert the newer unread reply first: timestamp ordering must take precedence over id.
      await addMessage({ createdAt: new Date(now.getTime() - 30_000) });
      const oldestUnread = await addMessage({ createdAt: new Date(now.getTime() - 60_000) });
      const before = await snapshot();
      const expectedDueAt = new Date(oldestUnread.createdAt.getTime() + 5 * 60 * 1000);

      await expect(service.prepareReminder(reminder.id, now)).resolves.toBeNull();

      expect(await snapshot()).toEqual({
        ...before,
        reminders: before.reminders.map((row) =>
          row.id === reminder.id ? { ...row, dueAt: expectedDueAt } : row,
        ),
      });
      await expect(service.findDueReminders(now)).resolves.not.toContainEqual(
        expect.objectContaining({ id: reminder.id }),
      );
    });

    it.each([
      { age: 5 * 60 * 1000 - 1, ready: false, label: 'one millisecond before five minutes' },
      { age: 5 * 60 * 1000, ready: true, label: 'exactly five minutes' },
      { age: 5 * 60 * 1000 + 1, ready: true, label: 'one millisecond after five minutes' },
    ])('should enforce the minimum unread age at $label', async ({ age, ready }) => {
      const message = await addMessage({ createdAt: new Date(now.getTime() - age) });
      const before = await snapshot();

      const result = await service.prepareReminder(reminder.id, now);

      expect(result).toEqual(ready ? reminder : null);
      expect(await snapshot()).toEqual({
        ...before,
        reminders: ready
          ? before.reminders
          : [
              {
                ...reminder,
                dueAt: new Date(message.createdAt.getTime() + 5 * 60 * 1000),
              },
            ],
      });
    });

    it('should keep an eligible reminder pending without postponing for newer replies or reserving it on repeated preparation', async () => {
      await addMessage({ createdAt: new Date(now.getTime() - 6 * 60_000) });
      await addMessage({ createdAt: new Date(now.getTime() - 60_000) });
      const before = await snapshot();

      await expect(service.prepareReminder(reminder.id, now)).resolves.toEqual(reminder);
      await expect(service.prepareReminder(reminder.id, now)).resolves.toEqual(reminder);

      expect(await snapshot()).toEqual(before);
    });

    it.each(['cancellation', 'postponement'] as const)(
      'should roll back %s if commit fails, propagate the error and allow a retry',
      async (operation) => {
        if (operation === 'postponement') await addMessage();
        const before = await snapshot();
        const source = reminders.manager.connection;
        const runner = source.createQueryRunner();
        const error = new Error('Simulated reminder preparation commit failure');
        const createRunner = vi.spyOn(source, 'createQueryRunner').mockReturnValue(runner);
        const commit = vi.spyOn(runner, 'commitTransaction').mockImplementationOnce(async () => {
          const inside = await reminders.findOneByOrFail({ id: reminder.id });
          expect(inside).toEqual(
            operation === 'cancellation'
              ? { ...reminder, status: ReminderStatus.CANCELLED }
              : { ...reminder, dueAt: new Date(now.getTime() + 4 * 60_000) },
          );
          throw error;
        });
        try {
          await expect(service.prepareReminder(reminder.id, now)).rejects.toBe(error);
          expect(commit).toHaveBeenCalledOnce();
        } finally {
          commit.mockRestore();
          createRunner.mockRestore();
        }
        expect(await snapshot()).toEqual(before);

        await expect(service.prepareReminder(reminder.id, now)).resolves.toBeNull();
        expect(await reminders.findOneByOrFail({ id: reminder.id })).toEqual(
          operation === 'cancellation'
            ? { ...reminder, status: ReminderStatus.CANCELLED }
            : { ...reminder, dueAt: new Date(now.getTime() + 4 * 60_000) },
        );
      },
    );

    it('should use the current time when preparing without an explicit date', async () => {
      await addMessage({ createdAt: new Date(now.getTime() - 5 * 60_000) });
      const before = await snapshot();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      try {
        await expect(service.prepareReminder(reminder.id)).resolves.toEqual(reminder);
      } finally {
        vi.useRealTimers();
      }
      expect(await snapshot()).toEqual(before);
    });
  });
});
