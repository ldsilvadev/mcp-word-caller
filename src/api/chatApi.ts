import { azureOpenAI, deploymentName } from "./azureOpenAiClient";
import {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import "dotenv/config";
import { getAllTools } from "../registry/toolRegistry";
import { mcpService } from "../services/mcpService";
import { SYSTEM_INSTRUCTION } from "../config/systemPrompts";

// Interface para conteúdo do editor (não mais usado, mas mantido para compatibilidade)
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

  // Rastrear se o draft foi atualizado durante esta interação
  let draftWasUpdated = false;
  let updatedDraftId: number | null = null;

  const tools = await getAllTools();

  const { documentService } = require("../services/documentService");
  const docs = await documentService.getAllDocuments();
  const outputDir =
    "C:\\Users\\dasilva.lucas\\Documents\\MCP-WORD\\mcp-word-caller\\output";

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
      const content = activeDraft.content as any;
      const filePath = await draftService.getDraftFilePath(activeDraftId);
      const metadata = content?.metadata || {};

      // Extrair texto do documento Word para contexto
      let documentText = "";
      if (filePath) {
        try {
          const mammoth = require("mammoth");
          const fs = require("fs");
          const buffer = fs.readFileSync(filePath);
          const result = await mammoth.extractRawText({ buffer });
          documentText = result.value?.substring(0, 4000) || "";
          console.log(`[Cliente] Texto extraído do Word (${documentText.length} chars)`);
        } catch (e) {
          console.log(`[Cliente] Não foi possível extrair texto do Word:`, e);
        }
      }

      activeDraftContext = `

=== DOCUMENTO ATIVO NO EDITOR ===
O usuário está editando o seguinte documento:
- ID do Draft: ${activeDraftId}
- Título: ${activeDraft.title}
- Arquivo: ${filePath || "N/A"}
- Status: ${activeDraft.status}

METADADOS DO DOCUMENTO:
- Assunto: ${metadata.assunto || activeDraft.title}
- Código: ${metadata.codigo || "---"}
- Departamento: ${metadata.departamento || "---"}
- Revisão: ${metadata.revisao || "01"}
- Data Publicação: ${metadata.data_publicacao || "---"}
- Data Vigência: ${metadata.data_vigencia || "---"}

CONTEÚDO ATUAL DO DOCUMENTO:
${documentText}

=== COMO MODIFICAR O DOCUMENTO ===
Para modificar este documento, você DEVE usar as ferramentas MCP de edição de Word diretamente no arquivo:
- Caminho do arquivo: ${filePath}

Ferramentas disponíveis para edição:
- replace_text: Substituir texto no documento
- add_paragraph: Adicionar parágrafo
- modify_paragraph: Modificar parágrafo existente
- insert_paragraph_after: Inserir parágrafo após outro
- search_and_replace: Buscar e substituir texto
- edit_document: Edição geral do documento

IMPORTANTE:
1. Use SEMPRE o caminho do arquivo: ${filePath}
2. Após modificar, o OnlyOffice recarregará automaticamente
3. NÃO use update_draft para modificar conteúdo - use as ferramentas MCP diretamente
4. update_draft só deve ser usado para criar novos drafts
`;
    }
  }

  const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}

CONTEXTO DE ARQUIVOS EXISTENTES:
Você tem acesso aos seguintes arquivos no sistema. Se o usuário pedir para editar ou ler um arquivo, USE O CAMINHO COMPLETO (Path) listado abaixo.

${docsContext}

IMPORTANTE: Ao chamar ferramentas como 'edit_document', 'modify_document', etc., sempre use o 'Path' completo para garantir que o arquivo seja encontrado.
${activeDraftContext}`;


  // Preparar mensagens iniciais
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: dynamicSystemInstruction },
  ];

  // Se há um draft ativo e o usuário parece querer modificar, adicionar instrução extra
  let enhancedPrompt = promptUsuario;
  if (activeDraftId) {
    const modificationKeywords = [
      "mude", "altere", "modifique", "edite", "troque", "substitua",
      "adicione", "inclua", "insira", "remova", "exclua", "delete",
      "corrija", "ajuste", "melhore", "atualize", "crie",
      "change", "modify", "edit", "update", "add", "remove", "fix", "create",
    ];

    const promptLower = promptUsuario.toLowerCase();
    const isModificationRequest = modificationKeywords.some((kw) =>
      promptLower.includes(kw)
    );

    if (isModificationRequest) {
      enhancedPrompt = `${promptUsuario}

IMPORTANTE: Para fazer esta modificação, você DEVE:
1. Chamar get_draft com id=${activeDraftId}
2. Fazer a modificação no conteúdo
3. Chamar update_draft com id=${activeDraftId} e o conteúdo completo atualizado

