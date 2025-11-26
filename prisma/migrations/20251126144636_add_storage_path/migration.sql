/*
  Warnings:

  - You are about to drop the column `content` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `PdfDocument` table. All the data in the column will be lost.
  - Added the required column `storagePath` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storagePath` to the `PdfDocument` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" DROP COLUMN "content",
ADD COLUMN     "publicUrl" TEXT,
ADD COLUMN     "storagePath" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PdfDocument" DROP COLUMN "content",
ADD COLUMN     "publicUrl" TEXT,
ADD COLUMN     "storagePath" TEXT NOT NULL;
