import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from '../sms/sms.module';
import { CredentialDeliveryService } from './credential-delivery.service';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailNotificationService } from './email-notification.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SendGridEmailService } from './sendgrid-email.service';
import { SmtpEmailService } from './smtp-email.service';

@Module({
  imports: [ConfigModule, SmsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmtpEmailService,
    SendGridEmailService,
    EmailDeliveryService,
    CredentialDeliveryService,
    EmailNotificationService,
  ],
  exports: [
    NotificationsService,
    CredentialDeliveryService,
    EmailNotificationService,
  ],
})
export class NotificationsModule {}
