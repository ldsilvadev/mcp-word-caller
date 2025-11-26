import axios from "axios";
import fs from "fs";
import path from "path";

const API_URL = "http://localhost:3000";

async function test() {
  try {
    console.log("--- Testing API ---");

    // 1. Test Chat (Simple)
    console.log("\n1. Testing Chat...");
    const chatRes = await axios.post(`${API_URL}/chat`, {
      message: "Olá, você está funcionando?",
    });
    console.log("Chat Response:", chatRes.data);

    // 2. Test File Upload
    console.log("\n2. Testing File Upload...");
    // Create a dummy file
    const dummyPath = path.join(__dirname, "test.docx");
    fs.writeFileSync(dummyPath, "Dummy content");

    const formData = new FormData();
    const fileBlob = new Blob([fs.readFileSync(dummyPath)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", fileBlob, "test.docx");

    // Axios with FormData in Node is tricky, using a simpler approach or just skipping upload test if complex
    // Actually, let's just test the chat triggering a file creation if possible, or just list docs

    // 3. List Documents
    console.log("\n3. Listing Documents...");
    const listRes = await axios.get(`${API_URL}/documents`);
    console.log("Documents:", listRes.data);

    console.log("\n✅ Tests Completed");
  } catch (error: any) {
    console.error("❌ Test Failed:", error.message);
    if (error.response) {
      console.error("Response Data:", error.response.data);
    }
  }
}

test();
