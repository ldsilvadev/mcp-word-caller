import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { authService } from "./authService";
import fs from "fs/promises";
import path from "path";

// ⚠️ CONFIGURAÇÃO NOVA ⚠️
// Como o Bot não é você, precisamos dizer pra ele: "Salve no OneDrive deste cara aqui".
// Coloque seu email corporativo/pessoal que tem o OneDrive.
const TARGET_USER_ID = process.env.TARGET_USER_ID || "seu.email@dominio.com"; 

export class SharePointService {
  private async getClient(): Promise<Client> {
    const accessToken = await authService.getAccessToken();
    return Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  }

  // Helper para não repetir a URL base toda hora
  // Antes era: /me/drive
  // Agora é: /users/email/drive  OU  /sites/site-id/drive
  private getDrivePath(): string {
     return `/users/${TARGET_USER_ID}/drive`;
  }

  /**
   * Upload com lógica Híbrida (Simples vs Session)
   */
  async uploadFile(localPath: string, folderName: string = "MCP-Output"): Promise<any> {
    const client = await this.getClient();
    const filename = path.basename(localPath);
    const fileContent = await fs.readFile(localPath);
    const stats = await fs.stat(localPath);
    const fileSize = stats.size;

    console.log(`[SharePoint] Uploading ${filename} (Target: ${TARGET_USER_ID})...`);

    if (fileSize < 4 * 1024 * 1024) {
        return this.uploadSmallFileWithRetry(client, folderName, filename, fileContent);
    }
    // ... lógica para arquivo grande se precisar ...
    return null; 
  }

  private async uploadSmallFileWithRetry(client: Client, folderName: string, filename: string, content: Buffer, maxRetries: number = 3): Promise<any> {
      // ⚠️ MUDANÇA AQUI: Usamos getDrivePath() em vez de /me/drive
      const endpoint = `${this.getDrivePath()}/root:/${folderName}/${filename}:/content`;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // O Bot tem permissão de "System", então ele tem mais chance de
            // forçar a atualização (Nova Versão) do que o usuário delegado.
            const response = await client.api(endpoint)
                .header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                .put(content);
            
            console.log(`[SharePoint] Upload success. ID: ${response.id}`);
            return response;

        } catch (error: any) {
            const isLocked = error.message?.includes("locked") || 
                             error.code === "notAllowed" ||
                             error.statusCode === 423;
            
            if (isLocked && attempt < maxRetries) {
              console.log(`[SharePoint] File is locked. Waiting 3 seconds before retry ${attempt + 1}/${maxRetries}...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
              continue;
            }
            
            console.error(`[SharePoint] Error uploading (attempt ${attempt}):`, error.message);
            throw error;
        }
      }
  }

  /**
   * Creates a sharing link.
   */
  async createSharingLink(itemId: string): Promise<string> {
    const client = await this.getClient();
    
    try {
      // ⚠️ MUDANÇA AQUI
      const endpoint = `${this.getDrivePath()}/items/${itemId}/createLink`;
      
      const response = await client.api(endpoint).post({
        type: "edit", 
        scope: "organization", 
      });
      
      return response.link.webUrl;
    } catch (error) {
      console.warn("[SharePoint] Could not create sharing link. Returning default webUrl.");
      // ⚠️ MUDANÇA AQUI
      const item = await client.api(`${this.getDrivePath()}/items/${itemId}`).get();
      return item.webUrl;
    }
  }

  /**
   * Downloads a file.
   */
  async downloadFile(itemId: string): Promise<Buffer> {
    const accessToken = await authService.getAccessToken();
    
    // ⚠️ MUDANÇA AQUI: URL absoluta precisa mudar também
    // De: https://graph.microsoft.com/v1.0/me/drive...
    // Para: https://graph.microsoft.com/v1.0/users/{email}/drive...
    const downloadUrl = `https://graph.microsoft.com/v1.0/users/${TARGET_USER_ID}/drive/items/${itemId}/content`;
    
    try {
      const fetchResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!fetchResponse.ok) throw new Error(`Download failed: ${fetchResponse.statusText}`);
      
      const arrayBuffer = await fetchResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
      
    } catch (error) {
      console.error(`[SharePoint] Error downloading item ${itemId}:`, error);
      throw error;
    }
  }
  
  /**
   * Search for file ID.
   */
  async getFileIdByName(filename: string, folderName: string = "MCP-Output"): Promise<string | null> {
    const client = await this.getClient();
    try {
        // ⚠️ MUDANÇA AQUI
        const endpoint = `${this.getDrivePath()}/root:/${folderName}/${filename}`;
        const response = await client.api(endpoint).get();
        return response.id;
    } catch (e) {
        return null;
    }
  }
}

export const sharePointService = new SharePointService();