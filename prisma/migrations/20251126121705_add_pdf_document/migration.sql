-- CreateTable
CREATE TABLE "PdfDocument" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalDocId" INTEGER NOT NULL,

    CONSTRAINT "PdfDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfDocument_originalDocId_key" ON "PdfDocument"("originalDocId");

-- AddForeignKey
ALTER TABLE "PdfDocument" ADD CONSTRAINT "PdfDocument_originalDocId_fkey" FOREIGN KEY ("originalDocId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
