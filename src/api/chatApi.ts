import { GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import "dotenv/config";
import { getAllTools } from "../registry/toolRegistry";
import { mcpService } from "../services/mcpService";
import { SYSTEM_INSTRUCTION } from "../config/systemPrompts";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// Interface para conteúdo do editor
interface EditorContent {
  markdown: string;
  metadata: {
    assunto: string;
    codigo: string;
    departamento: string;
    revisao: string;
    data_publicacao: string;
    data_vigencia: string;
  };
}

// Interface para resposta do chat
export interface ChatResponse {
  response: string;
  draftUpdated: boolean;
  updatedDraftId: number | null;
}

export async function handleUserPrompt(
  promptUsuario: string, 
  activeDraftId?: number | null,
  currentEditorContent?: EditorContent | null
): Promise<ChatResponse> {
  console.log(`[Cliente] Recebido: "${promptUsuario}"`);
  console.log(`[Cliente] Active Draft ID: ${activeDraftId || "none"}`);
  console.log(`[Cliente] Editor content provided: ${currentEditorContent ? "yes" : "no"}`);

  // Rastrear se o draft foi atualizado durante esta interação
  let draftWasUpdated = false;
  let updatedDraftId: number | null = null;

  const tools = await getAllTools();

  const { documentService } = require("../services/documentService");
  const docs = await documentService.getAllDocuments();
  const outputDir =
    "C:\\Users\\lucas\\Documents\\POC MCP\\mcp-word-caller\\output";

  const docsContext = docs
    .map((d: any) => {
      return `- ID: ${d.id} | Filename: ${d.filename} | Path: ${outputDir}\\${d.filename}`;
    })
    .join("\n");

  // Adicionar contexto do draft ativo se existir
  let activeDraftContext = "";
  if (activeDraftId) {
    const { draftService } = require("../services/draftService");
    const activeDraft = await draftService.getDraft(activeDraftId);
    if (activeDraft) {
      // PRIORIDADE: Usar conteúdo do editor se disponível (pode ter edições manuais do usuário)
      // Caso contrário, usar conteúdo do banco de dados
      let contentPreview = "";
      let usingEditorContent = false;
      
      if (currentEditorContent && currentEditorContent.markdown) {
        // Usar conteúdo atual do editor (inclui edições manuais do usuário)
        contentPreview = currentEditorContent.markdown;
        usingEditorContent = true;
        console.log(`[Cliente] Usando conteúdo do EDITOR (pode ter edições manuais)`);
      } else {
        // Fallback: usar conteúdo do banco de dados
        const content = activeDraft.content;
        if (typeof content === "string") {
          contentPreview = content.substring(0, 4000);
        } else if (content && typeof content === "object") {
          if (content.markdownContent) {
            contentPreview = content.markdownContent.substring(0, 4000);
          } else if (content.secao && Array.isArray(content.secao)) {
            contentPreview = content.secao.map((s: any) => `${s.titulo}: ${(s.paragrafo || "").substring(0, 200)}...`).join("\n");
          } else {
            contentPreview = JSON.stringify(content).substring(0, 4000);
          }
        }
        console.log(`[Cliente] Usando conteúdo do BANCO DE DADOS`);
      }

      // Metadados: priorizar do editor se disponível
      const metadata = currentEditorContent?.metadata || {
        assunto: (activeDraft.content as any)?.assunto || activeDraft.title,
        codigo: (activeDraft.content as any)?.codigo || "",
        departamento: (activeDraft.content as any)?.departamento || "",
        revisao: (activeDraft.content as any)?.revisao || "01",
        data_publicacao: (activeDraft.content as any)?.data_publicacao || "",
        data_vigencia: (activeDraft.content as any)?.data_vigencia || "",
      };

      activeDraftContext = `

=== DRAFT ATIVO NO EDITOR (CRÍTICO - LEIA COM ATENÇÃO) ===
O usuário está visualizando e editando o seguinte rascunho:
- ID do Draft: ${activeDraftId}
- Título: ${activeDraft.title}
- Status: ${activeDraft.status}
${usingEditorContent ? "- ⚠️ ATENÇÃO: O conteúdo abaixo é do EDITOR e pode conter EDIÇÕES MANUAIS do usuário que ainda não foram salvas!" : ""}

METADADOS DO DOCUMENTO:
- Assunto: ${metadata.assunto}
- Código: ${metadata.codigo}
- Departamento: ${metadata.departamento}
- Revisão: ${metadata.revisao}
- Data Publicação: ${metadata.data_publicacao}
- Data Vigência: ${metadata.data_vigencia}

CONTEÚDO ATUAL DO DRAFT (MARKDOWN):
${contentPreview}

=== REGRAS OBRIGATÓRIAS ===
${usingEditorContent ? `
⚠️ IMPORTANTE: O conteúdo acima pode conter EDIÇÕES MANUAIS do usuário!
Ao fazer modificações, você DEVE:
1. PRESERVAR todas as alterações que o usuário fez manualmente
2. Apenas modificar o que foi explicitamente solicitado
3. Mesclar suas alterações com as edições do usuário
` : ""}

VOCÊ DEVE SEMPRE usar as ferramentas de draft quando o usuário pedir QUALQUER modificação.

Se o usuário pedir para:
- Modificar, alterar, editar, mudar texto
- Adicionar, incluir, inserir conteúdo
- Remover, excluir, deletar partes
- Corrigir, ajustar, melhorar algo
- Trocar, substituir palavras ou seções

VOCÊ DEVE OBRIGATORIAMENTE:
1. Usar o conteúdo ATUAL mostrado acima como base (NÃO chamar get_draft, pois o conteúdo do editor pode ser diferente do banco)
2. Fazer a modificação solicitada PRESERVANDO as outras partes
3. Chamar 'update_draft' com id=${activeDraftId} e o conteúdo COMPLETO atualizado

NUNCA responda apenas com texto explicando o que faria.
SEMPRE execute as ferramentas para fazer a modificação real.
NUNCA crie um novo draft - use SEMPRE o ID ${activeDraftId}.

A estrutura do content para update_draft deve ser:
{
  "assunto": "${metadata.assunto}",
  "codigo": "${metadata.codigo}",
  "departamento": "${metadata.departamento}",
  "revisao": "${metadata.revisao}",
  "data_publicacao": "${metadata.data_publicacao}",
  "data_vigencia": "${metadata.data_vigencia}",
  "markdownContent": "# 1. Título\\n\\nConteúdo...\\n\\n# 2. Outro Título\\n\\nMais conteúdo..."
}

Use o campo "markdownContent" com o conteúdo em formato Markdown.
`;
    }
  }

  const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}

  CONTEXTO DE ARQUIVOS EXISTENTES:
  Você tem acesso aos seguintes arquivos no sistema. Se o usuário pedir para editar ou ler um arquivo, USE O CAMINHO COMPLETO (Path) listado abaixo.
  
  ${docsContext}
  
  IMPORTANTE: Ao chamar ferramentas como 'edit_document', 'modify_document', etc., sempre use o 'Path' completo para garantir que o arquivo seja encontrado.
  ${activeDraftContext}`;

  // 2. Configura Modelo com as ferramentas do Python
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    tools: tools,
    systemInstruction: dynamicSystemInstruction,
  });

  const chat: ChatSession = model.startChat();

  // Se há um draft ativo e o usuário parece querer modificar, adicionar instrução extra
  let enhancedPrompt = promptUsuario;
  if (activeDraftId) {
    const modificationKeywords = [
      'mude', 'altere', 'modifique', 'edite', 'troque', 'substitua',
      'adicione', 'inclua', 'insira', 'remova', 'exclua', 'delete',
      'corrija', 'ajuste', 'melhore', 'atualize',
      'change', 'modify', 'edit', 'update', 'add', 'remove', 'fix'
    ];
    
    const promptLower = promptUsuario.toLowerCase();
    const isModificationRequest = modificationKeywords.some(kw => promptLower.includes(kw));
    
    if (isModificationRequest) {
      enhancedPrompt = `${promptUsuario}

IMPORTANTE: Para fazer esta modificação, você DEVE:
1. Chamar get_draft com id=${activeDraftId}
2. Fazer a modificação no conteúdo
3. Chamar update_draft com id=${activeDraftId} e o conteúdo completo atualizado

NÃO apenas descreva a modificação - EXECUTE as ferramentas.`;
      console.log(`[Cliente] Detectada solicitação de modificação, prompt aprimorado`);
    }
  }

  let result = await chat.sendMessage(enhancedPrompt);

  while (true) {
    const functionCalls = result.response.functionCalls();

    console.log(`[Gemini] Function calls: ${functionCalls ? functionCalls.length : 0}`);
    if (functionCalls) {
      console.log(`[Gemini] Tools called: ${functionCalls.map(c => c.name).join(', ')}`);
    }

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
            const doc = await prisma.document.findFirst({
              where: { filename },
            });

            if (doc && doc.storagePath) {
              console.log(
                `[Sync] Arquivo monitorado encontrado no banco (ID: ${doc.storagePath}).`
              );
              console.log(
                `[Sync] Baixando versão mais recente do SharePoint para garantir integridade...`
              );

              const {
                sharePointService,
              } = require("../services/sharePointService");
              try {
                const buffer = await sharePointService.downloadFile(
                  doc.storagePath
                );
                await fs.promises.writeFile(targetFile, buffer);
                console.log(
                  `[Sync] Arquivo atualizado localmente: ${targetFile}`
                );
              } catch (dlError) {
                console.error(
                  `[Sync] Erro ao baixar do SharePoint (pode ter sido deletado?):`,
                  dlError
                );
                if (!fs.existsSync(targetFile)) {
                  throw new Error(
                    "Arquivo não encontrado no SharePoint e não existe localmente."
                  );
                }
                console.warn("[Sync] Usando versão local como fallback.");
              }
            } else {
              if (!fs.existsSync(targetFile)) {
                console.log(
                  `[Sync] Arquivo não está no banco e não existe localmente. Tentando busca por nome no SharePoint...`
                );
                const {
                  sharePointService,
                } = require("../services/sharePointService");
                try {
                  const fileId = await sharePointService.getFileIdByName(
                    filename
                  );
                  if (fileId) {
                    console.log(
                      `[Sync] Encontrado por nome (ID: ${fileId}). Baixando...`
                    );
                    const buffer = await sharePointService.downloadFile(fileId);
                    await fs.promises.writeFile(targetFile, buffer);
                  }
                } catch (e) {
                  console.log("[Sync] Arquivo realmente não encontrado.");
                }
              }
            }
          }

          // ---------------------------------------------------------
          // NEW: Draft Management Tools
          // ---------------------------------------------------------
          if (name === "create_draft") {
            const { draftService } = require("../services/draftService");
            const draft = await draftService.createDraft(
              safeArgs.title,
              safeArgs.content
            );
            // Marcar que um draft foi criado/atualizado para notificar o frontend
            draftWasUpdated = true;
            updatedDraftId = draft.id;
            console.log(`[Draft] Draft ${draft.id} was created, will notify frontend`);
            toolResult = `Draft created successfully. ID: ${draft.id}. Title: ${draft.title}. \nYou can now ask the user to review it or update it using 'update_draft'.`;
          } else if (name === "get_draft") {
            const { draftService } = require("../services/draftService");
            const draft = await draftService.getDraft(safeArgs.id);
            if (draft) {
              toolResult = JSON.stringify(draft);
            } else {
              toolResult = "Draft not found.";
            }
          } else if (name === "update_draft") {
            const { draftService } = require("../services/draftService");
            const draft = await draftService.updateDraft(
              safeArgs.id,
              safeArgs.content
            );
            // Marcar que o draft foi atualizado para notificar o frontend
            draftWasUpdated = true;
            updatedDraftId = draft.id;
            console.log(`[Draft] Draft ${draft.id} was updated, will notify frontend`);
            toolResult = `Draft updated successfully. ID: ${draft.id}.`;
          } else if (name === "generate_document_from_draft") {
            const { draftService } = require("../services/draftService");
            const genResult = await draftService.generateDocumentFromDraft(
              safeArgs.id
            );

            console.log(`[Draft] Generated document filename: ${genResult.filename}`);

            // Se tiver link do SharePoint, retornar na resposta
            if (genResult.sharePointLink) {
              toolResult = `✅ Documento gerado com sucesso!\n\n📄 Arquivo: ${genResult.filename}\n🔗 Link do SharePoint: ${genResult.sharePointLink}\n\nVocê pode acessar e editar o documento diretamente pelo link acima.`;
            } else {
              toolResult = `✅ Documento gerado: ${genResult.filename}\n\n${genResult.result}`;
            }

            // Não precisa mais da interceptação abaixo pois já fizemos upload no draftService
            // Marcar para pular a interceptação
            if (!args) (args as any) = {};
            (args as any)._skipInterception = true;
          } else {
            // Fallback to standard MCP tools
            toolResult = await mcpService.callTool(name, args);
          }

          console.log("[Exec] Sucesso. Retorno do Python/Local recebido.");

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
            "add_section_with_inherited_formatting",
            // Add the new generation tool to this list so interception works
            "generate_document_from_draft",
          ];

          // Pular interceptação se já foi feita (ex: generate_document_from_draft)
          const skipInterception = (args as any)?._skipInterception === true;

          if (fileCreationTools.includes(name) && !skipInterception) {
            console.log(
              `[Interception] Verificando ferramenta de arquivo: ${name}`
            );

            let filePath: string | null = null;
            const safeArgs = args as any;

            if (safeArgs && typeof safeArgs === "object") {
              if (safeArgs.output_path) filePath = safeArgs.output_path;
              else if (safeArgs.filename) filePath = safeArgs.filename;
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
                  const {
                    sharePointService,
                  } = require("../services/sharePointService");
                  const uploadRes = await sharePointService.uploadFile(
                    filePath
                  );
                  console.log(
                    "[Interception] Upload para SharePoint concluído."
                  );

                  const link = await sharePointService.createSharingLink(
                    uploadRes.id
                  );
                  console.log(`[Interception] Link de edição gerado: ${link}`);

                  const {
                    documentService,
                  } = require("../services/documentService");
                  const path = require("path");
                  await documentService.saveSharePointDocument(
                    path.basename(filePath),
                    uploadRes.id,
                    link
                  );
                  console.log("[Interception] Metadados salvos no banco.");

                  toolResult = `Arquivo salvo e enviado para o SharePoint.\nLink de Edição: ${link}\n\n${JSON.stringify(
                    toolResult
                  )}`;
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
          toolResult = {
            error: `Erro na execução da ferramenta: ${e.message}`,
          };
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
      
      // Se há um draft ativo e a IA não chamou update_draft, tentar forçar uma segunda vez
      if (activeDraftId && !draftWasUpdated) {
        const promptLower = promptUsuario.toLowerCase();
        const modificationKeywords = [
          'mude', 'altere', 'modifique', 'edite', 'troque', 'substitua',
          'adicione', 'inclua', 'insira', 'remova', 'exclua', 'delete',
          'corrija', 'ajuste', 'melhore', 'atualize',
          'change', 'modify', 'edit', 'update', 'add', 'remove', 'fix'
        ];
        
        const isModificationRequest = modificationKeywords.some(kw => promptLower.includes(kw));
        
        if (isModificationRequest) {
          console.log(`[Gemini] IA não chamou update_draft para modificação. Tentando forçar...`);
          
          // Enviar mensagem forçando o uso das ferramentas
          const forceMessage = `Você NÃO executou as ferramentas. Por favor, EXECUTE AGORA:
1. Chame get_draft com id=${activeDraftId}
2. Faça a modificação solicitada: "${promptUsuario}"
3. Chame update_draft com id=${activeDraftId} e o conteúdo COMPLETO atualizado

EXECUTE AS FERRAMENTAS AGORA. NÃO responda com texto.`;
          
          result = await chat.sendMessage(forceMessage);
          
          // Verificar se agora chamou as ferramentas
          const retryFunctionCalls = result.response.functionCalls();
          if (retryFunctionCalls && retryFunctionCalls.length > 0) {
            console.log(`[Gemini] Segunda tentativa: ${retryFunctionCalls.length} ferramenta(s)`);
            // Continuar o loop para processar as ferramentas
            continue;
          }
        }
      }
      
      console.log(`[Gemini] Draft updated: ${draftWasUpdated}, Updated ID: ${updatedDraftId}`);
      return {
        response: result.response.text(),
        draftUpdated: draftWasUpdated,
        updatedDraftId: updatedDraftId,
      };
    }
  }
}
