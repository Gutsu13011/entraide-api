import { Module } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequest } from './service-request.entity.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { ServiceProvidersModule } from '../service-providers/service-providers.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceRequestMessage } from './service-request-message.entity.js';
import { ServiceRequestMessageReminder } from './service-request-message-reminder.entity.js';
import { ServiceRequestMessageRemindersService } from './service-request-message-reminders.service.js';
import { MailModule } from '../mail/mail.module.js';
import { ServiceRequestMessageRemindersJob } from './service-request-message-reminders.job.js';
import { ServiceRequestMessagesGateway } from './service-request-messages.gateway.js';

@Module({
  providers: [
    ServiceRequestsService,
    ServiceRequestMessageRemindersService,
    ServiceRequestMessageRemindersJob,
    ServiceRequestMessagesGateway,
  ],
  controllers: [ServiceRequestsController],
  imports: [
    TypeOrmModule.forFeature([
      ServiceRequest,
      ServiceOffering,
      ServiceRequestMessage,
      ServiceRequestMessageReminder,
    ]),
    ServiceProvidersModule,
    AuthModule,
    MailModule,
  ],
})
export class ServiceRequestsModule {}
