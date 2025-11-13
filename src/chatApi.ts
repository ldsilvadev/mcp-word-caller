import { GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import "dotenv/config";
// Nossos arquivos de ferramentas permanecem os mesmos
import { allToolDefinitions, toolImplementations } from "./toolRegistry";

// --- Configuração do Modelo ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({
  model: "models/gemini-2.5-flash",
  tools: allToolDefinitions,
});

export async function handleUserPrompt(promptUsuario: string): Promise<string> {
  console.log(`[Cliente] Recebido: "${promptUsuario}"`);

  const chat: ChatSession = model.startChat();

  let result = await chat.sendMessage(promptUsuario);

  while (true) {
    const functionCalls = result.response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      console.log(
        `[Gemini] Decidiu chamar ${functionCalls.length} ferramenta(s)...`
      );

      const call = functionCalls[0];
      console.log(`[Gemini] Chamando: ${call?.name}`);

      const toolToExecute = toolImplementations.get(call?.name || "");

      if (toolToExecute) {
        let toolResult;
        try {
          const args = call?.args as any;
          console.log("[Cliente] Executando ferramenta com args:", args);
          toolResult = await toolToExecute(args);
          console.log("[Cliente] Ferramenta executada. Resultado:", toolResult);
        } catch (e: any) {
          console.error(`[Cliente] Erro ao executar ${call?.name}:`, e.message);
          toolResult = { error: `Erro ao executar a ferramenta: ${e.message}` };
        }

        result = await chat.sendMessage(
          JSON.stringify({
            functionResponse: {
              name: call?.name,
              response: toolResult,
            },
          })
        );
      } else {
        console.warn(
          `[Cliente] IA tentou chamar ferramenta desconhecida: ${call?.name}`
        );
        return `Desculpe, ocorreu um erro: a ferramenta ${call?.name} não foi encontrada.`;
      }
    } else {
      console.log("[Gemini] Resposta final em texto recebida.");
      return result.response.text();
    }
  }
}
