import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/user.entity.js';
import { ServiceRequest } from '../src/service-requests/service-request.entity.js';
import { ServiceRequestStatus } from '../src/service-requests/service-request-status.enum.js';
import { ServicePricingType } from '../src/service-offerings/service-pricing-type.enum.js';
import { ServiceRequestMessage } from '../src/service-requests/service-request-message.entity.js';
import { ServiceRequestMessageReminder } from '../src/service-requests/service-request-message-reminder.entity.js';
import { ServiceRequestMessageReminderStatus as ReminderStatus } from '../src/service-requests/service-request-message-reminder-status.enum.js';
import { ServiceRequestMessageRemindersService } from '../src/service-requests/service-request-message-reminders.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service.js';
import { ServiceRequestMessageRemindersJob } from '../src/service-requests/service-request-message-reminders.job.js';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

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

  it('should register the reminder job provider but disable automatic cron registration in the test environment', () => {
    const config = app.get(ConfigService);
    expect(config.getOrThrow<string>('NODE_ENV')).toBe('test');
    expect(typeof config.getOrThrow<boolean>('MESSAGE_REMINDERS_ENABLED')).toBe('boolean');
    expect(app.get(ServiceRequestMessageRemindersJob)).toBeInstanceOf(
      ServiceRequestMessageRemindersJob,
    );
    expect(app.get(SchedulerRegistry).getCronJobs().size).toBe(0);
  });

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

  function expectedPreparedReminder(reminder: ServiceRequestMessageReminder) {
    const recipient = users.find((user) => user.id === reminder.recipientUserId)!;
    return {
      ...reminder,
      recipientUser: expect.objectContaining({
        id: recipient.id,
        firstName: recipient.firstName,
        email: recipient.email,
      }),
      serviceRequest: expect.objectContaining({
        id: reminder.serviceRequestId,
        offeringTitleSnapshot: 'Conseil',
      }),
    };
  }

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

      expect(result).toEqual(ready ? expectedPreparedReminder(reminder) : null);
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

      await expect(service.prepareReminder(reminder.id, now)).resolves.toEqual(
        expectedPreparedReminder(reminder),
      );
      await expect(service.prepareReminder(reminder.id, now)).resolves.toEqual(
        expectedPreparedReminder(reminder),
      );

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
        await expect(service.prepareReminder(reminder.id)).resolves.toEqual(
          expectedPreparedReminder(reminder),
        );
      } finally {
        vi.useRealTimers();
      }
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('prepareReminderEmail', () => {
    let reminder: ServiceRequestMessageReminder;
    let sendText: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      [reminder] = await seedReminders([{ dueAt: now }]);
      // Preparation must never send SMTP, even if a regression accidentally calls MailService.
      sendText = vi
        .spyOn(app.get(MailService), 'sendText')
        .mockRejectedValue(new Error('Unexpected email send during preparation'));
    });

    afterEach(() => {
      expect(sendText).not.toHaveBeenCalled();
      sendText.mockRestore();
    });

    async function snapshot() {
      return {
        reminders: await reminders.find({ order: { id: 'ASC' } }),
        requests: await requests.find({ order: { id: 'ASC' } }),
        messages: await messages.find({ order: { id: 'ASC' } }),
      };
    }

    function addReceivedMessage(age = 5 * 60_000) {
      return messages.save({
        serviceRequestId: reminder.serviceRequestId,
        authorUserId: users.find((user) => user.id !== reminder.recipientUserId)!.id,
        content: 'Contenu privé de la discussion à ne pas inclure dans le rappel.',
        createdAt: new Date(now.getTime() - age),
        readAt: null,
      });
    }

    it.each(['requester', 'recipient'] as const)(
      'should prepare only email fields for the recorded %s using current account details and the historical offering title',
      async (role) => {
        const person = role === 'requester' ? users[0] : users[1];
        await reminders.update(reminder.id, { recipientUserId: person.id });
        reminder = await reminders.findOneByOrFail({ id: reminder.id });
        const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
        await userRepository.update(person.id, {
          firstName: 'Élodie',
          email: 'elodie@example.test',
        });
        await requests.update(reminder.serviceRequestId, {
          offeringTitleSnapshot: 'Aide à l’électricité',
        });
        await addReceivedMessage();
        const before = await snapshot();

        const email = await service.prepareReminderEmail(reminder.id, now);

        expect(email).toEqual({
          to: 'elodie@example.test',
          subject: 'Entraide : des messages vous attendent',
          text: 'Bonjour Élodie,\n\nDes messages non lus vous attendent concernant « Aide à l’électricité ».\n\nConnectez-vous à Entraide pour consulter votre discussion.\n\nL’équipe Entraide',
        });
        const prepared = await service.prepareReminder(reminder.id, now);
        expect(prepared!.recipientUser).toMatchObject({
          id: person.id,
          firstName: 'Élodie',
          email: 'elodie@example.test',
        });
        expect(prepared!.recipientUser.passwordHash).toBeUndefined();
        expect(prepared!.serviceRequest).toMatchObject({
          id: reminder.serviceRequestId,
          offeringTitleSnapshot: 'Aide à l’électricité',
          serviceOfferingId: null,
        });
        await expect(service.prepareReminderEmail(reminder.id, now)).resolves.toEqual(email);
        expect(await snapshot()).toEqual(before);
      },
    );

    it.each(['missing', 'sent', 'cancelled', 'future'] as const)(
      'should return no email for a %s reminder and preserve stored data',
      async (kind) => {
        await addReceivedMessage();
        if (kind === 'sent') {
          await reminders.update(reminder.id, { status: ReminderStatus.SENT, sentAt: now });
        } else if (kind === 'cancelled') {
          await reminders.update(reminder.id, { status: ReminderStatus.CANCELLED });
        } else if (kind === 'future') {
          await reminders.update(reminder.id, { dueAt: new Date(now.getTime() + 1) });
        }
        const before = await snapshot();

        await expect(
          service.prepareReminderEmail(kind === 'missing' ? 999_999 : reminder.id, now),
        ).resolves.toBeNull();
        expect(await snapshot()).toEqual(before);
      },
    );

    it('should cancel a reminder and return no email when all received messages have been read', async () => {
      const message = await addReceivedMessage();
      await messages.update(message.id, { readAt: now });
      const before = await snapshot();

      await expect(service.prepareReminderEmail(reminder.id, now)).resolves.toBeNull();

      expect(await snapshot()).toEqual({
        ...before,
        reminders: [{ ...reminder, status: ReminderStatus.CANCELLED }],
      });
    });

    it('should postpone a reminder and return no email while the oldest unread message is too recent', async () => {
      await addReceivedMessage(60_000);
      const before = await snapshot();

      await expect(service.prepareReminderEmail(reminder.id, now)).resolves.toBeNull();

      expect(await snapshot()).toEqual({
        ...before,
        reminders: [{ ...reminder, dueAt: new Date(now.getTime() + 4 * 60_000) }],
      });
    });

    it('should use the current time when no preparation date is supplied', async () => {
      await addReceivedMessage();
      const before = await snapshot();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      try {
        await expect(service.prepareReminderEmail(reminder.id)).resolves.toMatchObject({
          to: users[1].email,
          subject: 'Entraide : des messages vous attendent',
          text: expect.stringContaining('Bonjour Bruno,'),
        });
      } finally {
        vi.useRealTimers();
      }
      expect(await snapshot()).toEqual(before);
    });

    it('should propagate a relation reload failure from the transaction without returning an email', async () => {
      await addReceivedMessage();
      const before = await snapshot();
      const error = new Error('Recipient relation reload failed');
      const reload = vi
        .spyOn(Repository.prototype, 'findOneOrFail')
        .mockImplementationOnce(async function () {
          expect(this.metadata.target).toBe(ServiceRequestMessageReminder);
          expect(this.manager.queryRunner?.isTransactionActive).toBe(true);
          throw error;
        });
      try {
        await expect(service.prepareReminderEmail(reminder.id, now)).rejects.toBe(error);
        expect(reload).toHaveBeenCalledOnce();
      } finally {
        reload.mockRestore();
      }
      expect(await snapshot()).toEqual(before);
    });

    it('should not return an email when commit fails and should allow a later explicit retry', async () => {
      await addReceivedMessage();
      const before = await snapshot();
      const source = reminders.manager.connection;
      const runner = source.createQueryRunner();
      const error = new Error('Prepared email transaction commit failed');
      const createRunner = vi.spyOn(source, 'createQueryRunner').mockReturnValue(runner);
      const commit = vi.spyOn(runner, 'commitTransaction').mockRejectedValueOnce(error);
      try {
        await expect(service.prepareReminderEmail(reminder.id, now)).rejects.toBe(error);
        expect(commit).toHaveBeenCalledOnce();
      } finally {
        commit.mockRestore();
        createRunner.mockRestore();
      }
      expect(await snapshot()).toEqual(before);
      await expect(service.prepareReminderEmail(reminder.id, now)).resolves.toMatchObject({
        to: users[1].email,
        text: expect.stringContaining('Bonjour Bruno,'),
      });
    });
  });

  describe('sendReminder', () => {
    let reminder: ServiceRequestMessageReminder;
    let originalMessage: ServiceRequestMessage;
    let sendText: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      [reminder] = await seedReminders([{ dueAt: now }]);
      originalMessage = await messages.save({
        serviceRequestId: reminder.serviceRequestId,
        authorUserId: users[0].id,
        content: 'Une réponse encore non lue',
        createdAt: new Date(now.getTime() - 5 * 60_000),
        readAt: null,
      });
      sendText = vi.spyOn(app.get(MailService), 'sendText').mockResolvedValue(undefined);
    });

    afterEach(() => {
      sendText.mockRestore();
    });

    async function snapshot() {
      return {
        reminders: await reminders.find({ order: { id: 'ASC' } }),
        requests: await requests.find({ order: { id: 'ASC' } }),
        messages: await messages.find({ order: { id: 'ASC' } }),
      };
    }

    it.each(['requester', 'recipient'] as const)(
      'should send to the recorded %s and mark only that reminder sent after SMTP acceptance',
      async (role) => {
        const person = role === 'requester' ? users[0] : users[1];
        const author = users.find((user) => user.id !== person.id)!;
        await reminders.update(reminder.id, { recipientUserId: person.id });
        reminder = await reminders.findOneByOrFail({ id: reminder.id });
        await messages.update(originalMessage.id, { authorUserId: author.id });
        await seedReminders([{ dueAt: now }]);
        const before = await snapshot();
        const startedAt = Date.now();
        sendText.mockImplementationOnce(async () => {
          expect(reminders.manager.connection.createQueryRunner().isTransactionActive).toBe(false);
          expect(await reminders.findOneByOrFail({ id: reminder.id })).toEqual(reminder);
        });

        await expect(service.sendReminder(reminder.id, now)).resolves.toBe(true);

        expect(sendText).toHaveBeenCalledExactlyOnceWith(
          person.email,
          'Entraide : des messages vous attendent',
          `Bonjour ${person.firstName},\n\nDes messages non lus vous attendent concernant « Conseil ».\n\nConnectez-vous à Entraide pour consulter votre discussion.\n\nL’équipe Entraide`,
        );
        const sent = await reminders.findOneByOrFail({ id: reminder.id });
        expect(sent).toEqual({
          ...reminder,
          status: ReminderStatus.SENT,
          sentAt: expect.any(Date),
        });
        expect(sent.sentAt!.getTime()).toBeGreaterThanOrEqual(startedAt);
        expect(sent.sentAt!.getTime()).toBeLessThanOrEqual(Date.now());
        expect(await snapshot()).toEqual({
          ...before,
          reminders: before.reminders.map((row) => (row.id === sent.id ? sent : row)),
        });
        await expect(service.sendReminder(reminder.id, now)).resolves.toBe(false);
        expect(sendText).toHaveBeenCalledOnce();
      },
    );

    it.each(['missing', 'sent', 'cancelled', 'future'] as const)(
      'should skip a %s reminder without SMTP or data changes',
      async (kind) => {
        if (kind === 'sent')
          await reminders.update(reminder.id, { status: ReminderStatus.SENT, sentAt: now });
        else if (kind === 'cancelled')
          await reminders.update(reminder.id, { status: ReminderStatus.CANCELLED });
        else if (kind === 'future')
          await reminders.update(reminder.id, { dueAt: new Date(now.getTime() + 1) });
        const before = await snapshot();

        await expect(
          service.sendReminder(kind === 'missing' ? 999_999 : reminder.id, now),
        ).resolves.toBe(false);

        expect(sendText).not.toHaveBeenCalled();
        expect(await snapshot()).toEqual(before);
      },
    );

    it('should cancel a now-read reminder and skip SMTP', async () => {
      await messages.update(originalMessage.id, { readAt: now });
      await expect(service.sendReminder(reminder.id, now)).resolves.toBe(false);
      expect(sendText).not.toHaveBeenCalled();
      expect(await reminders.findOneByOrFail({ id: reminder.id })).toEqual({
        ...reminder,
        status: ReminderStatus.CANCELLED,
      });
    });

    it('should release the guard after postponement and allow a send once the new deadline is reached', async () => {
      await messages.update(originalMessage.id, { createdAt: new Date(now.getTime() - 60_000) });
      const eligibleAt = new Date(now.getTime() + 4 * 60_000);

      await expect(service.sendReminder(reminder.id, now)).resolves.toBe(false);
      expect(sendText).not.toHaveBeenCalled();
      expect(await reminders.findOneByOrFail({ id: reminder.id })).toEqual({
        ...reminder,
        dueAt: eligibleAt,
      });
      await expect(service.sendReminder(reminder.id, eligibleAt)).resolves.toBe(true);
      expect(sendText).toHaveBeenCalledOnce();
    });

    it('should preserve pending state after SMTP failure and release the guard for an explicit retry', async () => {
      const before = await snapshot();
      const error = new Error('SMTP unavailable');
      sendText.mockRejectedValueOnce(error);

      await expect(service.sendReminder(reminder.id, now)).rejects.toBe(error);
      expect(await snapshot()).toEqual(before);
      expect(sendText).toHaveBeenCalledOnce();

      await expect(service.sendReminder(reminder.id, now)).resolves.toBe(true);
      expect(sendText).toHaveBeenCalledTimes(2);
    });

    it('should propagate preparation failure without SMTP and release the guard for retry', async () => {
      const before = await snapshot();
      const error = new Error('Preparation failed');
      const prepare = vi.spyOn(service, 'prepareReminderEmail').mockRejectedValueOnce(error);
      try {
        await expect(service.sendReminder(reminder.id, now)).rejects.toBe(error);
        expect(sendText).not.toHaveBeenCalled();
        expect(await snapshot()).toEqual(before);
      } finally {
        prepare.mockRestore();
      }
      await expect(service.sendReminder(reminder.id, now)).resolves.toBe(true);
    });

    it('should propagate a database failure after SMTP acceptance and release the guard without pretending SMTP was undone', async () => {
      const before = await snapshot();
      await reminders.query(
        `CREATE TRIGGER fail_test_sent_update BEFORE UPDATE ON service_request_message_reminders WHEN NEW.status = 'SENT' BEGIN SELECT RAISE(ABORT, 'Simulated sent storage failure'); END`,
      );
      try {
        await expect(service.sendReminder(reminder.id, now)).rejects.toThrow(
          'Simulated sent storage failure',
        );
      } finally {
        await reminders.query('DROP TRIGGER fail_test_sent_update');
      }
      expect(sendText).toHaveBeenCalledOnce();
      expect(await snapshot()).toEqual(before);
      // This is an explicit retry after acceptance: SMTP and SQLite cannot commit atomically.
      await expect(service.sendReminder(reminder.id, now)).resolves.toBe(true);
      expect(sendText).toHaveBeenCalledTimes(2);
    });

    it('should reject a send result when the reminder disappeared before its sent state could be recorded', async () => {
      sendText.mockImplementationOnce(async () => {
        await reminders.delete(reminder.id);
      });

      await expect(service.sendReminder(reminder.id, now)).rejects.toThrow(
        'Sent reminder could not be recorded',
      );

      expect(sendText).toHaveBeenCalledOnce();
      expect(await reminders.count()).toBe(0);
      expect(await messages.findOneByOrFail({ id: originalMessage.id })).toEqual(originalMessage);
    });

    it('should record an accepted email even if reading cancelled the reminder in flight and preserve a new pending reminder', async () => {
      const requestService = app.get(ServiceRequestsService);
      let nextReminder!: ServiceRequestMessageReminder;
      sendText.mockImplementationOnce(async () => {
        await requestService.markMessagesAsRead(
          reminder.serviceRequestId,
          { upToMessageId: originalMessage.id },
          users[1].id,
        );
        expect((await reminders.findOneByOrFail({ id: reminder.id })).status).toBe(
          ReminderStatus.CANCELLED,
        );
        await requestService.createMessage(
          reminder.serviceRequestId,
          { content: 'Nouvelle réponse après lecture' },
          users[0].id,
        );
        nextReminder = await reminders.findOneByOrFail({
          serviceRequestId: reminder.serviceRequestId,
          recipientUserId: reminder.recipientUserId,
          status: ReminderStatus.PENDING,
        });
        expect(nextReminder.id).not.toBe(reminder.id);
      });

      await expect(service.sendReminder(reminder.id, now)).resolves.toBe(true);

      expect(await reminders.findOneByOrFail({ id: nextReminder.id })).toEqual(nextReminder);
      expect(await reminders.findOneByOrFail({ id: reminder.id })).toMatchObject({
        status: ReminderStatus.SENT,
        sentAt: expect.any(Date),
      });
      expect(await reminders.count()).toBe(2);
      expect(sendText).toHaveBeenCalledOnce();
    });

    it('should skip concurrent calls for the same id and timestamp the send after the deferred SMTP confirmation', async () => {
      let accept!: () => void;
      sendText.mockReturnValue(
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
      );
      const pending = service.sendReminder(reminder.id, now);
      try {
        await expect(service.sendReminder(reminder.id, now)).resolves.toBe(false);
        await vi.waitFor(() => expect(sendText).toHaveBeenCalledOnce());
        expect(await reminders.findOneByOrFail({ id: reminder.id })).toEqual(reminder);
        const confirmedAt = new Date(now.getTime() + 2 * 60_000);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(confirmedAt);
        accept();
        await expect(pending).resolves.toBe(true);
        expect(await reminders.findOneByOrFail({ id: reminder.id })).toEqual({
          ...reminder,
          status: ReminderStatus.SENT,
          sentAt: confirmedAt,
        });
      } finally {
        accept();
        await pending.catch(() => undefined);
        vi.useRealTimers();
      }
    });

    it('should hold the per-id guard and not report success until the sent update finishes', async () => {
      const realUpdate = reminders.update.bind(reminders);
      let finishUpdate!: () => void;
      const gate = new Promise<void>((resolve) => {
        finishUpdate = resolve;
      });
      const update = vi.spyOn(reminders, 'update').mockImplementationOnce(async (...args) => {
        await gate;
        return realUpdate(...args);
      });
      const settled = vi.fn();
      const pending = service.sendReminder(reminder.id, now);
      void pending.then(settled);
      try {
        await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
        expect(sendText).toHaveBeenCalledOnce();
        expect(settled).not.toHaveBeenCalled();
        await expect(service.sendReminder(reminder.id, now)).resolves.toBe(false);
        expect(await reminders.findOneByOrFail({ id: reminder.id })).toEqual(reminder);
        finishUpdate();
        await expect(pending).resolves.toBe(true);
        expect(settled).toHaveBeenCalledOnce();
      } finally {
        finishUpdate();
        await pending.catch(() => undefined);
        update.mockRestore();
      }
    });
  });
});
