import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { handleUserPrompt } from "./api/chatApi";
import { documentService } from "./services/documentService";
import { storageService } from "./services/storageService";
import fs from "fs/promises";
import path from "path";
import util from "util";
import { pipeline } from "stream";

const pump = util.promisify(pipeline);

const fastify = Fastify({
  logger: true,
});

fastify.register(cors, {
  origin: "*",
});

fastify.register(multipart);

// Health check endpoint
fastify.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Interface para conteúdo do editor
interface EditorContent {
  markdown: string;
  metadata: {
    assunto: string;
    codigo: string;
    departamento: string;
    revisao: string;
    data_publicacao: string;
    data_vigencia: string;
  };
}

// Chat Endpoint
fastify.post("/chat", async (request, reply) => {
  console.log("[Chat] Received request");
  const body = request.body as { 
    message: string; 
    activeDraftId?: number | null;
    currentEditorContent?: EditorContent | null;
  };
  
  console.log("[Chat] Message:", body.message?.substring(0, 100));
  console.log("[Chat] Active Draft ID:", body.activeDraftId);
  
  try {
    const result = await handleUserPrompt(
      body.message, 
      body.activeDraftId, 
      body.currentEditorContent
    );
    console.log("[Chat] Success, draft updated:", result.draftUpdated);
    return result;
  } catch (error: any) {
    console.error("[Chat] ERROR:", error.message);
    request.log.error(error);
    return reply.status(500).send({ error: error.message || "Unknown error" });
  }
});

// Upload Document Endpoint
fastify.post("/documents", async (request, reply) => {
  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ error: "No file uploaded" });
  }

  const uploadDir = path.join(__dirname, "../output");
  await fs.mkdir(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, data.filename);
  await pump(data.file, require("fs").createWriteStream(filePath));

  const doc = await documentService.saveDocumentFromFile(filePath);
  return { message: "File uploaded and saved", document: doc };
});

// List Documents Endpoint
fastify.get("/documents", async (request, reply) => {
  const docs = await documentService.getAllDocuments();
  return docs;
});

// Get Document Content Endpoint
fastify.get("/documents/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const doc = await documentService.getDocumentById(parseInt(id));

  if (!doc) {
    return reply.status(404).send({ error: "Document not found" });
  }

  try {
    const buffer = await storageService.downloadFile(doc.storagePath);
    reply.header("Content-Disposition", `attachment; filename="${doc.filename}"`);
    reply.header("Content-Type", doc.mimeType);
    return buffer;
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to retrieve document content" });
  }
});

// Get PDF Document Content Endpoint
fastify.get("/documents/:id/pdf", async (request, reply) => {
  const { id } = request.params as { id: string };
  const pdfDoc = await documentService.getPdfForDocument(parseInt(id));

  if (!pdfDoc) {
    return reply.status(404).send({ error: "PDF not found for this document" });
  }

  try {
    const buffer = await storageService.downloadFile(pdfDoc.storagePath);
    reply.header("Content-Disposition", `attachment; filename="${pdfDoc.filename}"`);
    reply.header("Content-Type", pdfDoc.mimeType);
    return buffer;
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to retrieve PDF content" });
  }
});

// ---------------------------------------------------------
// DRAFT ENDPOINTS (SIMPLIFICADO)
// ---------------------------------------------------------

// Get Draft
fastify.get("/drafts/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");
  const draft = await draftService.getDraft(parseInt(id));

  if (!draft) {
    return reply.status(404).send({ error: "Draft not found" });
  }
  return draft;
});

// Get Draft Status (simplificado)
fastify.get("/drafts/:id/status", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");

  try {
    const draft = await draftService.getDraft(parseInt(id));
    if (!draft) {
      return reply.status(404).send({ error: "Draft not found" });
    }
    
    const content = draft.content as any;
    const filePath = await draftService.getDraftFilePath(parseInt(id));
    
    let fileExists = false;
    let fileModifiedAt = null;
    
    if (filePath) {
      try {
        const stats = await fs.stat(filePath);
        fileExists = true;
        fileModifiedAt = stats.mtime.toISOString();
      } catch {
        fileExists = false;
      }
    }
    
    return {
      id: draft.id,
      title: draft.title,
      status: draft.status,
      filePath: content?.filePath || null,
      fileExists,
      fileModifiedAt,
      lastModified: content?.lastModified || null,
      metadata: content?.metadata || null,
    };
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to get draft status" });
  }
});

// Update Draft Metadata (não o arquivo)
fastify.put("/drafts/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { metadata } = request.body as { metadata?: any };
  const { draftService } = require("./services/draftService");

  try {
    if (metadata) {
      const draft = await draftService.updateDraftMetadata(parseInt(id), metadata);
      return draft;
    }
    
    // Se não tem metadata, apenas marcar como modificado
    await draftService.markAsModified(parseInt(id));
    return { success: true };
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to update draft" });
  }
});

