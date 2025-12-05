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
  origin: "*", // Adjust for production
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
  console.log("[Chat] Has editor content:", !!body.currentEditorContent);
  
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
    console.error("[Chat] Stack:", error.stack);
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

  const uploadDir = path.join(__dirname, "../output"); // Using output dir for temp storage
  await fs.mkdir(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, data.filename);
  await pump(data.file, require("fs").createWriteStream(filePath));

  // Save to DB
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
    reply.header(
      "Content-Disposition",
      `attachment; filename="${doc.filename}"`
    );
    reply.header("Content-Type", doc.mimeType);
    return buffer;
  } catch (error) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: "Failed to retrieve document content" });
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
    reply.header(
      "Content-Disposition",
      `attachment; filename="${pdfDoc.filename}"`
    );
    reply.header("Content-Type", pdfDoc.mimeType);
    return buffer;
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to retrieve PDF content" });
  }
});

// ---------------------------------------------------------
// NEW: Draft Endpoints
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

// Update Draft
fastify.put("/drafts/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { content } = request.body as { content: any };
  const { draftService } = require("./services/draftService");

  try {
    const draft = await draftService.updateDraft(parseInt(id), content);
    return draft;
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: "Failed to update draft" });
  }
});

// Generate Document from Draft (local only, no SharePoint upload)
fastify.post("/drafts/:id/generate", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");

  try {
    const result = await draftService.generateDocumentFromDraft(parseInt(id), false);
    return result;
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: "Failed to generate document from draft" });
  }
});

// Publish Draft - Generate and upload to SharePoint
fastify.post("/drafts/:id/publish", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");

  try {
    const result = await draftService.publishDraft(parseInt(id));
    return result;
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: "Failed to publish draft" });
  }
});

// ---------------------------------------------------------
// OnlyOffice Integration Endpoints
// ---------------------------------------------------------

// Get OnlyOffice editor config for a draft
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
// SEMPRE regenera o documento a partir do draft atual para garantir conteúdo atualizado
fastify.get("/onlyoffice/document/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { draftService } = require("./services/draftService");

  try {
    const draft = await draftService.getDraft(parseInt(id));
    if (!draft) {
      return reply.status(404).send({ error: "Draft not found" });
    }

    // SEMPRE gerar documento a partir do draft atual
    // Isso garante que o OnlyOffice sempre receba o conteúdo mais recente
    console.log(`[OnlyOffice] Generating document for draft ${id}...`);
    const result = await draftService.generateDocumentFromDraft(parseInt(id), false);
    const filePath = result.outputPath;

    // Aguardar arquivo ser criado
    await new Promise(resolve => setTimeout(resolve, 500));

    const fileBuffer = await fs.readFile(filePath);
    
    console.log(`[OnlyOffice] Serving document: ${filePath} (${fileBuffer.length} bytes)`);
    
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    reply.header("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    
    return fileBuffer;
  } catch (error: any) {
    request.log.error(error);
    console.error(`[OnlyOffice] Error serving document:`, error);
    return reply.status(500).send({ error: "Failed to serve document" });
  }
});

// OnlyOffice callback endpoint (called when document is saved)
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

// Check if OnlyOffice is available
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
    // Initialize Authentication (Device Code Flow)
    const { authService } = require("./services/authService");
    //await authService.initialize();

    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
