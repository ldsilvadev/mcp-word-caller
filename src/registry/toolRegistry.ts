import { Tool } from "@google/generative-ai";
import { mcpService } from "../services/mcpService";

/**
 * Busca todas as ferramentas disponíveis diretamente do servidor MCP (Python).
 */
export async function getAllTools(): Promise<Tool[]> {
  console.log("[Registry] Buscando ferramentas do servidor MCP Python...");
  const tools = await mcpService.getToolsAsGeminiFormat();
  return tools;
}
