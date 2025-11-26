import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);
const prisma = new PrismaClient();

export const documentService = {
  async saveDocumentFromFile(filePath: string) {
    try {
      const filename = path.basename(filePath);
      const content = await fs.readFile(filePath);
      const mimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; // Assuming docx for now

      // Check if document already exists
      let doc = await prisma.document.findFirst({
        where: { filename },
      });

      if (doc) {
        console.log(
          `[DB] Updating existing document: ${doc.id} - ${doc.filename}`
        );
        doc = await prisma.document.update({
          where: { id: doc.id },
          data: {
            content,
          },
        });

        // Delete existing PDF if present (to allow regeneration)
        const existingPdf = await prisma.pdfDocument.findUnique({
          where: { originalDocId: doc.id },
        });

        if (existingPdf) {
          console.log(`[DB] Deleting old PDF for document ${doc.id}`);
          await prisma.pdfDocument.delete({
            where: { id: existingPdf.id },
          });
        }
      } else {
        doc = await prisma.document.create({
          data: {
            filename,
            content,
            mimeType,
          },
        });
        console.log(`[DB] Document created: ${doc.id} - ${doc.filename}`);
      }

      // --- PDF Conversion Start ---
      try {
        console.log(`[PDF] Starting conversion for document ${doc.id}`);

        const pdfFilename = filename.replace(/\.docx$/i, ".pdf");
        const pdfPath = path.join(path.dirname(filePath), pdfFilename);
        const scriptPath = path.resolve(
          __dirname,
          "../scripts/convert2pdf.ps1"
        );

        // Ensure paths are absolute and properly quoted for PowerShell
        const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -docxPath "${filePath}" -pdfPath "${pdfPath}"`;

        console.log(`[PDF] Executing command: ${command}`);
        await execAsync(command);

        const pdfBuffer = await fs.readFile(pdfPath);

        await prisma.pdfDocument.create({
          data: {
            filename: pdfFilename,
            content: pdfBuffer,
            mimeType: "application/pdf",
            originalDocId: doc.id,
          },
        });

        console.log(`[PDF] PDF saved for document ${doc.id}`);

        // Cleanup generated PDF file from disk (it's in DB now)
        // Optional: keep it if you want to debug
        await fs
          .unlink(pdfPath)
          .catch((err) => console.warn("Failed to delete temp PDF:", err));
      } catch (pdfError) {
        console.error(
          `[PDF] Error converting/saving PDF for document ${doc.id}:`,
          pdfError
        );
        // We don't throw here to avoid failing the main document save if PDF fails
      }
      // --- PDF Conversion End ---

      return doc;
    } catch (error) {
      console.error("[DB] Error saving document:", error);
      throw error;
    }
  },

  async getDocumentById(id: number) {
    return prisma.document.findUnique({ where: { id } });
  },

  async getPdfForDocument(docId: number) {
    return prisma.pdfDocument.findUnique({ where: { originalDocId: docId } });
  },

  async getAllDocuments() {
    return prisma.document.findMany({
      select: {
        id: true,
        filename: true,
        createdAt: true,
        mimeType: true,
      },
    });
  },
};
