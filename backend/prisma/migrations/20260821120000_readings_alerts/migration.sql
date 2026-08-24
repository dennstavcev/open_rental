-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "readingsMissingAlertedAt" TIMESTAMP(3),
ADD COLUMN     "readingsOverdueAlertedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "bills_leaseId_periodStart_key" ON "bills"("leaseId", "periodStart");
