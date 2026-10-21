import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { SePayService } from './sepay/sepay.service';
import { DatabaseModule } from '../database/database.module';

import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, SePayService],
  exports: [PaymentsService, SePayService],
})
export class PaymentsModule {}
