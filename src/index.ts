import { handleUserPrompt } from "./chatApi";

const prompt = `Crie a Política de Home Office, código RH-PR-00013, tipo Política. A data de publicação é 13/11/2025 e a vigência é 13/11/2027. Por favor, gere o conteúdo padrão para este tipo de documento.`;

async function main() {
  console.log("--- Executando Teste ---");
  console.log("Prompt:", prompt);

  try {
    const respostaFinal = await handleUserPrompt(prompt);

    console.log("\n------------------------------");
    console.log("✅ Resposta Final da IA:");
    console.log(respostaFinal);
    console.log("------------------------------");
  } catch (error) {
    console.error("\n--- ERRO NA EXECUÇÃO ---", error);
  }
}

main();
