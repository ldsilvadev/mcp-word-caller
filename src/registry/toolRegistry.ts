import { ChatCompletionTool } from "openai/resources/chat/completions";
import { mcpService } from "../services/mcpService";

// Ferramentas de draft no formato OpenAI
const draftTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_draft",
      description:
        "Creates a new document draft. Use this INSTEAD of creating a document directly. You MUST provide both title and content.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the document draft",
          },
          content: {
            type: "object",
            description:
              "JSON content of the draft. Must include: assunto, codigo, departamento, revisao, data_publicacao, data_vigencia, and markdownContent with the document text in Markdown format. For TABLES, use Markdown table syntax: | Header1 | Header2 |\\n|---|---|\\n| Value1 | Value2 |",
            properties: {
              assunto: { type: "string" },
              codigo: { type: "string" },
              departamento: { type: "string" },
              revisao: { type: "string" },
              data_publicacao: { type: "string" },
              data_vigencia: { type: "string" },
              markdownContent: { 
                type: "string", 
                description: "Document content in Markdown format. Supports: ### headings, - bullet lists, 1. numbered lists, and | col1 | col2 | tables" 
              },
            },
            required: ["assunto", "markdownContent"],
          },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_draft",
      description: "Retrieves the content of a draft by ID.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "ID of the draft",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_draft",
      description:
        "MUST be used to update/modify/edit an existing draft. When user asks to change, modify, edit, add, remove, or update ANY content in the current document/draft, you MUST call this function with the draft ID and the COMPLETE updated content. Always call get_draft first to get current content, then modify it, then call update_draft. IMPORTANT: For tables, use Markdown table format: | Header1 | Header2 |\\n|---|---|\\n| Value1 | Value2 |",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "ID of the draft to update",
          },
          content: {
            type: "object",
            description:
              "Complete updated JSON content for the draft. The markdownContent field supports: headings (### Title), lists (- item), and TABLES in Markdown format (| col1 | col2 |).",
            additionalProperties: true,
          },
        },
        required: ["id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_document_from_draft",
      description: "Generates the final DOCX file from a draft.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "ID of the draft to generate",
          },
        },
        required: ["id"],
      },
    },
  },
];

/**
 * Converte ferramentas do formato MCP para o formato OpenAI
 */
function convertMcpToolToOpenAI(mcpTool: any): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: mcpTool.name,
      description: mcpTool.description || "",
      parameters: mcpTool.inputSchema || {
        type: "object",
        properties: {},
      },
    },
  };
}

/**
 * Busca todas as ferramentas disponíveis no formato OpenAI:
 * 1. Ferramentas do servidor MCP Python (remoto)
 * 2. Ferramentas de Rascunho (local)
 */
export async function getAllTools(): Promise<ChatCompletionTool[]> {
  console.log("[Registry] Buscando ferramentas do servidor MCP Python...");

  try {
    const mcpToolsRaw = await mcpService.getTools();
    const mcpTools = mcpToolsRaw.map(convertMcpToolToOpenAI);
    console.log(`[Registry] ${mcpTools.length} ferramentas MCP convertidas`);

    // Combinar ferramentas MCP + Draft
    return [...mcpTools, ...draftTools];
  } catch (error) {
    console.error("[Registry] Erro ao buscar ferramentas MCP:", error);
    // Retornar apenas ferramentas de draft se MCP falhar
    return draftTools;
  }
}
