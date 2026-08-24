-- CreateEnum
CREATE TYPE "InventoryReturnStatus" AS ENUM ('ok', 'damaged', 'missing');

-- AlterEnum
ALTER TYPE "LeaseDocumentKind" ADD VALUE 'return_act';

-- AlterTable
ALTER TABLE "lease_inventory_items" ADD COLUMN     "damageAmount" DECIMAL(12,2),
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnStatus" "InventoryReturnStatus";

-- AlterTable
ALTER TABLE "leases" ADD COLUMN     "returnActConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "returnActDamageTotal" DECIMAL(12,2),
ADD COLUMN     "returnActDepositReturn" DECIMAL(12,2),
ADD COLUMN     "returnActSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "returnActUncovered" DECIMAL(12,2),
ADD COLUMN     "returnActUncoveredRemaining" DECIMAL(12,2);
