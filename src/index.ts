import { handleUserPrompt } from "./api/chatApi";

async function main() {
  // O Prompt agora é só o pedido, sem as regras técnicas (que já estão no chatApi)
  const promptDoUsuario = `
    Analise o documento que esta em C:\\Users\\dasilva.lucas\\Documents\\MCP\\call-word\\output\\Política_Home_Office_FIERGS-HO-321.docx
    e modifique o titulo "Objetivo" para "Objetivo da Politica".
  `;

  // const promptDoUsuario = `
  //   Crie uma política de Home Office.

  //   Preencha com estas informações:
  //   - Código: FIERGS-HO-321
  //   - Assunto: Política de Home Office
  //   - Departamento: RH
  //   - Revisão: 1
  //   - Data de publicação: 25/11/2024
  //   - Data de vigência: 25/11/2026

  //   Diretrizes:
  //   1. Crie no mínimo 8 seções textuais bem elaboradas.
  //   2. Crie uma tabela "tabela_dinamica" com colunas: Cargo, Limite Horas, Home Office.
  //      (Ex: Diretor=Livre, Analista=50L).
  // `;

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
