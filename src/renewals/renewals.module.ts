import { Module } from '@nestjs/common';
import { RenewalsController } from './renewals.controller';
import { RenewalsService } from './renewals.service';
import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, AiModule, NotificationsModule],
  controllers: [RenewalsController],
  providers: [RenewalsService],
  exports: [RenewalsService],
})
export class RenewalsModule {}
