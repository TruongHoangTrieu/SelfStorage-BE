import { Module } from '@nestjs/common';
import { HandoversService } from './handovers.service';
import { HandoversController } from './handovers.controller';
import { DatabaseModule } from '../database/database.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
  imports: [DatabaseModule, CloudinaryModule],
  controllers: [HandoversController],
  providers: [HandoversService],
  exports: [HandoversService],
})
export class HandoversModule {}
