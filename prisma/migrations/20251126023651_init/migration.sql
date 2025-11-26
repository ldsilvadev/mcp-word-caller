-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
