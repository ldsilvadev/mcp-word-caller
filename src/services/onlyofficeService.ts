import crypto from "crypto";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs/promises";

const JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || "mcp_onlyoffice_secret_key_change_in_production";
const ONLYOFFICE_URL = process.env.ONLYOFFICE_URL || "http://localhost:8080";
const BACKEND_URL = process.env.BACKEND_URL || "http://host.docker.internal:3001";

const OUTPUT_DIR = path.join(__dirname, "../../output");

interface OnlyOfficeConfig {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: {
      edit: boolean;
      download: boolean;
      print: boolean;
      review: boolean;
      comment: boolean;
    };
  };
  documentType: string;
  editorConfig: {
    callbackUrl: string;
    lang: string;
    mode: string;
    user: {
      id: string;
      name: string;
    };
    customization: {
      autosave: boolean;
      forcesave: boolean;
      chat: boolean;
      comments: boolean;
      compactHeader: boolean;
      compactToolbar: boolean;
      help: boolean;
      hideRightMenu: boolean;
      toolbarNoTabs: boolean;
    };
  };
  token?: string;
}

export const onlyofficeService = {
  /**
   * Gera uma chave única para o documento
   * A chave muda quando o arquivo é modificado para forçar reload
   */
  async generateDocumentKey(draftId: number): Promise<string> {
    const { draftService } = require("./draftService");
    const filePath = await draftService.getDraftFilePath(draftId);
    
    let mtime = Date.now();
    if (filePath) {
      try {
        const stats = await fs.stat(filePath);
        mtime = stats.mtimeMs;
      } catch {
        // Arquivo não existe ainda
      }
    }
    
    const data = `draft-${draftId}-${mtime}`;
    return crypto.createHash("md5").update(data).digest("hex");
  },

  /**
   * Gera a configuração do editor OnlyOffice para um draft
   */
  async getEditorConfig(
    draftId: number, 
    filename: string, 
    userId: string = "user1", 
    userName: string = "Usuário"
  ): Promise<OnlyOfficeConfig> {
    const documentKey = await this.generateDocumentKey(draftId);
    
    const config: OnlyOfficeConfig = {
      document: {
        fileType: "docx",
        key: documentKey,
        title: filename,
        url: `${BACKEND_URL}/onlyoffice/document/${draftId}`,
        permissions: {
          edit: true,
          download: true,
          print: true,
          review: true,
          comment: true,
        },
      },
      documentType: "word",
      editorConfig: {
        callbackUrl: `${BACKEND_URL}/onlyoffice/callback/${draftId}`,
        lang: "pt-BR",
        mode: "edit",
        user: {
          id: userId,
          name: userName,
        },
        customization: {
          autosave: true,
          forcesave: true,
          chat: false,
          comments: true,
          compactHeader: false,
          compactToolbar: false,
          help: true,
          hideRightMenu: false,
          toolbarNoTabs: false,
        },
      },
    };

    // Assinar com JWT
    config.token = jwt.sign(config, JWT_SECRET);

    return config;
  },

  /**
   * Processa o callback do OnlyOffice quando o documento é salvo
   * SIMPLIFICADO: Salva diretamente no arquivo original do draft
   */
  async processCallback(draftId: number, body: any): Promise<{ error: number }> {
    const { status, url, key } = body;

    console.log(`[OnlyOffice] Callback for draft ${draftId}: status=${status}, key=${key}`);

    // Status codes:
    // 0 - no document with the key identifier
    // 1 - document is being edited
    // 2 - document is ready for saving
    // 3 - document saving error
    // 4 - document is closed with no changes
    // 6 - document is being edited, but the current document state is saved
    // 7 - error has occurred while force saving the document

    if (status === 2 || status === 6) {
      try {
        // Baixar o documento do OnlyOffice
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`[OnlyOffice] Failed to download document: ${response.status}`);
          return { error: 1 };
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Obter o caminho do arquivo original do draft
        const { draftService } = require("./draftService");
        const filePath = await draftService.getDraftFilePath(draftId);
        
        if (!filePath) {
          console.error(`[OnlyOffice] Draft ${draftId} has no file path`);
          return { error: 1 };
        }

        // Salvar diretamente no arquivo original
        await fs.writeFile(filePath, buffer);
        console.log(`[OnlyOffice] ✅ Document saved directly to: ${filePath} (${buffer.length} bytes)`);

        // Marcar o draft como modificado
        await draftService.markAsModified(draftId);

        return { error: 0 };
      } catch (error) {
        console.error(`[OnlyOffice] Error saving document:`, error);
        return { error: 1 };
      }
    }

    return { error: 0 };
  },

  /**
   * Retorna a URL do servidor OnlyOffice
   */
  getServerUrl(): string {
    return ONLYOFFICE_URL;
  },

  /**
   * Verifica se o OnlyOffice está disponível
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${ONLYOFFICE_URL}/healthcheck`, { 
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
