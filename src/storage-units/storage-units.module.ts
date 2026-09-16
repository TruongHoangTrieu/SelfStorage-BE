import { Module } from '@nestjs/common';
import { StorageUnitsController } from './storage-units.controller';
import { StorageUnitsService } from './storage-units.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StorageUnitsController],
  providers: [StorageUnitsService],
  exports: [StorageUnitsService],
})
export class StorageUnitsModule {}
