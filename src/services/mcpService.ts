// src/services/mcpService.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool } from "@google/generative-ai";

const PYTHON_PATH =
  "C:\\Users\\lucas\\Documents\\POC MCP\\office-word-mcp-server\\venv\\Scripts\\python";
const MCP_SERVER_DIR =
  "C:\\Users\\lucas\\Documents\\POC MCP\\office-word-mcp-server";


export class McpService {
  private client: Client;
  private transport: StdioClientTransport;
  private isConnected: boolean = false;

  constructor() {
    this.transport = new StdioClientTransport({
      command: PYTHON_PATH,
      args: ["-m", "word_document_server.main"],
      cwd: MCP_SERVER_DIR,
      env: { ...process.env } as Record<string, string>,
    });

    this.client = new Client(
      { name: "node-gemini-host", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect() {
    if (this.isConnected) return;
    try {
      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log("✅ Conectado ao servidor MCP Python.");
    } catch (error) {
      console.error("❌ Falha ao conectar no MCP Python:", error);
      throw error;
    }
  }

  async getToolsAsGeminiFormat(): Promise<Tool[]> {
    if (!this.isConnected) await this.connect();

    const mcpList = await this.client.listTools();

    // Converte o Schema do MCP (JSON Schema) para o formato do Gemini
    const geminiTools: Tool[] = [
      {
        functionDeclarations: mcpList.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          // O Gemini aceita o inputSchema do MCP quase diretamente
          parameters: tool.inputSchema as any,
        })),
      },
    ];

    return geminiTools;
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.isConnected) await this.connect();

    console.log(`🔌 Enviando comando para Python MCP: ${name}`);
    const result = await this.client.callTool({
      name: name,
      arguments: args,
    });

    const output = result as any;

    if (
      output.content &&
      Array.isArray(output.content) &&
      output.content.length > 0 &&
      output.content[0].type === "text"
    ) {
      return output.content[0].text;
    }

    return output;
  }
}

export const mcpService = new McpService();
