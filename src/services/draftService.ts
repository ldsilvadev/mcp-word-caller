import { PrismaClient } from "@prisma/client";
import { mcpService } from "./mcpService";
import path from "path";
import fs from "fs";

const prisma = new PrismaClient();

// Diretórios de trabalho
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, "../..");
const TEMPLATE_PATH = path.join(PROJECT_ROOT, "templates/template.docx");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");

// Garantir que o diretório de saída existe
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * ARQUITETURA SIMPLIFICADA:
 * 
 * - Draft no banco = metadados + caminho do arquivo .docx
 * - Arquivo .docx = fonte única de verdade
 * - OnlyOffice edita o arquivo diretamente
 * - IA modifica o arquivo via MCP
 * - Ctrl+S salva no arquivo original
 */

export interface DraftMetadata {
  assunto: string;
  codigo: string;
  departamento: string;
  revisao: string;
  data_publicacao: string;
  data_vigencia: string;
}

export interface DraftContent {
  // Caminho do arquivo .docx (relativo ao OUTPUT_DIR)
  filePath: string;
  // Metadados do documento
  metadata: DraftMetadata;
  // Timestamp da última modificação
  lastModified?: string;
}

/**
 * Gera nome de arquivo seguro a partir do título
 */
function generateSafeFilename(title: string): string {
  const safeName = title
    .replace(/[^a-z0-9áéíóúàèìòùâêîôûãõç\s-]/gi, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
  return `${safeName}_${Date.now()}.docx`;
}

/**
 * Converte conteúdo Markdown para estrutura JSON esperada pelo template
 */
function parseMarkdownToStructure(markdownContent: string, metadata: DraftMetadata): any {
  const secao: any[] = [];
  const lines = markdownContent.split("\n");

  let currentSection: any = null;
  let currentParagraphs: string[] = [];
  let currentListItems: string[] = [];
  let currentTableRows: string[][] = [];
  let inList = false;
  let inTable = false;

  const isTableRow = (line: string): boolean => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|");
  };

  const isTableSeparator = (line: string): boolean => {
    const trimmed = line.trim();
    return /^\|[\s\-:]+\|/.test(trimmed) && (trimmed.includes("---") || trimmed.includes("|-"));
  };

  const parseTableRow = (line: string): string[] => {
    return line.split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
  };

  const flushTable = () => {
    if (currentTableRows.length > 0 && currentSection) {
      if (currentTableRows.length >= 2) {
        const headers = currentTableRows[0];
        const dataRows = currentTableRows.slice(1);
        
        if (headers && headers.length > 0) {
          const tableData = dataRows.map((row) => {
            const obj: any = {};
            headers.forEach((header, idx) => {
              const key = header.toLowerCase().replace(/\s+/g, "_");
              obj[key] = row[idx] || "";
            });
            return obj;
          });
          currentSection.tabela_dinamica = tableData;
        }
      }
      currentTableRows = [];
    }
    inTable = false;
  };

  const flushList = () => {
    if (currentListItems.length > 0 && currentSection) {
      const listText = currentListItems.map(item => `• ${item}`).join("\n");
      currentParagraphs.push(listText);
      currentListItems = [];
    }
    inList = false;
  };

  const flushParagraphs = () => {
    flushList();
    flushTable();
    if (currentParagraphs.length > 0 && currentSection) {
      const text = currentParagraphs.join("\n\n").trim();
      if (currentSection.paragrafo) {
        currentSection.paragrafo += "\n\n" + text;
      } else {
        currentSection.paragrafo = text;
      }
      currentParagraphs = [];
    }
  };

  for (const line of lines) {
    if (!line) continue;
    const trimmedLine = line.trim();

    if (/^#{1,3}\s+/.test(line)) {
      flushParagraphs();
      if (currentSection) secao.push(currentSection);
      currentSection = {
        titulo: line.replace(/^#{1,3}\s+/, "").replace(/^\d+\.?\d*\.?\d*\s*/, "").trim(),
        paragrafo: "",
      };
    } else if (/^#{4,}\s+/.test(line)) {
      flushParagraphs();
      const subTitle = line.replace(/^#{4,}\s+/, "").trim();
      if (currentSection) currentParagraphs.push(subTitle);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inList) { flushList(); inList = true; }
      currentListItems.push(line.replace(/^\d+\.\s+/, "").trim());
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { flushList(); inList = true; }
      currentListItems.push(line.replace(/^[-*]\s+/, "").trim());
    } else if (isTableRow(line)) {
      if (inList) flushList();
      if (isTableSeparator(line)) continue;
      inTable = true;
      currentTableRows.push(parseTableRow(line));
    } else if (trimmedLine === "") {
      if (inList) flushList();
      if (inTable) flushTable();
    } else if (trimmedLine) {
      if (inList) flushList();
      if (inTable) flushTable();
      currentParagraphs.push(trimmedLine);
    }
  }

  flushParagraphs();
  if (currentSection) secao.push(currentSection);

  secao.forEach((s) => {
    if (!s.paragrafo) s.paragrafo = "";
    s.paragrafo = s.paragrafo.trim();
  });

  return { ...metadata, secao };
}

export const draftService = {
  /**
   * Cria um novo draft gerando o arquivo .docx via MCP
   */
  async createDraft(title: string, content: any) {
    try {
      // Extrair metadados
      const metadata: DraftMetadata = {
        assunto: content?.assunto || title,
        codigo: content?.codigo || "---",
        departamento: content?.departamento || "---",
        revisao: content?.revisao || "01",
        data_publicacao: content?.data_publicacao || new Date().toLocaleDateString("pt-BR"),
        data_vigencia: content?.data_vigencia || "---",
      };

      // Gerar nome do arquivo
      const filename = generateSafeFilename(title);
      const outputPath = path.join(OUTPUT_DIR, filename);

      // Preparar dados para o template
      let templateData: any;
      
      if (content?.markdownContent) {
        // Converter Markdown para estrutura do template
        templateData = parseMarkdownToStructure(content.markdownContent, metadata);
      } else if (content?.secao) {
        // Já está no formato correto
        templateData = { ...metadata, secao: content.secao };
      } else {
        // Criar estrutura vazia
        templateData = { ...metadata, secao: [] };
      }

      console.log(`[Draft] Creating document: ${outputPath}`);
      console.log(`[Draft] Template: ${TEMPLATE_PATH}`);

      // Gerar o documento via MCP
      const result = await mcpService.callTool("fill_document_simple", {
        template_path: TEMPLATE_PATH,
        output_path: outputPath,
        data_json: JSON.stringify(templateData),
      });

      console.log(`[Draft] MCP Result: ${JSON.stringify(result).substring(0, 200)}`);

      // Salvar draft no banco com referência ao arquivo
      const draftContent: DraftContent = {
        filePath: filename,
        metadata,
        lastModified: new Date().toISOString(),
      };

      const draft = await prisma.draft.create({
        data: {
          title,
          content: draftContent as any,
          status: "draft",
        },
      });

      console.log(`[Draft] Created draft ${draft.id}: ${draft.title} -> ${filename}`);
      return draft;
    } catch (error) {
      console.error("[Draft] Error creating draft:", error);
      throw error;
    }
  },

  /**
   * Obtém um draft pelo ID
   */
  async getDraft(id: number) {
    return prisma.draft.findUnique({ where: { id } });
  },

  /**
   * Obtém o caminho completo do arquivo .docx de um draft
   */
  async getDraftFilePath(id: number): Promise<string | null> {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft) return null;
    
    const content = draft.content as any;
    if (!content?.filePath) return null;
    
    return path.join(OUTPUT_DIR, content.filePath);
  },

  /**
   * Atualiza os metadados do draft (não o conteúdo do arquivo)
   * O arquivo .docx é modificado diretamente via MCP ou OnlyOffice
   */
  async updateDraftMetadata(id: number, metadata: Partial<DraftMetadata>) {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft) throw new Error("Draft not found");

    const content = (draft.content as any) || {};
    content.metadata = { ...content.metadata, ...metadata };
    content.lastModified = new Date().toISOString();

    return prisma.draft.update({
      where: { id },
      data: { content: content as any },
    });
  },

  /**
   * Atualiza o draft - usado pela IA para modificar o documento
   * A IA deve usar as ferramentas MCP para modificar o arquivo .docx diretamente
   */
  async updateDraft(id: number, newContent: any, fromAI: boolean = false) {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft) throw new Error("Draft not found");

    const currentContent = (draft.content as any) || {};
    const filePath = currentContent.filePath;

    if (!filePath) {
      throw new Error("Draft has no associated file");
    }

    const fullPath = path.join(OUTPUT_DIR, filePath);

    // Se a IA está atualizando e enviou markdownContent, regenerar o documento
    if (fromAI && newContent?.markdownContent) {
      console.log(`[Draft] AI updating document via template regeneration`);
      
      const metadata: DraftMetadata = {
        assunto: newContent.assunto || currentContent.metadata?.assunto || draft.title,
        codigo: newContent.codigo || currentContent.metadata?.codigo || "---",
        departamento: newContent.departamento || currentContent.metadata?.departamento || "---",
        revisao: newContent.revisao || currentContent.metadata?.revisao || "01",
        data_publicacao: newContent.data_publicacao || currentContent.metadata?.data_publicacao || "",
        data_vigencia: newContent.data_vigencia || currentContent.metadata?.data_vigencia || "",
      };

      const templateData = parseMarkdownToStructure(newContent.markdownContent, metadata);

      // Regenerar o documento
      await mcpService.callTool("fill_document_simple", {
        template_path: TEMPLATE_PATH,
        output_path: fullPath,
        data_json: JSON.stringify(templateData),
      });

      // Atualizar metadados no banco
      currentContent.metadata = metadata;
      currentContent.lastModified = new Date().toISOString();

      return prisma.draft.update({
        where: { id },
        data: { content: currentContent as any },
      });
    }

    // Se não é da IA, apenas atualizar timestamp (OnlyOffice salvou diretamente)
    currentContent.lastModified = new Date().toISOString();
    
    return prisma.draft.update({
      where: { id },
      data: { content: currentContent as any },
    });
  },

  /**
   * Marca o draft como modificado (chamado pelo OnlyOffice callback)
   */
  async markAsModified(id: number) {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft) return;

    const content = (draft.content as any) || {};
    content.lastModified = new Date().toISOString();

    await prisma.draft.update({
      where: { id },
      data: { content: content as any },
    });

    console.log(`[Draft] Marked draft ${id} as modified`);
  },

  /**
   * Publica o draft - faz upload do arquivo .docx para Supabase
   */
  async publishDraft(id: number) {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft) throw new Error("Draft not found");

    const content = draft.content as any;
    if (!content?.filePath) throw new Error("Draft has no associated file");

    const fullPath = path.join(OUTPUT_DIR, content.filePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    console.log(`[Publish] Uploading: ${fullPath}`);

    // Upload para Supabase
    const { supabaseService } = require("./supabaseService");
    const uploadRes = await supabaseService.uploadFile(fullPath);

    console.log(`[Publish] Upload complete. Path: ${uploadRes.path}`);

    // Salvar metadados no banco
    const { documentService } = require("./documentService");
    await documentService.saveSupabaseDocument(
      path.basename(fullPath),
      uploadRes.path,
      uploadRes.publicUrl
    );

    // Atualizar status do draft
    await prisma.draft.update({
      where: { id },
      data: { status: "published" },
    });

    return {
      result: "Documento publicado com sucesso",
      filename: path.basename(fullPath),
      outputPath: fullPath,
      downloadUrl: uploadRes.publicUrl,
      storagePath: uploadRes.path,
    };
  },

  /**
   * Gera/regenera o documento do draft (para compatibilidade)
   */
  async generateDocumentFromDraft(id: number, uploadToSharePoint: boolean = false) {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft) throw new Error("Draft not found");

    const content = draft.content as any;
    if (!content?.filePath) throw new Error("Draft has no associated file");

    const fullPath = path.join(OUTPUT_DIR, content.filePath);
    const filename = path.basename(fullPath);

    // O arquivo já existe, apenas retornar o caminho
    if (fs.existsSync(fullPath)) {
      console.log(`[Draft] Document already exists: ${fullPath}`);
      return {
        result: "Document ready",
        filename,
        outputPath: fullPath,
        sharePointLink: null,
      };
    }

    throw new Error(`Document file not found: ${fullPath}`);
  },
};
