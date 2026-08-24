-- AlterTable
ALTER TABLE "services" ADD COLUMN     "billedAt" TIMESTAMP(3),
ADD COLUMN     "payer" "SettlementPayer" NOT NULL DEFAULT 'tenant',
ADD COLUMN     "sourceRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "services_sourceRequestId_key" ON "services"("sourceRequestId");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
