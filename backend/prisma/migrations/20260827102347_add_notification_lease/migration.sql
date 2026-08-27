-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "leaseId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_userId_leaseId_type_readAt_idx" ON "notifications"("userId", "leaseId", "type", "readAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Не больше одного непрочитанного «новое сообщение» на пару
-- (получатель, договор). Индекс, а не проверка в коде: findFirst + create
-- неатомарны, и два одновременных сообщения создавали бы две записи.
-- Ограничение узкое, по одному типу: другим типам уведомлений
-- дублирование не запрещено (две смены статуса заявки — два события).
CREATE UNIQUE INDEX "notifications_unread_message_per_lease"
  ON "notifications" ("userId", "leaseId")
  WHERE "readAt" IS NULL AND "type" = 'message_new';
