import { Module } from '@nestjs/common';
import { StorageUnitTypesController } from './storage-unit-types.controller';
import { StorageUnitTypesService } from './storage-unit-types.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StorageUnitTypesController],
  providers: [StorageUnitTypesService],
  exports: [StorageUnitTypesService],
})
export class StorageUnitTypesModule {}
