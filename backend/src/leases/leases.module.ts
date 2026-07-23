import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeasesService } from './leases.service';
import { LeasesController } from './leases.controller';
import { InvitationsController } from './invitations.controller';
import { LeaseSignedScansService } from './lease-signed-scans.service';
import { LeaseSignedScansController } from './lease-signed-scans.controller';
import { LeaseSignedScansAdminController } from './lease-signed-scans-admin.controller';
import { LeaseDocumentsService } from './lease-documents.service';
import { LeaseDocumentsController } from './lease-documents.controller';

@Module({
  imports: [PropertiesModule, NotificationsModule],
  controllers: [
    LeasesController,
    InvitationsController,
    LeaseSignedScansController,
    LeaseSignedScansAdminController,
    LeaseDocumentsController,
  ],
  providers: [LeasesService, LeaseSignedScansService, LeaseDocumentsService],
  exports: [LeasesService],
})
export class LeasesModule {}
