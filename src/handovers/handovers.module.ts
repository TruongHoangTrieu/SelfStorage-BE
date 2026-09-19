import { Module } from '@nestjs/common';
import { HandoversService } from './handovers.service';
import { HandoversController } from './handovers.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [HandoversController],
  providers: [HandoversService],
  exports: [HandoversService],
})
export class HandoversModule {}
