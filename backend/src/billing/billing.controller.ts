import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentProof } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BillingService, BillView, ProofFile } from './billing.service';
import { AddLineItemDto } from './dto/add-line-item.dto';

const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 МБ, как у сканов договора

@Controller()
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('leases/:leaseId/bills')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<BillView[]> {
    return this.billing.listBills(user.id, leaseId);
  }

  @Post('bills/:billId/line-items')
  addLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
    @Body() dto: AddLineItemDto,
  ): Promise<BillView> {
    return this.billing.addManualLine(user.id, billId, dto);
  }

  @Post('bills/:billId/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<BillView> {
    return this.billing.finalize(user.id, billId);
  }

  // Заявление об оплате с обязательным чеком (ADR-0019): multipart, поле
  // «file». Повторный вызов до подтверждения оплаты заменяет чек.
  @Post('bills/:billId/claim-paid')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PROOF_BYTES } }),
  )
  claimPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
    @UploadedFile() file: ProofFile | undefined,
  ): Promise<BillView> {
    if (!file) {
      throw new BadRequestException('Приложите чек об оплате (поле "file")');
    }
    return this.billing.claimPaid(user.id, billId, file);
  }

  @Get('bills/:billId/payment-proof')
  paymentProof(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<PaymentProof> {
    return this.billing.getPaymentProof(user.id, billId);
  }

  @Get('bills/:billId/payment-proof/file')
  @Header('Cache-Control', 'private, no-store')
  async paymentProofFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.billing.downloadPaymentProof(
      user.id,
      billId,
    );
    return new StreamableFile(buffer, { type: mimeType });
  }

  @Post('bills/:billId/confirm-paid')
  @HttpCode(HttpStatus.OK)
  confirmPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<BillView> {
    return this.billing.confirmPaid(user.id, billId);
  }

  @Post('bills/:billId/waive-penalty')
  @HttpCode(HttpStatus.OK)
  waivePenalty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<BillView> {
    return this.billing.waivePenalty(user.id, billId);
  }
}
