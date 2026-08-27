import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeasesService } from './leases.service';
import { LeasesController } from './leases.controller';
import { InvitationsController } from './invitations.controller';
import { InvitationLinkController } from './invitation-link.controller';
import { LeaseSignedScansService } from './lease-signed-scans.service';
import { LeaseSignedScansController } from './lease-signed-scans.controller';
import { LeaseSignedScansAdminController } from './lease-signed-scans-admin.controller';
import { LeaseDocumentsService } from './lease-documents.service';
import { LeaseDocumentsController } from './lease-documents.controller';
import { LeaseInventoryItemsService } from './lease-inventory-items.service';
import { LeaseInventoryItemsController } from './lease-inventory-items.controller';
import { LeaseReturnActService } from './lease-return-act.service';
import { LeaseReturnActController } from './lease-return-act.controller';

@Module({
  imports: [PropertiesModule, NotificationsModule],
  controllers: [
    LeasesController,
    InvitationsController,
    InvitationLinkController,
    LeaseSignedScansController,
    LeaseSignedScansAdminController,
    LeaseDocumentsController,
    LeaseInventoryItemsController,
    LeaseReturnActController,
  ],
  providers: [
    LeasesService,
    LeaseSignedScansService,
    LeaseDocumentsService,
    LeaseInventoryItemsService,
    LeaseReturnActService,
  ],
  exports: [LeasesService],
})
export class LeasesModule {}
