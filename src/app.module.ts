import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { OperationsModule } from './operations/operations.module';
import { ContractsModule } from './contracts/contracts.module';
import { SupportModule } from './support/support.module';
import { PaymentsModule } from './payments/payments.module';
import { RenewalsModule } from './renewals/renewals.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CloudinaryModule,
    UsersModule,
    AuthModule,
    FacilitiesModule,
    StorageUnitTypesModule,
    StorageUnitsModule,
    ReservationsModule,
    HandoversModule,
    OperationsModule,
    ContractsModule,
    SupportModule,
    PaymentsModule,
    RenewalsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
