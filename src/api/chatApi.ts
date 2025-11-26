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

  // 1.5 Busca documentos disponíveis para dar contexto ao modelo
  const { documentService } = require("../services/documentService");
  const docs = await documentService.getAllDocuments();
  const outputDir = "C:\\Users\\lucas\\Documents\\MCP\\mcp-word-caller\\output";

  const docsContext = docs
    .map((d: any) => {
      return `- ID: ${d.id} | Filename: ${d.filename} | Path: ${outputDir}\\${d.filename}`;
    })
    .join("\n");

  const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}

  CONTEXTO DE ARQUIVOS EXISTENTES:
  Você tem acesso aos seguintes arquivos no sistema. Se o usuário pedir para editar ou ler um arquivo, USE O CAMINHO COMPLETO (Path) listado abaixo.
  
  ${docsContext}
  
  IMPORTANTE: Ao chamar ferramentas como 'edit_document', 'modify_document', etc., sempre use o 'Path' completo para garantir que o arquivo seja encontrado.
  `;

  // 2. Configura Modelo com as ferramentas do Python
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    tools: tools,
    systemInstruction: dynamicSystemInstruction,
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

          // --- INTERCEPTAÇÃO PARA SALVAR NO BANCO ---
          const fileCreationTools = [
            "create_word_document",
            "create_policy_document",
            "fill_document_simple",
            "fill_document_template",
            "merge_documents",
            "edit_document",
            "modify_document",
            "update_document",
            "replace_paragraph_block_below_header",
            "replace_block_between_manual_anchors",
            "set_table_column_width",
            "set_table_column_widths",
            "set_table_width",
            "auto_fit_table_columns",
            "format_table_cell_text",
            "set_table_cell_padding",
            "replace_text",
            "modify_paragraph",
            "search_and_replace",
          ];

          if (fileCreationTools.includes(name)) {
            console.log(
              `[Interception] Verificando ferramenta de arquivo: ${name}`
            );

            let filePath: string | null = null;
            const safeArgs = args as any;

            // 1. Tentar pegar do args (mais confiável)
            if (safeArgs && typeof safeArgs === "object") {
              if (safeArgs.output_path) filePath = safeArgs.output_path;
              else if (safeArgs.filename)
                filePath = safeArgs.filename; // Aceita relativo ou absoluto
              else if (safeArgs.save_path) filePath = safeArgs.save_path;
              else if (safeArgs.docx_path) filePath = safeArgs.docx_path;
              else if (safeArgs.path) filePath = safeArgs.path;
            }

            // 2. Se não achou no args, tenta regex no output
            if (!filePath) {
              const match = toolResult
                .toString()
                .match(/([a-zA-Z]:\\[^:\n"]+\.docx)/i);
              if (match) {
                filePath = match[1].trim();
              }
            }

            // 3. Se o path for relativo (não tem :) assumir output dir
            if (filePath && !filePath.includes(":")) {
              const path = require("path");
              filePath = path.join(
                "C:\\Users\\lucas\\Documents\\MCP\\mcp-word-caller\\output",
                filePath
              );
            }

            if (filePath) {
              console.log(
                `[Interception] Detectado arquivo criado: ${filePath}`
              );
              try {
                const {
                  documentService,
                } = require("../services/documentService");
                await documentService.saveDocumentFromFile(filePath);
                console.log(
                  "[Interception] Arquivo salvo no banco com sucesso."
                );
              } catch (dbError) {
                console.error(
                  "[Interception] Erro ao salvar no banco:",
                  dbError
                );
              }
            } else {
              console.log(
                "[Interception] Não foi possível identificar o caminho do arquivo para salvar."
              );
              console.log("Args:", JSON.stringify(args));
              console.log("Output:", toolResult);
            }
          }
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