// Generate Document (retorna o arquivo existente)
fastify.post("/drafts/:id/generate", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");

  try {
    const result = await draftService.generateDocumentFromDraft(parseInt(id), false);
    return result;
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to generate document" });
  }
});

// Publish Draft (upload para Supabase)
fastify.post("/drafts/:id/publish", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");

  try {
    const result = await draftService.publishDraft(parseInt(id));
    return result;
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to publish draft" });
  }
});

// ---------------------------------------------------------
// DOWNLOAD ENDPOINTS (SUPABASE)
// ---------------------------------------------------------

// Download documento publicado pelo ID do documento
fastify.get("/documents/:id/download", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { supabaseService } = require("./services/supabaseService");

  try {
    const doc = await documentService.getDocumentById(parseInt(id));
    if (!doc) {
      return reply.status(404).send({ error: "Document not found" });
    }

    if (!doc.storagePath) {
      return reply.status(400).send({ error: "Document has no storage path" });
    }

    console.log(`[Download] Downloading from Supabase: ${doc.storagePath}`);
    const buffer = await supabaseService.downloadFile(doc.storagePath);

    reply.header("Content-Type", doc.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    reply.header("Content-Disposition", `attachment; filename="${doc.filename}"`);
    reply.header("Content-Length", buffer.length);

    return buffer;
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to download document" });
  }
});

// Download documento publicado pelo ID do draft
fastify.get("/drafts/:id/download", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");
  const { supabaseService } = require("./services/supabaseService");

  try {
    const draft = await draftService.getDraft(parseInt(id));
    if (!draft) {
      return reply.status(404).send({ error: "Draft not found" });
    }

    if (draft.status !== "published") {
      return reply.status(400).send({ error: "Draft is not published yet" });
    }

    // Buscar documento publicado pelo nome do arquivo
    const content = draft.content as any;
    const filename = content?.filePath ? path.basename(content.filePath) : null;

    if (!filename) {
      return reply.status(400).send({ error: "Draft has no associated file" });
    }

    // Buscar na tabela de documentos
    const doc = await documentService.getDocumentByFilename(filename);
    if (!doc || !doc.storagePath) {
      return reply.status(404).send({ error: "Published document not found in storage" });
    }

    console.log(`[Download] Downloading draft ${id} from Supabase: ${doc.storagePath}`);
    const buffer = await supabaseService.downloadFile(doc.storagePath);

    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    reply.header("Content-Disposition", `attachment; filename="${doc.filename}"`);
    reply.header("Content-Length", buffer.length);

    return buffer;
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to download document" });
  }
});

// ---------------------------------------------------------
// ONLYOFFICE ENDPOINTS
// ---------------------------------------------------------

// Get OnlyOffice editor config
fastify.get("/onlyoffice/config/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { onlyofficeService } = require("./services/onlyofficeService");
  const { draftService } = require("./services/draftService");

  try {
    const draft = await draftService.getDraft(parseInt(id));
    if (!draft) {
      return reply.status(404).send({ error: "Draft not found" });
    }

    const filename = `${draft.title.replace(/[^a-z0-9]/gi, "_")}.docx`;
    const config = await onlyofficeService.getEditorConfig(parseInt(id), filename);
    
    return {
      config,
      serverUrl: onlyofficeService.getServerUrl(),
    };
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to get OnlyOffice config" });
  }
});

// Serve document file for OnlyOffice
fastify.get("/onlyoffice/document/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");

  try {
    const filePath = await draftService.getDraftFilePath(parseInt(id));
    
    if (!filePath) {
      return reply.status(404).send({ error: "Draft has no file" });
    }

    try {
      const fileBuffer = await fs.readFile(filePath);
      console.log(`[OnlyOffice] Serving document: ${filePath} (${fileBuffer.length} bytes)`);
      
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      reply.header("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
      
      return fileBuffer;
    } catch {
      return reply.status(404).send({ error: "Document file not found" });
    }
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to serve document" });
  }
});

// OnlyOffice callback (salva diretamente no arquivo original)
fastify.post("/onlyoffice/callback/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { onlyofficeService } = require("./services/onlyofficeService");

  try {
    const result = await onlyofficeService.processCallback(parseInt(id), request.body);
    return result;
  } catch (error: any) {
    request.log.error(error);
    return { error: 1 };
  }
});

// Check OnlyOffice availability
fastify.get("/onlyoffice/status", async (request, reply) => {
  const { onlyofficeService } = require("./services/onlyofficeService");
  
  const available = await onlyofficeService.isAvailable();
  return { 
    available,
    serverUrl: onlyofficeService.getServerUrl(),
  };
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
