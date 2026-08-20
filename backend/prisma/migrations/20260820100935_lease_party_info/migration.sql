-- CreateTable
CREATE TABLE "lease_party_info" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "role" "LeaseParty" NOT NULL,
    "enteredById" TEXT NOT NULL,
    "dataEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_party_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lease_party_info_leaseId_idx" ON "lease_party_info"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "lease_party_info_leaseId_role_key" ON "lease_party_info"("leaseId", "role");

-- AddForeignKey
ALTER TABLE "lease_party_info" ADD CONSTRAINT "lease_party_info_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_party_info" ADD CONSTRAINT "lease_party_info_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

