import { Tool, SchemaType } from "@google/generative-ai";
import { mcpService } from "../services/mcpService";

/**
 * Busca todas as ferramentas disponíveis:
 * 1. Ferramentas do servidor MCP Python (remoto)
 * 2. Ferramentas de Rascunho (local)
 */
export async function getAllTools(): Promise<Tool[]> {
  console.log("[Registry] Buscando ferramentas do servidor MCP Python...");
  const mcpTools = await mcpService.getToolsAsGeminiFormat();

  const draftTools: Tool = {
    functionDeclarations: [
      {
        name: "create_draft",
        description:
          "Creates a new document draft. Use this INSTEAD of creating a document directly.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: {
              type: SchemaType.STRING,
              description: "Title of the document draft",
            },
            content: {
              type: SchemaType.OBJECT,
              description: "JSON content of the draft",
              properties: {}, // Allow any object structure
            },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "get_draft",
        description: "Retrieves the content of a draft by ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: {
              type: SchemaType.NUMBER,
              description: "ID of the draft",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "update_draft",
        description: "MUST be used to update/modify/edit an existing draft. When user asks to change, modify, edit, add, remove, or update ANY content in the current document/draft, you MUST call this function with the draft ID and the COMPLETE updated content. Always call get_draft first to get current content, then modify it, then call update_draft.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: {
              type: SchemaType.NUMBER,
              description: "ID of the draft to update",
            },
            content: {
              type: SchemaType.OBJECT,
              description: "Complete updated JSON content for the draft. Must include all sections (secao) with titulo and paragrafo.",
              properties: {},
            },
          },
          required: ["id", "content"],
        },
      },
      {
        name: "generate_document_from_draft",
        description: "Generates the final DOCX file from a draft.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: {
              type: SchemaType.NUMBER,
              description: "ID of the draft to generate",
            },
          },
          required: ["id"],
        },
      },
    ],
  };

  // Merge function declarations
  if (mcpTools.length > 0) {
    // Cast to any to access functionDeclarations safely as it might be a union type
    const mcpTool = mcpTools[0] as any;
    if (mcpTool.functionDeclarations) {
      mcpTool.functionDeclarations = [
        ...mcpTool.functionDeclarations,
        ...draftTools.functionDeclarations!,
      ];
      return mcpTools;
    }
  }

  return [draftTools];
}
