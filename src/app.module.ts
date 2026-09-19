import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { StorageUnitTypesModule } from './storage-unit-types/storage-unit-types.module';
import { StorageUnitsModule } from './storage-units/storage-units.module';
import { ReservationsModule } from './reservations/reservations.module';
import { HandoversModule } from './handovers/handovers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    FacilitiesModule,
    StorageUnitTypesModule,
    StorageUnitsModule,
    ReservationsModule,
    HandoversModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
