import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const BUCKET_NAME = "documents";

class SupabaseService {
  private client: SupabaseClient | null = null;

  private getClient(): SupabaseClient {
    if (!this.client) {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_KEY in .env");
      }
      this.client = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return this.client;
  }

  /**
   * Upload de arquivo para o Supabase Storage
   */
  async uploadFile(localPath: string, folder: string = "mcp-output"): Promise<{ path: string; publicUrl: string }> {
    const client = this.getClient();
    const filename = path.basename(localPath);
    const fileBuffer = fs.readFileSync(localPath);
    
    // Sanitizar nome do arquivo para Supabase (remover acentos e caracteres especiais)
    const sanitizedFilename = filename
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Substitui caracteres especiais por _
      .replace(/_+/g, '_'); // Remove múltiplos underscores
    
    // Gerar nome único para evitar conflitos
    const timestamp = Date.now();
    const storagePath = `${folder}/${timestamp}_${sanitizedFilename}`;

    console.log(`[Supabase] Uploading ${filename} to ${storagePath}...`);

    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (error) {
      console.error(`[Supabase] Upload error:`, error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    console.log(`[Supabase] Upload success: ${data.path}`);

    // Gerar URL pública para download
    const { data: urlData } = client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    console.log(`[Supabase] Public URL: ${urlData.publicUrl}`);

    return {
      path: storagePath,
      publicUrl: urlData.publicUrl,
    };
  }

  /**
   * Download de arquivo do Supabase Storage
   */
  async downloadFile(storagePath: string): Promise<Buffer> {
    const client = this.getClient();

    console.log(`[Supabase] Downloading ${storagePath}...`);

    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error) {
      console.error(`[Supabase] Download error:`, error);
      throw new Error(`Failed to download file: ${error.message}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Gerar URL assinada para download (expira em 1 hora)
   */
  async getSignedUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
    const client = this.getClient();

    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error(`[Supabase] Signed URL error:`, error);
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Deletar arquivo do Supabase Storage
   */
  async deleteFile(storagePath: string): Promise<void> {
    const client = this.getClient();

    const { error } = await client.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error(`[Supabase] Delete error:`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }

    console.log(`[Supabase] File deleted: ${storagePath}`);
  }

  /**
   * Listar arquivos em uma pasta
   */
  async listFiles(folder: string = "mcp-output"): Promise<any[]> {
    const client = this.getClient();

    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .list(folder, {
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      console.error(`[Supabase] List error:`, error);
      throw new Error(`Failed to list files: ${error.message}`);
    }

    return data || [];
  }
}

export const supabaseService = new SupabaseService();
