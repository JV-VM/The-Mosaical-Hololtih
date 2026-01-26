/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `AnalyticsEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "viewerHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_idempotencyKey_key" ON "AnalyticsEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_viewerHash_createdAt_idx" ON "AnalyticsEvent"("viewerHash", "createdAt");
