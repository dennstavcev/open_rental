-- CreateEnum
CREATE TYPE "SignupRole" AS ENUM ('landlord', 'tenant');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('draft', 'sent', 'active', 'terminated');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('open', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "SettlementPayer" AS ENUM ('tenant', 'owner', 'split');

-- CreateEnum
CREATE TYPE "BillStage" AS ENUM ('draft', 'final');

-- CreateEnum
CREATE TYPE "BillPaymentStatus" AS ENUM ('pending', 'payment_claimed', 'paid');

-- CreateEnum
CREATE TYPE "BillItemKind" AS ENUM ('rent', 'service', 'utility', 'maintenance', 'manual');

-- CreateEnum
CREATE TYPE "BillItemSource" AS ENUM ('manual', 'service', 'meter_reading', 'maintenance', 'ocr');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('manual', 'sbp');

-- CreateEnum
CREATE TYPE "LeaseParty" AS ENUM ('landlord', 'tenant');

-- CreateEnum
CREATE TYPE "TerminationStatus" AS ENUM ('pending', 'finalized', 'cancelled');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('monthly', 'one_time');

-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('electricity', 'water', 'gas', 'heating');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "signupRole" "SignupRole" NOT NULL,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "areaSqm" DOUBLE PRECISION,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leases" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "tenantId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "rentAmount" DECIMAL(12,2) NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentDay" INTEGER NOT NULL,
    "penaltyRatePercentPerDay" DECIMAL(5,2) NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'draft',
    "effectiveEndDate" TIMESTAMP(3),
    "depositReturnAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_info" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "dataEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_documents" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'html',
    "content" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "attachmentStorageKey" TEXT,
    "attachmentMime" TEXT,
    "attachmentName" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'open',
    "photoStorageKey" TEXT,
    "settlementAmount" DECIMAL(12,2),
    "settlementPayer" "SettlementPayer",
    "confirmedByTenant" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByLandlord" BOOLEAN NOT NULL DEFAULT false,
    "settlementAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "stage" "BillStage" NOT NULL DEFAULT 'draft',
    "paymentStatus" "BillPaymentStatus",
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "penaltyRatePercentPerDay" DECIMAL(5,2) NOT NULL,
    "penaltyWaived" BOOLEAN NOT NULL DEFAULT false,
    "penaltyWaivedAmount" DECIMAL(12,2),
    "penaltyWaivedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentLink" TEXT,
    "qrPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_line_items" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "kind" "BillItemKind" NOT NULL,
    "source" "BillItemSource" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "title" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'manual',
    "providerTransactionId" TEXT,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_signed_scans" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "role" "LeaseParty" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_signed_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "termination_requests" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "requestedTerminationDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "TerminationStatus" NOT NULL DEFAULT 'pending',
    "periodEndOverride" TIMESTAMP(3),
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "termination_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meters" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "meterType" "MeterType" NOT NULL,
    "name" TEXT NOT NULL,
    "tariff" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "value" DECIMAL(12,3) NOT NULL,
    "ocrValue" DECIMAL(12,3),
    "photoStorageKey" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "properties_ownerId_idx" ON "properties"("ownerId");

-- CreateIndex
CREATE INDEX "leases_propertyId_idx" ON "leases"("propertyId");

-- CreateIndex
CREATE INDEX "leases_landlordId_idx" ON "leases"("landlordId");

-- CreateIndex
CREATE INDEX "leases_tenantId_idx" ON "leases"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_info_leaseId_key" ON "tenant_info"("leaseId");

-- CreateIndex
CREATE INDEX "lease_documents_leaseId_idx" ON "lease_documents"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "lease_documents_leaseId_version_key" ON "lease_documents"("leaseId", "version");

-- CreateIndex
CREATE INDEX "messages_leaseId_idx" ON "messages"("leaseId");

-- CreateIndex
CREATE INDEX "maintenance_requests_leaseId_idx" ON "maintenance_requests"("leaseId");

-- CreateIndex
CREATE INDEX "bills_leaseId_idx" ON "bills"("leaseId");

-- CreateIndex
CREATE INDEX "bill_line_items_billId_idx" ON "bill_line_items"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_billId_key" ON "payments"("billId");

-- CreateIndex
CREATE INDEX "lease_signed_scans_leaseId_idx" ON "lease_signed_scans"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "lease_signed_scans_leaseId_role_key" ON "lease_signed_scans"("leaseId", "role");

-- CreateIndex
CREATE INDEX "termination_requests_leaseId_idx" ON "termination_requests"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_invitedEmail_idx" ON "invitations"("invitedEmail");

-- CreateIndex
CREATE INDEX "invitations_leaseId_idx" ON "invitations"("leaseId");

-- CreateIndex
CREATE INDEX "services_propertyId_idx" ON "services"("propertyId");

-- CreateIndex
CREATE INDEX "meters_propertyId_idx" ON "meters"("propertyId");

-- CreateIndex
CREATE INDEX "meter_readings_meterId_idx" ON "meter_readings"("meterId");

-- CreateIndex
CREATE INDEX "meter_readings_leaseId_idx" ON "meter_readings"("leaseId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_info" ADD CONSTRAINT "tenant_info_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_documents" ADD CONSTRAINT "lease_documents_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_signed_scans" ADD CONSTRAINT "lease_signed_scans_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_signed_scans" ADD CONSTRAINT "lease_signed_scans_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termination_requests" ADD CONSTRAINT "termination_requests_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meters" ADD CONSTRAINT "meters_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
