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

// Chat Endpoint
fastify.post("/chat", async (request, reply) => {
  const { message } = request.body as { message: string };
  try {
    const response = await handleUserPrompt(message);
    return { response };
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: error.message });
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
