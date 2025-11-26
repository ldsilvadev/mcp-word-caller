import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

export class StorageService {
  private supabase: SupabaseClient;
  private bucket = "documents";

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_KEY in environment variables."
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Uploads a file to Supabase Storage.
   * @param filePath Local path to the file
   * @param destinationPath Optional destination path in the bucket (defaults to filename)
   * @returns The storage path (key) in the bucket
   */
  async uploadFile(
    filePath: string,
    destinationPath?: string
  ): Promise<string> {
    try {
      const filename = path.basename(filePath);
      const targetPath = destinationPath || filename;
      const fileContent = await fs.readFile(filePath);

      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .upload(targetPath, fileContent, {
          upsert: true,
          contentType: this.getMimeType(filename),
        });

      if (error) {
        throw error;
      }

      console.log(`[Storage] Uploaded ${filename} to ${data.path}`);
      return data.path;
    } catch (error) {
      console.error(`[Storage] Error uploading ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Downloads a file from Supabase Storage.
   * @param storagePath The path (key) in the bucket
   * @returns The file content as a Buffer
   */
  async downloadFile(storagePath: string): Promise<Buffer> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .download(storagePath);

      if (error) {
        throw error;
      }

      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`[Storage] Error downloading ${storagePath}:`, error);
      throw error;
    }
  }

  /**
   * Gets a public URL for the file (if bucket is public).
   */
  getPublicUrl(storagePath: string): string {
    const { data } = this.supabase.storage
      .from(this.bucket)
      .getPublicUrl(storagePath);
    return data.publicUrl;
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".pdf") return "application/pdf";
    if (ext === ".docx")
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/octet-stream";
  }
}

export const storageService = new StorageService();
