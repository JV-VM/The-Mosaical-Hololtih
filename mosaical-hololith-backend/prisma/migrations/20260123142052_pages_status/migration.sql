-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "status" "PageStatus" NOT NULL DEFAULT 'DRAFT';
