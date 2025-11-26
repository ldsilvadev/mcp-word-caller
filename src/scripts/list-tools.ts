import { mcpService } from "../services/mcpService";

async function main() {
  try {
    console.log("Connecting to MCP...");
    const tools = (await mcpService.getToolsAsGeminiFormat()) as any;
    console.log("--- Available Tools ---");
    if (tools && tools.length > 0 && tools[0].functionDeclarations) {
      tools[0].functionDeclarations.forEach((t: any) => {
        console.log(`- ${t.name}: ${t.description}`);
      });
    } else {
      console.log("No tools found or unexpected format.");
      console.log(JSON.stringify(tools, null, 2));
    }
  } catch (error) {
    console.error("Error listing tools:", error);
  }
}

main();
