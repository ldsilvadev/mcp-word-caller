import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);
const prisma = new PrismaClient();

import { storageService } from "./storageService";

export const documentService = {
  async saveDocumentFromFile(filePath: string) {
    try {
      const filename = path.basename(filePath);
      const mimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      // Upload DOCX to Supabase
      console.log(`[Storage] Uploading ${filename} to Supabase...`);
      const storagePath = await storageService.uploadFile(filePath);
      const publicUrl = storageService.getPublicUrl(storagePath);

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
            storagePath,
            publicUrl,
          },
        });


      } else {
        doc = await prisma.document.create({
          data: {
            filename,
            storagePath,
            publicUrl,
            mimeType,
          },
        });
        console.log(`[DB] Document created: ${doc.id} - ${doc.filename}`);
      }



      return doc;
    } catch (error) {
      console.error("[DB] Error saving document:", error);
      throw error;
    }
  },

  async getDocumentById(id: number) {
    return prisma.document.findUnique({ where: { id } });
  },

  async getDocumentByFilename(filename: string) {
    return prisma.document.findFirst({ where: { filename } });
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
        publicUrl: true,
      },
    });
  },
  async saveSharePointDocument(filename: string, sharePointId: string, webUrl: string) {
    try {
      const mimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      // Check if document already exists
      let doc = await prisma.document.findFirst({
        where: { filename },
      });

      if (doc) {
        console.log(
          `[DB] Updating existing SharePoint document: ${doc.id} - ${doc.filename}`
        );
        doc = await prisma.document.update({
          where: { id: doc.id },
          data: {
            storagePath: sharePointId, // Storing ID in storagePath
            publicUrl: webUrl,         // Storing Web URL in publicUrl
          },
        });
      } else {
        doc = await prisma.document.create({
          data: {
            filename,
            storagePath: sharePointId,
            publicUrl: webUrl,
            mimeType,
          },
        });
        console.log(`[DB] SharePoint Document created: ${doc.id} - ${doc.filename}`);
      }

      return doc;
    } catch (error) {
      console.error("[DB] Error saving SharePoint document:", error);
      throw error;
    }
  },

  async saveSupabaseDocument(filename: string, storagePath: string, publicUrl: string) {
    try {
      const mimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      // Check if document already exists
      let doc = await prisma.document.findFirst({
        where: { filename },
      });

      if (doc) {
        console.log(
          `[DB] Updating existing Supabase document: ${doc.id} - ${doc.filename}`
        );
        doc = await prisma.document.update({
          where: { id: doc.id },
          data: {
            storagePath,
            publicUrl,
          },
        });
      } else {
        doc = await prisma.document.create({
          data: {
            filename,
            storagePath,
            publicUrl,
            mimeType,
          },
        });
        console.log(`[DB] Supabase Document created: ${doc.id} - ${doc.filename}`);
      }

      return doc;
    } catch (error) {
      console.error("[DB] Error saving Supabase document:", error);
      throw error;
    }
  },
};
