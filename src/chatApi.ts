import { GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import "dotenv/config";
// Nossos arquivos de ferramentas permanecem os mesmos
import { allToolDefinitions, toolImplementations } from "./toolRegistry";

// --- Configuração do Modelo ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({
  model: "models/gemini-2.5-flash", // Mantenha o modelo que funciona para você
  tools: allToolDefinitions,
});

/**
 * Lida com um prompt do usuário, executando um loop de ferramentas
 * até que uma resposta final em texto seja obtida.
 */
export async function handleUserPrompt(promptUsuario: string): Promise<string> {
  console.log(`[Cliente] Recebido: "${promptUsuario}"`);

  // 1. Inicia um chat (que manterá o contexto *desta* conversa)
  const chat: ChatSession = model.startChat();

  // 2. Envia a mensagem inicial do usuário
  let result = await chat.sendMessage(promptUsuario);

  // 3. Inicia o loop do "Agente"
  while (true) {
    const functionCalls = result.response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      // --- ETAPA A: IA quer chamar uma ferramenta ---
      console.log(
        `[Gemini] Decidiu chamar ${functionCalls.length} ferramenta(s)...`
      );

      // Vamos processar a primeira chamada (poderia ser um loop 'for' para múltiplas)
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

        // 4. Envia o resultado da ferramenta DE VOLTA para a IA
        result = await chat.sendMessage(
          JSON.stringify({
            functionResponse: {
              name: call?.name,
              response: toolResult,
            },
          })
        );
        // O loop continua, 'result' agora é a nova resposta da IA
      } else {
        // Se a IA tentar chamar uma ferramenta que não existe
        console.warn(
          `[Cliente] IA tentou chamar ferramenta desconhecida: ${call?.name}`
        );
        return `Desculpe, ocorreu um erro: a ferramenta ${call?.name} não foi encontrada.`;
      }
    } else {
      // --- ETAPA B: IA respondeu com texto ---
      console.log("[Gemini] Resposta final em texto recebida.");
      // Não há mais chamadas de ferramenta, esta é a resposta final.
      // Sai do loop e retorna o texto.
      return result.response.text();
    }
  } // Fim do while(true)
}
