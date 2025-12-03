import { PrismaClient } from "@prisma/client";
import { mcpService } from "./mcpService";

const prisma = new PrismaClient();

export const draftService = {
  async createDraft(title: string, content: any) {
    try {
      const draft = await prisma.draft.create({
        data: {
          title,
          content,
          status: "draft",
        },
      });
      console.log(`[Draft] Created draft ${draft.id}: ${draft.title}`);
      return draft;
    } catch (error) {
      console.error("[Draft] Error creating draft:", error);
      throw error;
    }
  },

  async getDraft(id: number) {
    return prisma.draft.findUnique({ where: { id } });
  },

  async updateDraft(id: number, content: any) {
    try {
      const draft = await prisma.draft.update({
        where: { id },
        data: {
          content,
        },
      });
      console.log(`[Draft] Updated draft ${draft.id}`);
      return draft;
    } catch (error) {
      console.error("[Draft] Error updating draft:", error);
      throw error;
    }
  },

  async generateDocumentFromDraft(id: number) {
    try {
      const draft = await prisma.draft.findUnique({ where: { id } });
      if (!draft) throw new Error("Draft not found");

      console.log(`[Draft] Generating document from draft ${id}...`);

      // The content is already in the format expected by fill_document_simple
      // We just need to ensure it has the filename if not present, or generate one
      const content = draft.content as any;

      // Ensure filename ends with .docx
      let filename =
        content.filename || `${draft.title.replace(/[^a-z0-9]/gi, "_")}.docx`;
      if (!filename.endsWith(".docx")) filename += ".docx";

      // Add filename to content if missing, as fill_document_simple might need it
      // actually fill_document_simple usually takes 'data_json' and 'filename' as separate args
      // or sometimes combined depending on the wrapper.
      // Let's check how mcpService calls it.
      // Looking at chatApi.ts, it passes 'args' directly.
      // So we should construct the args expected by 'fill_document_simple'.

      const args = {
        filename: filename,
        data_json: JSON.stringify(content), // Ensure it's stringified as per system prompt rules
      };

      // Call the MCP tool
      // We need to handle the result similarly to chatApi.ts (interception is done there, but here we are calling directly)
      // Wait, if we call mcpService.callTool, it just returns the text result.
      // The interception logic in chatApi.ts is what handles the upload to SharePoint.
      // We should probably reuse that logic or move it to a shared place.
      // For now, let's just call the tool and let the caller handle the result/interception if possible,
      // OR we implement the interception here too.
      // Since this is a service method, it might be called by an API endpoint.

      const result = await mcpService.callTool("fill_document_simple", args);

      // Update draft status
      await prisma.draft.update({
        where: { id },
        data: { status: "generated" },
      });

      return { result, filename };
    } catch (error) {
      console.error("[Draft] Error generating document:", error);
      throw error;
    }
  },
};
