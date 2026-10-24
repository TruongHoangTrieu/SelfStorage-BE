import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { AiController } from './ai.controller';
import { InternalController } from './internal.controller';
import { AiService } from './ai.service';
import { InternalKeyGuard } from './guards/internal-key.guard';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [AiController, InternalController],
  providers: [AiService, InternalKeyGuard],
  exports: [AiService],
})
export class AiModule {}
