import { AzureOpenAI } from "openai";
import "dotenv/config";

// Configuração do cliente Azure OpenAI
const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
const apiKey = process.env.AZURE_OPENAI_API_KEY!;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";

export const azureOpenAI = new AzureOpenAI({
  endpoint,
  apiKey,
  apiVersion,
});

export { deploymentName };
