/*
  Warnings:

  - Added the required column `initialReading` to the `meters` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "meters" ADD COLUMN     "initialReading" DECIMAL(12,3) NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serialNumber" TEXT;
