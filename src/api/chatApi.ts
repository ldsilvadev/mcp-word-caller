import { GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import "dotenv/config";
import { getAllTools } from "../registry/toolRegistry";
import { mcpService } from "../services/mcpService";
import { SYSTEM_INSTRUCTION } from "../config/systemPrompts";

// --- Configuração do Modelo ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function handleUserPrompt(promptUsuario: string): Promise<string> {
  console.log(`[Cliente] Recebido: "${promptUsuario}"`);

  // 1. Inicializa ferramentas (Busca dinamicamente do Python)
  const tools = await getAllTools();

  // 2. Configura Modelo com as ferramentas do Python
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    tools: tools,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const chat: ChatSession = model.startChat();

  // Envia mensagem inicial
  let result = await chat.sendMessage(promptUsuario);

  // Loop infinito para processar chamadas de função (Function Calling)
  while (true) {
    const functionCalls = result.response.functionCalls();

    // Se o Gemini pediu para executar ferramentas
    if (functionCalls && functionCalls.length > 0) {
      console.log(
        `[Gemini] Decidiu chamar ${functionCalls.length} ferramenta(s)...`
      );

      // Array para guardar as respostas para devolver ao Gemini
      const functionResponses = [];

      for (const call of functionCalls) {
        const name = call.name;
        const args = call.args;
        console.log(`[Gemini] Chamando ferramenta remota: ${name}`);
        console.log(`[Gemini] Args:`, JSON.stringify(args));

        let toolResult;

        try {
          // --- EXECUÇÃO UNIFICADA VIA MCP ---
          // Não verificamos mais implementação local. Mandamos tudo pro Python.
          console.log("[Exec] Enviando comando para o MCP Python...");
          toolResult = await mcpService.callTool(name, args);

          console.log("[Exec] Sucesso. Retorno do Python recebido.");
        } catch (e: any) {
          console.error(`[Exec] Erro ao executar ${name}:`, e.message);
          toolResult = {
            error: `Erro na execução da ferramenta: ${e.message}`,
          };
        }

        // Adiciona à lista de respostas para o Gemini
        functionResponses.push({
          functionResponse: {
            name: name,
            response: { result: toolResult },
          },
        });
      }

      // Devolve os resultados para o Gemini continuar o raciocínio
      // Ele vai ler o resultado (ex: "Arquivo salvo em...") e gerar o texto final
      result = await chat.sendMessage(functionResponses);
    } else {
      // Se não tem mais funções para chamar, é a resposta final em texto
      console.log("[Gemini] Resposta final recebida.");
      return result.response.text();
    }
  }
}
