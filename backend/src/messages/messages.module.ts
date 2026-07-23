import { Module } from '@nestjs/common';
import { LeasesModule } from '../leases/leases.module';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [LeasesModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
