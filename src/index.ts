import { handleUserPrompt } from "./api/chatApi";

async function main() {
  // O Prompt agora é só o pedido, sem as regras técnicas (que já estão no chatApi)
  // const promptDoUsuario = `
  //   Analise o documento que esta em C:\\Users\\dasilva.lucas\\Documents\\MCP\\call-word\\output\\Política_Home_Office_FIERGS-HO-321.docx
  //   e modifique o titulo "Objetivo" para "Objetivo da Politica".
  // `;

const promptDoUsuario = `
  Crie uma política sobre Home Office.

  Preencha com estas informações:
  - Código: FIERGS-HO-321
  - Assunto: Home Office
  - Departamento: RH
  - Revisão: 2
  - Data de publicação: 25/11/2024
  - Data de vigência: 25/11/2026

  Diretrizes:
  1. Crie no mínimo 10 seções textuais bem elaboradas utilizando seu conhecimento.

  O que uma política de home office deve conter:
  - Jornada de trabalho: Definição clara dos horários de início, término e intervalos. 
  - Comunicação: Quais canais e ferramentas devem ser usados para manter a equipe conectada e informada. 
  - Segurança da informação: Regras rigorosas para a proteção de dados e informações confidenciais da empresa. 
  - Direitos e deveres: Detalhes sobre os direitos trabalhistas, como o direito à desconexão fora do horário de expediente, e as responsabilidades do funcionário. 
  - Responsabilidades da empresa: Informações sobre o fornecimento de equipamentos (como computadores, softwares e mobiliário ergonômico) e o suporte tecnológico necessário. 
  - Reembolso de despesas: Definição de quem arca com os custos de internet, energia e outros itens essenciais para o trabalho remoto. 
  - Avaliação de desempenho: Diretrizes para o acompanhamento da produtividade e das metas da equipe remota. 
  - Penalidades: Consequências claras para o não cumprimento das normas estabelecidas. 
  - Acordo contratual: A política deve estar formalizada em contrato ou aditivo contratual, especificando se o modelo será integral ou híbrido. 
  - Procedimento para retorno: Caso necessário, deve ser detalhado no contrato o procedimento para o retorno ao trabalho presencial, respeitando o prazo mínimo de 15 dias de transição. 
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
