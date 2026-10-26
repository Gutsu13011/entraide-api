import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, SMTPSentMessageInfo, Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter<SMTPSentMessageInfo>;

  constructor(private readonly configService: ConfigService) {
    this.transporter = createTransport({
      host: configService.getOrThrow<string>('SMTP_HOST'),
      port: configService.getOrThrow<number>('SMTP_PORT'),
      secure: configService.getOrThrow<boolean>('SMTP_SECURE'),
    });
  }

  async sendText(to: string, subject: string, text: string): Promise<void> {
    const result = await this.transporter.sendMail({
      from: {
        name: 'Entraide',
        address: this.configService.getOrThrow<string>('MAIL_FROM'),
      },
      to: { address: to },
      subject,
      text,
    });

    if (result.accepted.length !== 1 || result.rejected.length > 0) {
      throw new Error('SMTP server did not accept the recipient');
    }
  }
}
