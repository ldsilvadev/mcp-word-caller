import "dotenv/config";
import { storageService } from "../services/storageService";
import fs from "fs/promises";
import path from "path";

async function main() {
  console.log("--- Starting Supabase Storage Test ---");

  const testFile = path.join(__dirname, "test-supabase-file.txt");
  const content = "Hello Supabase! This is a test file.";

  try {
    // 1. Create a dummy file
    await fs.writeFile(testFile, content);
    console.log(`Created local test file: ${testFile}`);

    // 2. Upload to Supabase
    console.log("Uploading to Supabase...");
    const storagePath = await storageService.uploadFile(
      testFile,
      "tests/test-file.txt"
    );
    console.log(`Uploaded to: ${storagePath}`);

    // 3. Download from Supabase
    console.log("Downloading from Supabase...");
    const downloadedBuffer = await storageService.downloadFile(storagePath);
    const downloadedContent = downloadedBuffer.toString();
    console.log(`Downloaded content: "${downloadedContent}"`);

    // 4. Verify content
    if (downloadedContent === content) {
      console.log("✅ SUCCESS: Content matches!");
    } else {
      console.error("❌ FAIL: Content mismatch!");
      console.error(`Expected: "${content}"`);
      console.error(`Received: "${downloadedContent}"`);
    }

    // 5. Get Public URL
    const publicUrl = storageService.getPublicUrl(storagePath);
    console.log(`Public URL: ${publicUrl}`);
  } catch (error) {
    console.error("❌ Error during test:", error);
  } finally {
    // Cleanup
    try {
      await fs.unlink(testFile);
      console.log("Cleaned up local test file.");
      // Note: We don't have a delete method in storageService yet for this test, but that's fine.
    } catch (e) {
      console.warn("Failed to cleanup local file:", e);
    }
  }
}

main();
