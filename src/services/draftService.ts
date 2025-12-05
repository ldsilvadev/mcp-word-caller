import { PrismaClient } from "@prisma/client";
import { mcpService } from "./mcpService";
import path from "path";
import fs from "fs";

const prisma = new PrismaClient();

// Diretórios de trabalho - usar caminho absoluto do projeto
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, "../..");
const TEMPLATE_PATH = path.join(PROJECT_ROOT, "templates/template.docx");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");

/**
 * Converte conteúdo Markdown para estrutura JSON esperada pelo template
 * Template usa: {{LOOP:secao}} com {{titulo}}, {{paragrafo}}, {{tabela_dinamica}}
 * 
 * Formatação suportada:
 * - Listas com bullets (• item)
 * - Subtítulos em negrito
 * - Parágrafos separados por linha em branco
 */
function parseMarkdownToStructure(markdownContent: string, originalContent: any): any {
  // Se o conteúdo original já tem metadados, preservá-los
  const metadata = {
    assunto: originalContent?.assunto || "",
    codigo: originalContent?.codigo || "",
    departamento: originalContent?.departamento || "",
    revisao: originalContent?.revisao || "01",
    data_publicacao: originalContent?.data_publicacao || new Date().toLocaleDateString("pt-BR"),
    data_vigencia: originalContent?.data_vigencia || "",
  };

  const secao: any[] = [];
  const lines = markdownContent.split("\n");

  let currentSection: any = null;
  let currentParagraphs: string[] = [];
  let currentListItems: string[] = [];
  let inList = false;

  const flushList = () => {
    if (currentListItems.length > 0 && currentSection) {
      // Formatar lista com bullets - cada item em uma linha separada
      // O Python vai interpretar linhas começando com "• " como bullet list
      const listText = currentListItems.map(item => `• ${item}`).join("\n");
      currentParagraphs.push(listText);
      currentListItems = [];
    }
    inList = false;
  };

  const flushParagraphs = () => {
    flushList();
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

    // Heading 1: # Title - Nova seção principal
    if (/^#\s+/.test(line)) {
      flushParagraphs();
      if (currentSection) {
        secao.push(currentSection);
      }
      currentSection = {
        titulo: line.replace(/^#\s+/, "").replace(/^\d+\.\s*/, "").trim(),
        paragrafo: "",
      };
    }
    // Heading 2: ## Subtitle - Adicionar como subtítulo formatado
    else if (/^##\s+/.test(line)) {
      flushParagraphs();
      const subTitle = line.replace(/^##\s+/, "").replace(/^\d+\.\d+\s*/, "").trim();
      if (currentSection) {
        currentParagraphs.push(subTitle.toUpperCase());
      }
    }
    // Heading 3: ### Sub-subtitle
    else if (/^###\s+/.test(line)) {
      flushParagraphs();
      const subSubTitle = line.replace(/^###\s+/, "").replace(/^\d+\.\d+\.\d+\s*/, "").trim();
      if (currentSection) {
        currentParagraphs.push(subSubTitle);
      }
    }
    // Lista numerada: 1. item, 2. item, etc
    else if (/^\d+\.\s+/.test(line)) {
      if (!inList) {
        flushList();
        inList = true;
      }
      const item = line.replace(/^\d+\.\s+/, "").trim();
      currentListItems.push(item);
    }
    // Lista com bullet: - item ou * item
    else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        flushList();
        inList = true;
      }
      const item = line.replace(/^[-*]\s+/, "").trim();
      currentListItems.push(item);
    }
    // Linha em branco - finaliza lista ou separa parágrafos
    else if (trimmedLine === "") {
      if (inList) {
        flushList();
      }
    }
    // Conteúdo regular
    else if (trimmedLine) {
      if (inList) {
        flushList();
      }
      currentParagraphs.push(trimmedLine);
    }
  }

  // Flush remaining content
  flushParagraphs();
  if (currentSection) {
    secao.push(currentSection);
  }

  // Limpar paragrafos vazios e garantir que cada seção tem paragrafo
  secao.forEach((s) => {
    if (!s.paragrafo) s.paragrafo = "";
    s.paragrafo = s.paragrafo.trim();
  });

  console.log(`[Parser] Generated ${secao.length} sections`);
  secao.forEach((s, i) => {
    console.log(`[Parser] Section ${i + 1}: "${s.titulo}" - ${s.paragrafo.substring(0, 100)}...`);
  });

  return {
    ...metadata,
    secao,
  };
}

/**
 * Normaliza o conteúdo para garantir que listas sejam formatadas corretamente.
 * Converte listas inline (separadas por vírgula ou ponto e vírgula) em listas com quebra de linha.
 */
function normalizeContentForLists(content: any): any {
  if (!content || typeof content !== "object") return content;

  // Se tem secao, normalizar cada seção
  if (content.secao && Array.isArray(content.secao)) {
    content.secao = content.secao.map((section: any) => {
      if (section.paragrafo && typeof section.paragrafo === "string") {
        section.paragrafo = normalizeListsInText(section.paragrafo);
      }
      return section;
    });
  }

  // Se tem markdownContent, normalizar
  if (content.markdownContent && typeof content.markdownContent === "string") {
    content.markdownContent = normalizeListsInText(content.markdownContent);
  }

  return content;
}

/**
 * Normaliza listas em um texto.
 * - Converte "• item1, • item2" em "• item1\n• item2"
 * - Converte "- item1; - item2" em "- item1\n- item2"
 * - Garante que cada item de lista esteja em sua própria linha
 */
function normalizeListsInText(text: string): string {
  if (!text) return text;

  // Padrão 1: Bullets separados por vírgula ou ponto e vírgula
  // "• item1, • item2" ou "• item1; • item2"
  text = text.replace(/•\s*([^•\n]+?)\s*[,;]\s*(?=•)/g, "• $1\n");
  
  // Padrão 2: Hífens separados por vírgula ou ponto e vírgula
  // "- item1, - item2" ou "- item1; - item2"
  text = text.replace(/-\s*([^-\n]+?)\s*[,;]\s*(?=-\s)/g, "- $1\n");
  
  // Padrão 3: Números separados por vírgula ou ponto e vírgula
  // "1. item1, 2. item2"
  text = text.replace(/(\d+)\.\s*([^\d\n]+?)\s*[,;]\s*(?=\d+\.)/g, "$1. $2\n");

  // Padrão 4: Bullets inline sem separador claro (detectar por padrão)
  // Se há múltiplos "•" na mesma linha, separar
  const lines = text.split("\n");
  const normalizedLines = lines.map(line => {
    // Contar quantos bullets há na linha
    const bulletCount = (line.match(/•/g) || []).length;
    if (bulletCount > 1) {
      // Separar em múltiplas linhas
      return line.replace(/•\s*/g, "\n• ").trim();
    }
    return line;
  });

  return normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export const draftService = {
  async createDraft(title: string, content: any) {
    try {
      const draft = await prisma.draft.create({
        data: {
          title,
          content,
          status: "draft",
        },
      });
      console.log(`[Draft] Created draft ${draft.id}: ${draft.title}`);
      return draft;
    } catch (error) {
      console.error("[Draft] Error creating draft:", error);
      throw error;
    }
  },

  async getDraft(id: number) {
    return prisma.draft.findUnique({ where: { id } });
  },

  async updateDraft(id: number, content: any) {
    try {
      // Normalizar o conteúdo para garantir formatação correta de listas
      const normalizedContent = normalizeContentForLists(content);
      
      const draft = await prisma.draft.update({
        where: { id },
        data: {
          content: normalizedContent,
        },
      });
      console.log(`[Draft] Updated draft ${draft.id}`);
      return draft;
    } catch (error) {
      console.error("[Draft] Error updating draft:", error);
      throw error;
    }
  },

  /**
   * Gera o documento .docx localmente (sem upload para SharePoint)
   * Usado para abrir no OnlyOffice para edição
   */
  async generateDocumentFromDraft(id: number, uploadToSharePoint: boolean = false) {
    try {
      const draft = await prisma.draft.findUnique({ where: { id } });
      if (!draft) throw new Error("Draft not found");

      console.log(`[Draft] Generating document from draft ${id}...`);
      console.log(`[Draft] Draft title: ${draft.title}`);
      console.log(`[Draft] Upload to SharePoint: ${uploadToSharePoint}`);

      let content = draft.content as any;

      // Se content for string, verificar se é Markdown ou JSON
      if (typeof content === "string") {
        const trimmed = content.trim();
        
        // Tentar parsear como JSON primeiro
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            content = JSON.parse(content);
          } catch {
            // Se falhar, tratar como Markdown
            console.log(`[Draft] Content is Markdown, parsing to structure...`);
            content = parseMarkdownToStructure(content, null);
          }
        } else {
          // É Markdown - converter para estrutura
          console.log(`[Draft] Content is Markdown, parsing to structure...`);
          content = parseMarkdownToStructure(content, null);
        }
      }

      // Se o conteúdo tem markdownContent (novo formato do frontend), processar
      if (content.markdownContent) {
        console.log(`[Draft] Content has markdownContent field, parsing...`);
        const markdownText = content.markdownContent;
        const metadataFromContent = {
          assunto: content.assunto,
          codigo: content.codigo,
          departamento: content.departamento,
          revisao: content.revisao,
          data_publicacao: content.data_publicacao,
          data_vigencia: content.data_vigencia,
        };
        content = parseMarkdownToStructure(markdownText, metadataFromContent);
      }

      // Garantir que content é um objeto (não array)
      if (Array.isArray(content)) {
        content = { secao: content };
      }

      // Se content for null/undefined, criar objeto vazio
      if (!content || typeof content !== "object") {
        content = { secao: [] };
      }

      // Converter 'sections' para 'secao' se necessário (compatibilidade)
      if (content.sections && !content.secao) {
        content.secao = content.sections.map((s: any) => ({
          titulo: s.title || s.titulo || "",
          paragrafo: s.content || s.paragrafo || s.texto || "",
          tabela_dinamica: s.tabela_dinamica || s.table || null,
        }));
        delete content.sections;
      }

      // Garantir que temos os metadados básicos
      if (!content.assunto) content.assunto = draft.title;
      if (!content.data_publicacao) content.data_publicacao = new Date().toLocaleDateString("pt-BR");

      console.log(`[Draft] Content type: ${typeof content}, isArray: ${Array.isArray(content)}`);
      console.log(`[Draft] Content keys: ${Object.keys(content).join(", ")}`);
      console.log(`[Draft] Secao count: ${content.secao?.length || 0}`);

      // Gerar nome do arquivo
      let filename =
        content.filename || `${draft.title.replace(/[^a-z0-9]/gi, "_")}.docx`;
      if (!filename.endsWith(".docx")) filename += ".docx";

      // Garantir que o diretório de saída existe
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      const outputPath = path.join(OUTPUT_DIR, filename);

      // Parâmetros corretos para fill_document_simple
      // data_json precisa ser uma STRING contendo um objeto JSON
      const args = {
        template_path: TEMPLATE_PATH,
        output_path: outputPath,
        data_json: JSON.stringify(content),
      };

      console.log(`[Draft] Template: ${TEMPLATE_PATH}`);
      console.log(`[Draft] Template exists: ${fs.existsSync(TEMPLATE_PATH)}`);
      console.log(`[Draft] Output: ${outputPath}`);
      console.log(`[Draft] data_json: ${args.data_json.substring(0, 200)}...`);

      // Chamar a ferramenta MCP
      const result = await mcpService.callTool("fill_document_simple", args);
      console.log(`[Draft] MCP Result: ${JSON.stringify(result).substring(0, 500)}`);

      // Upload para SharePoint apenas se solicitado
      let sharePointLink: string | null = null;
      if (uploadToSharePoint) {
        try {
          const { sharePointService } = require("./sharePointService");
          
          // Aguardar arquivo ser criado
          const waitForFile = async (filePath: string, timeout = 5000, interval = 500) => {
            const startTime = Date.now();
            while (Date.now() - startTime < timeout) {
              if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.size > 0) return true;
              }
              await new Promise((resolve) => setTimeout(resolve, interval));
            }
            return false;
          };

          const fileExists = await waitForFile(outputPath);
          
          if (fileExists) {
            console.log(`[Draft] Uploading to SharePoint: ${outputPath}`);
            const uploadRes = await sharePointService.uploadFile(outputPath);
            console.log(`[Draft] Upload complete. File ID: ${uploadRes.id}`);
            
            sharePointLink = await sharePointService.createSharingLink(uploadRes.id);
            console.log(`[Draft] SharePoint link: ${sharePointLink}`);

            // Salvar metadados no banco
            const { documentService } = require("./documentService");
            await documentService.saveSharePointDocument(filename, uploadRes.id, sharePointLink);
            
            // Atualizar status do draft para finalizado
            await prisma.draft.update({
              where: { id },
              data: { status: "published" },
            });
          } else {
            console.error(`[Draft] File not found after generation: ${outputPath}`);
          }
        } catch (spError) {
          console.error("[Draft] SharePoint upload error:", spError);
        }
      }

      return { 
        result, 
        filename, 
        outputPath,
        sharePointLink 
      };
    } catch (error) {
      console.error("[Draft] Error generating document:", error);
      throw error;
    }
  },

  /**
   * Finaliza o documento e faz upload para o SharePoint
   * Usado quando o usuário clica em "Gerar Word Final"
   */
  async publishDraft(id: number) {
    return this.generateDocumentFromDraft(id, true);
  },
};
