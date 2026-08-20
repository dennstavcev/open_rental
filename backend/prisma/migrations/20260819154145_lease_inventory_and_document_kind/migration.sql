-- CreateEnum
CREATE TYPE "LeaseDocumentKind" AS ENUM ('contract', 'handover_act');

-- DropIndex
DROP INDEX "lease_documents_leaseId_version_key";

-- AlterTable
ALTER TABLE "lease_documents" ADD COLUMN     "kind" "LeaseDocumentKind" NOT NULL DEFAULT 'contract';

-- CreateTable
CREATE TABLE "lease_inventory_items" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lease_inventory_items_leaseId_idx" ON "lease_inventory_items"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "lease_documents_leaseId_kind_version_key" ON "lease_documents"("leaseId", "kind", "version");

-- AddForeignKey
ALTER TABLE "lease_inventory_items" ADD CONSTRAINT "lease_inventory_items_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

