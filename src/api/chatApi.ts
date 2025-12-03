import { GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import "dotenv/config";
import { getAllTools } from "../registry/toolRegistry";
import { mcpService } from "../services/mcpService";
import { SYSTEM_INSTRUCTION } from "../config/systemPrompts";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function handleUserPrompt(promptUsuario: string): Promise<string> {
  console.log(`[Cliente] Recebido: "${promptUsuario}"`);

  const tools = await getAllTools();

  const { documentService } = require("../services/documentService");
  const docs = await documentService.getAllDocuments();
  const outputDir = "C:\\Users\\dasilva.lucas\\Documents\\MCP\\mcp-word-caller\\output";

  const docsContext = docs
    .map((d: any) => {
      const linkInfo = d.sharePointLink ? ` | SharePoint Link: ${d.sharePointLink}` : '';
      return `- ID: ${d.id} | Filename: ${d.filename} | Path: ${outputDir}\\${d.filename}${linkInfo}`;
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
    model: "gemini-2.5-flash",
    tools: tools,
    systemInstruction: dynamicSystemInstruction,
  });

  const chat: ChatSession = model.startChat();

  let result = await chat.sendMessage(promptUsuario);

  while (true) {
    const functionCalls = result.response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      console.log(
        `[Gemini] Decidiu chamar ${functionCalls.length} ferramenta(s)...`
      );

      const functionResponses = [];

      for (const call of functionCalls) {
        const name = call.name;
        const args = call.args;
        console.log(`[Gemini] Chamando ferramenta remota: ${name}`);
        console.log(`[Gemini] Args:`, JSON.stringify(args));

        let toolResult;

        try {
          console.log("[Exec] Enviando comando para o MCP Python...");

          const safeArgs = args as any;
          let targetFile: string | null = null;

          if (safeArgs && typeof safeArgs === "object") {
            if (safeArgs.filename) targetFile = safeArgs.filename;
            else if (safeArgs.docx_path) targetFile = safeArgs.docx_path;
            else if (safeArgs.path) targetFile = safeArgs.path;
          }

          if (targetFile && typeof targetFile === "string") {
            const path = require("path");
            const fs = require("fs");
            const { documentService } = require("../services/documentService");
            const { storageService } = require("../services/storageService");

            if (!targetFile.includes(":")) {
              targetFile = path.join(
                "C:\\Users\\dasilva.lucas\\Documents\\MCP\\mcp-word-caller\\output",
                targetFile
              );
            }
           
            const filename = path.basename(targetFile);

            const { PrismaClient } = require("@prisma/client");
            const prisma = new PrismaClient();
            const doc = await prisma.document.findFirst({ where: { filename } });

            if (doc && doc.storagePath) {
               console.log(`[Sync] ========================================`);
               console.log(`[Sync] Arquivo monitorado encontrado no banco.`);
               console.log(`[Sync] - Filename: ${doc.filename}`);
               console.log(`[Sync] - SharePoint ID: ${doc.storagePath}`);
               console.log(`[Sync] - Target local: ${targetFile}`);
               console.log(`[Sync] Baixando versão MAIS RECENTE do SharePoint...`);
               
               const { sharePointService } = require("../services/sharePointService");
               try {
                 // Delay de 2 segundos para garantir que o SharePoint processou as últimas mudanças
                 // (Word Online pode demorar para "commitar" as edições)
                 console.log(`[Sync] Aguardando 2s para SharePoint processar mudanças...`);
                 await new Promise(resolve => setTimeout(resolve, 2000));
                 
                 const buffer = await sharePointService.downloadFile(doc.storagePath);
                 
                 // Verifica se o arquivo local existe e compara tamanhos
                 if (fs.existsSync(targetFile)) {
                   const localStats = fs.statSync(targetFile);
                   console.log(`[Sync] Tamanho local anterior: ${localStats.size} bytes`);
                   console.log(`[Sync] Tamanho do SharePoint: ${buffer.length} bytes`);
                   
                   if (localStats.size === buffer.length) {
                     console.log(`[Sync] ⚠️ ATENÇÃO: Tamanhos iguais - pode ser a mesma versão!`);
                   } else {
                     console.log(`[Sync] ✅ Tamanhos diferentes - versão atualizada detectada!`);
                   }
                 }
                 
                 await fs.promises.writeFile(targetFile, buffer);
                 console.log(`[Sync] ✅ Arquivo atualizado localmente: ${targetFile}`);
                 console.log(`[Sync] ========================================`);
               } catch (dlError: any) {
                 console.error(`[Sync] ❌ Erro ao baixar do SharePoint:`, dlError.message);
                 if (!fs.existsSync(targetFile)) {
                    throw new Error("Arquivo não encontrado no SharePoint e não existe localmente.");
                 }
                 console.warn("[Sync] ⚠️ Usando versão local como fallback (pode estar desatualizada!).");
               }
            } else {
               if (!fs.existsSync(targetFile)) {
                  console.log(`[Sync] Arquivo não está no banco e não existe localmente. Tentando busca por nome no SharePoint...`);
                  const { sharePointService } = require("../services/sharePointService");
                  try {
                    const fileId = await sharePointService.getFileIdByName(filename);
                    if (fileId) {
                       console.log(`[Sync] Encontrado por nome (ID: ${fileId}). Baixando...`);
                       const buffer = await sharePointService.downloadFile(fileId);
                       await fs.promises.writeFile(targetFile, buffer);
                    }
                  } catch (e) {
                     console.log("[Sync] Arquivo realmente não encontrado.");
                  }
               }
            }
          }

          toolResult = await mcpService.callTool(name, args);

          console.log("[Exec] Sucesso. Retorno do Python recebido.");
          console.log("[Exec] ========== RETORNO MCP ==========");
          console.log(JSON.stringify(toolResult, null, 2));
          console.log("[Exec] ==================================");

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
            "edit_paragraph_text",
            "search_and_replace",
            "insert_line_or_paragraph_near_text",
            "insert_paragraph_after",
            "edit_header_footer",
            "insert_text_inline",
            "add_paragraph",
            "add_section_with_inherited_formatting"
          ];

          // Verifica se o search_and_replace não encontrou nada
          if (name === "search_and_replace") {
            const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            if (resultStr.includes("0 replacement") || resultStr.includes("no replacement") || resultStr.includes("not found") || resultStr.includes("No matches")) {
              console.log("[Exec] ⚠️ search_and_replace não encontrou o texto!");
              // Adiciona informação útil para debug
              toolResult = `${toolResult}\n\n⚠️ ATENÇÃO: O texto buscado não foi encontrado no documento. Isso pode acontecer se:\n1. O texto está escrito de forma diferente (maiúsculas/minúsculas, espaços extras)\n2. O texto está em um formato especial (título, cabeçalho)\n3. O documento no SharePoint ainda não foi sincronizado com suas últimas edições\n\nSugestão: Use a ferramenta 'get_document_text' para ver o conteúdo atual do documento.`;
            }
          }

          if (fileCreationTools.includes(name)) {
            console.log(
              `[Interception] Verificando ferramenta de arquivo: ${name}`
            );

            let filePath: string | null = null;
            const safeArgs = args as any;

            if (safeArgs && typeof safeArgs === "object") {
              if (safeArgs.output_path) filePath = safeArgs.output_path;
              else if (safeArgs.filename)
                filePath = safeArgs.filename;
              else if (safeArgs.save_path) filePath = safeArgs.save_path;
              else if (safeArgs.docx_path) filePath = safeArgs.docx_path;
              else if (safeArgs.path) filePath = safeArgs.path;
            }

            if (!filePath) {
              const match = toolResult
                .toString()
                .match(/([a-zA-Z]:\\[^:\n"]+\.docx)/i);
              if (match) {
                filePath = match[1].trim();
              }
            }

            if (filePath && !filePath.includes(":")) {
              const path = require("path");
              filePath = path.join(
                "C:\\Users\\dasilva.lucas\\Documents\\MCP\\mcp-word-caller\\output",
                filePath
              );
            }

            if (filePath) {
              console.log(
                `[Interception] Detectado arquivo criado: ${filePath}`
              );
              try {
                const fs = require("fs");
                const waitForFile = async (
                  path: string,
                  timeout = 5000,
                  interval = 500
                ) => {
                  const startTime = Date.now();
                  while (Date.now() - startTime < timeout) {
                    if (fs.existsSync(path)) {
                      const stats = fs.statSync(path);
                      if (stats.size > 0) {
                        return true;
                      }
                    }
                    await new Promise((resolve) =>
                      setTimeout(resolve, interval)
                    );
                  }
                  return false;
                };

                console.log(`[Interception] Aguardando arquivo: ${filePath}`);
                const exists = await waitForFile(filePath);

                if (!exists) {
                  console.error(
                    `[Interception] Arquivo não encontrado após espera: ${filePath}`
                  );
                  try {
                    const dir = require("path").dirname(filePath);
                    const files = fs.readdirSync(dir);
                    console.log(`[Interception] Arquivos em ${dir}:`, files);
                  } catch (lsErr) {
                    console.error(
                      "[Interception] Erro ao listar diretório:",
                      lsErr
                    );
                  }
                } else {
                const { sharePointService } = require("../services/sharePointService");
                
                try {
                  const uploadRes = await sharePointService.uploadFile(filePath);
                  console.log("[Interception] Upload para SharePoint concluído.");
                  
                  const link = await sharePointService.createSharingLink(uploadRes.id);
                  console.log(`[Interception] Link de edição gerado: ${link}`);
                  
                  const { documentService } = require("../services/documentService");
                  const path = require("path");
                  await documentService.saveSharePointDocument(path.basename(filePath), uploadRes.id, link);
                  console.log("[Interception] Metadados salvos no banco.");

                  toolResult = `Arquivo salvo e enviado para o SharePoint.\nLink de Edição: ${link}\n\n${JSON.stringify(toolResult)}`;
                } catch (uploadError: any) {
                  const errorMessage = uploadError.message?.toLowerCase() || '';
                  const errorCode = uploadError.statusCode || uploadError.code || '';
                  
                  // Tratamento para erro 423 (documento bloqueado no SharePoint)
                  if (errorCode === 423 || errorMessage.includes('locked') || errorMessage.includes('423') || errorMessage.includes('being edited') || errorMessage.includes('in use') || errorMessage.includes('checked out')) {
                    console.error("[Interception] Documento bloqueado no SharePoint:", uploadError.message);
                    toolResult = `⚠️ ATENÇÃO: O documento está bloqueado no SharePoint!\n\nO arquivo foi modificado localmente, mas NÃO foi possível sincronizar com o SharePoint porque o documento está aberto.\n\n👉 AÇÃO NECESSÁRIA: Por favor, FECHE o documento no Word ou SharePoint e solicite a operação novamente.\n\nErro técnico: ${uploadError.message}`;
                  } else {
                    throw uploadError;
                  }
                }
              }
              } catch (dbError) {
                console.error(
                  "[Interception] Erro ao salvar no SharePoint:",
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
          
          // Tratamento especial para erro 423 (documento bloqueado)
          const errorMessage = e.message?.toLowerCase() || '';
          const errorCode = e.statusCode || e.code || '';
          
          if (errorCode === 423 || errorMessage.includes('locked') || errorMessage.includes('423') || errorMessage.includes('being edited') || errorMessage.includes('in use')) {
            toolResult = {
              error: `DOCUMENTO_BLOQUEADO: O documento está aberto por outro usuário ou aplicativo. Por favor, feche o documento no Word/SharePoint e tente novamente.`,
              userAction: "FECHAR_DOCUMENTO",
              originalError: e.message
            };
          } else {
            toolResult = {
              error: `Erro na execução da ferramenta: ${e.message}`,
            };
          }
        }

        functionResponses.push({
          functionResponse: {
            name: name,
            response: { result: toolResult },
          },
        });
      }

      result = await chat.sendMessage(functionResponses);
    } else {
      console.log("[Gemini] Resposta final recebida.");
      return result.response.text();
    }
  }
}
