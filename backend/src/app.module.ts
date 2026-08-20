import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { StorageModule } from './storage/storage.module';
import { OcrModule } from './ocr/ocr.module';
import { AuthModule } from './auth/auth.module';
import { PropertiesModule } from './properties/properties.module';
import { ServicesModule } from './services/services.module';
import { MetersModule } from './meters/meters.module';
import { LeasesModule } from './leases/leases.module';
import { PartyInfoModule } from './party-info/party-info.module';
import { BillingModule } from './billing/billing.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { MessagesModule } from './messages/messages.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TerminationModule } from './termination/termination.module';
import { LegalModule } from './legal/legal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CryptoModule,
    StorageModule,
    OcrModule,
    NotificationsModule,
    AuthModule,
    PropertiesModule,
    ServicesModule,
    MetersModule,
    LeasesModule,
    PartyInfoModule,
    BillingModule,
    MaintenanceModule,
    MessagesModule,
    ReportsModule,
    TerminationModule,
    LegalModule,
  ],
})
export class AppModule {}
