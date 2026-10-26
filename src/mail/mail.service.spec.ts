import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';
import { MailModule } from './mail.module.js';

const smtp = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({ createTransport: smtp.createTransport }));

describe('MailService', () => {
  const recipient = 'alice@entraide.test';
  const subject = 'Des messages vous attendent';
  const text = 'Bonjour Alice,\nVous avez des messages non lus.\nÀ bientôt !';
  const settings: Record<string, string | number | boolean> = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    MAIL_FROM: 'no-reply@entraide.test',
  };
  const config = { getOrThrow: vi.fn() };
  let service: MailService;

  beforeEach(() => {
    vi.resetAllMocks();
    config.getOrThrow.mockImplementation((key: string) => {
      if (!(key in settings)) throw new Error(`Missing configuration: ${key}`);
      return settings[key];
    });
    smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
    smtp.sendMail.mockResolvedValue({ accepted: [recipient], rejected: [] });
    service = new MailService(config as unknown as ConfigService);
  });

  it('should configure one reusable transporter without sending during construction', async () => {
    expect(smtp.createTransport).toHaveBeenCalledExactlyOnceWith({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
    });
    expect(smtp.sendMail).not.toHaveBeenCalled();

    await service.sendText(recipient, subject, text);
    await service.sendText(recipient, 'Deuxième rappel', 'Autre texte');

    expect(smtp.createTransport).toHaveBeenCalledOnce();
    expect(smtp.sendMail).toHaveBeenCalledTimes(2);
  });

  it('should send one structured recipient with the configured sender and preserve Unicode and line breaks', async () => {
    await expect(service.sendText(recipient, subject, text)).resolves.toBeUndefined();

    expect(smtp.sendMail).toHaveBeenCalledExactlyOnceWith({
      from: { name: 'Entraide', address: 'no-reply@entraide.test' },
      to: { address: recipient },
      subject,
      text,
    });
  });

  it('should remain pending until SMTP acceptance is confirmed', async () => {
    let accept!: (result: { accepted: string[]; rejected: string[] }) => void;
    smtp.sendMail.mockReturnValue(
      new Promise((resolve) => {
        accept = resolve;
      }),
    );
    const settled = vi.fn();
    const pending = service.sendText(recipient, subject, text);
    void pending.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    accept({ accepted: [recipient], rejected: [] });
    await expect(pending).resolves.toBeUndefined();
    expect(settled).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'a rejected recipient', accepted: [], rejected: [recipient] },
    { label: 'no accepted recipient', accepted: [], rejected: [] },
    {
      label: 'an unexpected partial rejection',
      accepted: [recipient],
      rejected: ['other@entraide.test'],
    },
    {
      label: 'more than one accepted recipient',
      accepted: [recipient, 'other@entraide.test'],
      rejected: [],
    },
  ])('should reject $label instead of reporting success', async ({ accepted, rejected }) => {
    smtp.sendMail.mockResolvedValue({ accepted, rejected });

    await expect(service.sendText(recipient, subject, text)).rejects.toThrow(
      'SMTP server did not accept the recipient',
    );
    expect(smtp.sendMail).toHaveBeenCalledOnce();
  });

  it('should propagate a connection failure without an automatic retry and allow a later explicit retry', async () => {
    const error = Object.assign(new Error('SMTP unavailable'), { code: 'ECONNREFUSED' });
    smtp.sendMail.mockRejectedValueOnce(error);

    await expect(service.sendText(recipient, subject, text)).rejects.toBe(error);
    expect(smtp.sendMail).toHaveBeenCalledOnce();

    await expect(service.sendText(recipient, subject, text)).resolves.toBeUndefined();
    expect(smtp.sendMail).toHaveBeenCalledTimes(2);
    expect(smtp.createTransport).toHaveBeenCalledOnce();
  });

  it('should refuse to send if the sender configuration cannot be read', async () => {
    const error = new Error('Missing MAIL_FROM');
    config.getOrThrow.mockImplementation((key: string) => {
      if (key === 'MAIL_FROM') throw error;
      return settings[key];
    });

    await expect(service.sendText(recipient, subject, text)).rejects.toBe(error);
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it('should expose MailService to an importing module through MailModule', async () => {
    const consumer = Symbol('mail-consumer');
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), MailModule],
      providers: [
        { provide: consumer, inject: [MailService], useFactory: (mail: MailService) => mail },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    try {
      const importedService = module.get<MailService>(consumer);
      expect(importedService).toBeInstanceOf(MailService);
      await expect(importedService.sendText(recipient, subject, text)).resolves.toBeUndefined();
    } finally {
      await module.close();
    }
  });
});
