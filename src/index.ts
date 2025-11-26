import { handleUserPrompt } from "./api/chatApi";

async function main() {
  // O Prompt agora é só o pedido, sem as regras técnicas (que já estão no chatApi)
  // const promptDoUsuario = `
  //   Analise o documento que esta em C:\\Users\\dasilva.lucas\\Documents\\MCP\\call-word\\output\\Política_Home_Office_FIERGS-HO-321.docx
  //   e modifique o titulo "Objetivo" para "Objetivo da Politica".
  // `;

const promptDoUsuario = `
  Crie uma política de Abastecimento de Frota.

  Preencha com estas informações:
  - Código: FIERGS-AB-321
  - Assunto: Política de Abastecimento de Frota
  - Departamento: GESAD
  - Revisão: 2
  - Data de publicação: 25/11/2024
  - Data de vigência: 25/11/2026

  Diretrizes:
  1. Crie no mínimo 10 seções textuais bem elaboradas utilizando seu conhecimento.
`;

  console.log("--- Iniciando Teste de Integração MCP ---");

  try {
    const resposta = await handleUserPrompt(promptDoUsuario);
    console.log("\n✅ FINALIZADO COM SUCESSO:");
    console.log(resposta);
  } catch (error) {
    console.error("\n❌ ERRO FATAL:", error);
  }
}

main();