NÃO apenas descreva a modificação - EXECUTE as ferramentas.`;
      console.log(
        `[Cliente] Detectada solicitação de modificação, prompt aprimorado`
      );
    }
  }

  messages.push({ role: "user", content: enhancedPrompt });

  // Loop de conversação com tool calls
  while (true) {
    console.log(`[OpenAI] Enviando ${messages.length} mensagens...`);

    const response = await azureOpenAI.chat.completions.create({
      model: deploymentName,
      messages,
      tools,
      tool_choice: "auto",
    });

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      throw new Error("Resposta vazia do Azure OpenAI");
    }
    
    const toolCalls = assistantMessage.tool_calls;

    console.log(
      `[OpenAI] Tool calls: ${toolCalls ? toolCalls.length : 0}`
    );
    if (toolCalls) {
      console.log(
        `[OpenAI] Tools called: ${toolCalls.map((c) => "function" in c ? c.function.name : "unknown").join(", ")}`
      );
    }

    if (toolCalls && toolCalls.length > 0) {
      // Adicionar a mensagem do assistente com tool_calls
      messages.push(assistantMessage);

      console.log(
        `[OpenAI] Decidiu chamar ${toolCalls.length} ferramenta(s)...`
      );

      // Processar cada tool call
      for (const toolCall of toolCalls) {
        // Verificar se é um function tool call
        if (!("function" in toolCall)) {
          console.warn(`[OpenAI] Tool call sem função, ignorando`);
          continue;
        }
        
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || "{}");

        console.log(`[OpenAI] Chamando ferramenta: ${name}`);
        console.log(`[OpenAI] Args:`, JSON.stringify(args));

        let toolResult: string;

        try {
          toolResult = await executeToolCall(name, args, {
            onDraftUpdated: (id: number) => {
              draftWasUpdated = true;
              updatedDraftId = id;
            },
          });
        } catch (e: any) {
          console.error(`[Exec] Erro ao executar ${name}:`, e.message);
          toolResult = JSON.stringify({
            error: `Erro na execução da ferramenta: ${e.message}`,
          });
        }

        // Adicionar resultado da ferramenta
        const toolMessage: ChatCompletionToolMessageParam = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        };
        messages.push(toolMessage);
      }
    } else {
      // Resposta final sem tool calls
      console.log("[OpenAI] Resposta final recebida.");

      // Se há um draft ativo e a IA não chamou update_draft, tentar forçar
      if (activeDraftId && !draftWasUpdated) {
        const promptLower = promptUsuario.toLowerCase();
        const modificationKeywords = [
          "mude", "altere", "modifique", "edite", "troque", "substitua",
          "adicione", "inclua", "insira", "remova", "exclua", "delete",
          "corrija", "ajuste", "melhore", "atualize", "crie",
          "change", "modify", "edit", "update", "add", "remove", "fix", "create",
        ];

        const isModificationRequest = modificationKeywords.some((kw) =>
          promptLower.includes(kw)
        );

        if (isModificationRequest) {
          console.log(
            `[OpenAI] IA não chamou update_draft para modificação. Tentando forçar...`
          );

          messages.push({
            role: "user",
            content: `Você NÃO executou as ferramentas. Por favor, EXECUTE AGORA:
1. Chame get_draft com id=${activeDraftId}
2. Faça a modificação solicitada: "${promptUsuario}"
3. Chame update_draft com id=${activeDraftId} e o conteúdo COMPLETO atualizado

EXECUTE AS FERRAMENTAS AGORA. NÃO responda com texto.`,
          });

          // Continuar o loop para processar
          continue;
        }
      }

      console.log(
        `[OpenAI] Draft updated: ${draftWasUpdated}, Updated ID: ${updatedDraftId}`
      );

      let responseText = assistantMessage.content || "";

      // Se a resposta está vazia mas o draft foi atualizado, gerar uma resposta padrão
      if (!responseText || responseText.trim() === "") {
        if (draftWasUpdated && updatedDraftId) {
          responseText = `✅ Pronto! O rascunho #${updatedDraftId} foi atualizado com sucesso. Você pode visualizar as alterações no editor ao lado.`;
          console.log(
            "[OpenAI] Resposta vazia, usando mensagem padrão para draft atualizado"
          );
        } else {
          responseText = "Operação concluída.";
          console.log("[OpenAI] Resposta vazia, usando mensagem padrão genérica");
        }
      }

      return {
        response: responseText,
        draftUpdated: draftWasUpdated,
        updatedDraftId: updatedDraftId,
      };
    }
  }
}


interface ToolCallOptions {
  onDraftUpdated: (id: number) => void;
}

