import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { ServiceRequestMessageRemindersJob } from './service-request-message-reminders.job.js';
import { ServiceRequestMessageRemindersService } from './service-request-message-reminders.service.js';

describe('ServiceRequestMessageRemindersJob', () => {
  const config = { getOrThrow: vi.fn() };
  const reminders = { findDueReminders: vi.fn(), sendReminder: vi.fn() };
  let job: ServiceRequestMessageRemindersJob;
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    config.getOrThrow.mockReturnValue(true);
    reminders.findDueReminders.mockResolvedValue([]);
    reminders.sendReminder.mockResolvedValue(true);
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    job = new ServiceRequestMessageRemindersJob(
      config as unknown as ConfigService,
      reminders as unknown as ServiceRequestMessageRemindersService,
    );
  });

  afterEach(() => {
    logError.mockRestore();
    vi.useRealTimers();
  });

  it('should skip the database and sending when reminders are disabled', async () => {
    config.getOrThrow.mockReturnValue(false);

    await expect(job.handleCron()).resolves.toBeUndefined();

    expect(config.getOrThrow).toHaveBeenCalledExactlyOnceWith('MESSAGE_REMINDERS_ENABLED');
    expect(reminders.findDueReminders).not.toHaveBeenCalled();
    expect(reminders.sendReminder).not.toHaveBeenCalled();
  });

  it('should finish without sending when the eligible batch is empty', async () => {
    await expect(job.handleCron()).resolves.toBeUndefined();

    expect(reminders.findDueReminders).toHaveBeenCalledExactlyOnceWith();
    expect(reminders.sendReminder).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('should wait for batch selection before starting a send', async () => {
    let select!: (rows: { id: number }[]) => void;
    reminders.findDueReminders.mockReturnValue(
      new Promise((resolve) => {
        select = resolve;
      }),
    );
    const pending = job.handleCron();
    expect(reminders.sendReminder).not.toHaveBeenCalled();

    select([{ id: 13 }]);
    await pending;
    expect(reminders.sendReminder).toHaveBeenCalledExactlyOnceWith(13);
  });

  it('should process the selected order sequentially, wait for each send and continue after a skipped reminder', async () => {
    reminders.findDueReminders.mockResolvedValue([{ id: 30 }, { id: 10 }, { id: 20 }]);
    let finishFirst!: (sent: boolean) => void;
    reminders.sendReminder
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const settled = vi.fn();
    const pending = job.handleCron();
    void pending.then(settled);
    try {
      await Promise.resolve();
      expect(reminders.sendReminder).toHaveBeenCalledExactlyOnceWith(30);
      expect(settled).not.toHaveBeenCalled();
      finishFirst(true);
      await pending;
      expect(reminders.sendReminder.mock.calls).toEqual([[30], [10], [20]]);
      expect(settled).toHaveBeenCalledOnce();
      expect(logError).not.toHaveBeenCalled();
    } finally {
      finishFirst(true);
      await pending;
    }
  });

  it.each([
    { label: 'an Error', error: new Error('SMTP unavailable') },
    { label: 'a non-Error rejection', error: 'SMTP disconnected' },
  ])(
    'should log $label for the failed reminder and continue to later reminders',
    async ({ error }) => {
      reminders.findDueReminders.mockResolvedValue([{ id: 10 }, { id: 20 }, { id: 30 }]);
      reminders.sendReminder
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(true);

      await expect(job.handleCron()).resolves.toBeUndefined();

      expect(reminders.sendReminder.mock.calls).toEqual([[10], [20], [30]]);
      expect(logError).toHaveBeenCalledExactlyOnceWith(
        'Failed to send message reminder 20',
        error instanceof Error ? error.stack : String(error),
      );
    },
  );

  it('should propagate a batch selection failure to the scheduler without attempting any send', async () => {
    const error = new Error('Database unavailable');
    reminders.findDueReminders.mockRejectedValue(error);

    await expect(job.handleCron()).rejects.toBe(error);
    expect(reminders.sendReminder).not.toHaveBeenCalled();
  });

  it('should fail before querying the database when the enabled configuration is unavailable', async () => {
    const error = new Error('Missing reminder configuration');
    config.getOrThrow.mockImplementation(() => {
      throw error;
    });

    await expect(job.handleCron()).rejects.toBe(error);
    expect(reminders.findDueReminders).not.toHaveBeenCalled();
    expect(reminders.sendReminder).not.toHaveBeenCalled();
  });

  it('should read the enabled configuration again on the next execution', async () => {
    config.getOrThrow.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await job.handleCron();
    expect(reminders.findDueReminders).not.toHaveBeenCalled();
    await job.handleCron();
    expect(reminders.findDueReminders).toHaveBeenCalledOnce();
  });

  async function createScheduledModule() {
    const module = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        ServiceRequestMessageRemindersJob,
        { provide: ConfigService, useValue: config },
        { provide: ServiceRequestMessageRemindersService, useValue: reminders },
      ],
    }).compile();
    await module.init();
    return module;
  }

  it('should register the named job and actually execute once per minute', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'));
    const module = await createScheduledModule();
    try {
      expect(
        module.get(SchedulerRegistry).getCronJobs().has('service-request-message-reminders'),
      ).toBe(true);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(reminders.findDueReminders).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(reminders.findDueReminders).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(reminders.findDueReminders).toHaveBeenCalledTimes(2);
    } finally {
      await module.close();
    }
  });

  it('should let the scheduler log a selection failure and try again at the next minute', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'));
    const error = new Error('Database temporarily unavailable');
    reminders.findDueReminders.mockRejectedValueOnce(error).mockResolvedValueOnce([{ id: 13 }]);
    const module = await createScheduledModule();
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(reminders.findDueReminders).toHaveBeenCalledOnce();
      expect(reminders.sendReminder).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(error);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(reminders.findDueReminders).toHaveBeenCalledTimes(2);
      expect(reminders.sendReminder).toHaveBeenCalledExactlyOnceWith(13);
    } finally {
      await module.close();
    }
  });

  it('should skip a scheduled tick while the previous batch is running and resume at a later minute', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'));
    reminders.findDueReminders.mockResolvedValue([{ id: 13 }]);
    let finishSend!: (sent: boolean) => void;
    reminders.sendReminder.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSend = resolve;
      }),
    );
    const module = await createScheduledModule();
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(reminders.sendReminder).toHaveBeenCalledExactlyOnceWith(13);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(reminders.findDueReminders).toHaveBeenCalledOnce();
      expect(reminders.sendReminder).toHaveBeenCalledOnce();
      finishSend(true);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(reminders.findDueReminders).toHaveBeenCalledTimes(2);
      expect(reminders.sendReminder).toHaveBeenCalledTimes(2);
    } finally {
      finishSend(true);
      await vi.advanceTimersByTimeAsync(0);
      await module.close();
    }
  });
});