async function executeToolCall(
  name: string,
  args: any,
  options: ToolCallOptions
): Promise<string> {
  console.log("[Exec] Enviando comando para o MCP Python...");

  const safeArgs = args as any;
  let targetFile: string | null = null;

  if (safeArgs && typeof safeArgs === "object") {
    if (safeArgs.filename) targetFile = safeArgs.filename;
    else if (safeArgs.docx_path) targetFile = safeArgs.docx_path;
    else if (safeArgs.path) targetFile = safeArgs.path;
  }

  // Sincronização com SharePoint se necessário
  if (targetFile && typeof targetFile === "string") {
    await syncFileFromSharePoint(targetFile);
  }

  let toolResult: string;

  // Draft Management Tools
  if (name === "create_draft") {
    const { draftService } = require("../services/draftService");
    
    console.log("[Draft] create_draft args:", JSON.stringify(safeArgs, null, 2));
    
    let content = safeArgs.content || {};
    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
      } catch {
        content = { markdownContent: content };
      }
    }
    
    // Criar draft (gera o arquivo .docx via MCP)
    const draft = await draftService.createDraft(safeArgs.title, content);
    options.onDraftUpdated(draft.id);
    
    const filePath = await draftService.getDraftFilePath(draft.id);
    console.log(`[Draft] Draft ${draft.id} created with file: ${filePath}`);
    
    toolResult = `✅ Documento criado com sucesso!
- ID: ${draft.id}
- Título: ${draft.title}
- Arquivo: ${filePath}

O documento está pronto para edição no OnlyOffice.
Para modificar o documento, use as ferramentas MCP de edição de Word diretamente no arquivo.`;

  } else if (name === "get_draft") {
    const { draftService } = require("../services/draftService");
    const draft = await draftService.getDraft(safeArgs.id);
    if (draft) {
      const filePath = await draftService.getDraftFilePath(safeArgs.id);
      toolResult = JSON.stringify({ ...draft, filePath });
    } else {
      toolResult = "Draft not found.";
    }

  } else if (name === "update_draft") {
    // update_draft agora só é usado para criar novos drafts ou atualizar metadados
    // Para modificar conteúdo, a IA deve usar as ferramentas MCP diretamente
    const { draftService } = require("../services/draftService");
    
    console.log("[Draft] update_draft - redirecionando para edição via MCP");
    
    if (safeArgs.content?.markdownContent) {
      // Se a IA enviou markdownContent, regenerar o documento
      const draft = await draftService.updateDraft(safeArgs.id, safeArgs.content, true);
      options.onDraftUpdated(draft.id);
      toolResult = `✅ Documento atualizado. O OnlyOffice recarregará automaticamente.`;
    } else {
      // Apenas atualizar metadados
      await draftService.markAsModified(safeArgs.id);
      options.onDraftUpdated(safeArgs.id);
      toolResult = `Draft ${safeArgs.id} marcado como modificado.`;
    }

  } else if (name === "generate_document_from_draft") {
    const { draftService } = require("../services/draftService");
    const genResult = await draftService.generateDocumentFromDraft(safeArgs.id);
    toolResult = `✅ Documento pronto: ${genResult.filename}\nCaminho: ${genResult.outputPath}`;

  } else {
    // Fallback to standard MCP tools
    toolResult = await mcpService.callTool(name, args);

    // Interceptar criação de arquivos para upload ao SharePoint
    toolResult = await interceptFileCreation(name, args, toolResult);
  }

  console.log("[Exec] Sucesso. Retorno recebido.");
  return typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
}


async function syncFileFromSharePoint(targetFile: string): Promise<void> {
  const path = require("path");
  const fs = require("fs");

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

    const { sharePointService } = require("../services/sharePointService");
    try {
      const buffer = await sharePointService.downloadFile(doc.storagePath);
      await fs.promises.writeFile(targetFile, buffer);
      console.log(`[Sync] Arquivo atualizado localmente: ${targetFile}`);
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

async function interceptFileCreation(
  name: string,
  args: any,
  toolResult: any
): Promise<string> {
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
  ];

  if (!fileCreationTools.includes(name)) {
    return typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
  }

  console.log(`[Interception] Verificando ferramenta de arquivo: ${name}`);

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
    const match = toolResult.toString().match(/([a-zA-Z]:\\[^:\n"]+\.docx)/i);
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

  if (!filePath) {
    console.log(
      "[Interception] Não foi possível identificar o caminho do arquivo para salvar."
    );
    return typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
  }

  console.log(`[Interception] Detectado arquivo criado: ${filePath}`);

  try {
    const fs = require("fs");
    const path = require("path");

    const waitForFile = async (
      filePath: string,
      timeout = 5000,
      interval = 500
    ) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 0) {
            return true;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
      return false;
    };

    console.log(`[Interception] Aguardando arquivo: ${filePath}`);
    const exists = await waitForFile(filePath);

    if (!exists) {
      console.error(
        `[Interception] Arquivo não encontrado após espera: ${filePath}`
      );
      return typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
    }

    const { sharePointService } = require("../services/sharePointService");
    const uploadRes = await sharePointService.uploadFile(filePath);
    console.log("[Interception] Upload para SharePoint concluído.");

    const link = await sharePointService.createSharingLink(uploadRes.id);
    console.log(`[Interception] Link de edição gerado: ${link}`);

    const { documentService } = require("../services/documentService");
    await documentService.saveSharePointDocument(
      path.basename(filePath),
      uploadRes.id,
      link
    );
    console.log("[Interception] Metadados salvos no banco.");

    return `Arquivo salvo e enviado para o SharePoint.\nLink de Edição: ${link}\n\n${JSON.stringify(toolResult)}`;
  } catch (dbError) {
    console.error("[Interception] Erro ao salvar no SharePoint:", dbError);
    return typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
  }
}
