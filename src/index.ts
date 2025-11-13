import { handleUserPrompt } from "./chatApi";

// O prompt de teste
const prompt = `
 Leia o pedidos.xlsx e me diga quantos pedidos com status 'Pendente' também são da 'Região Sul, e também liste esses pedidos. Depois, crie um novo arquivo Excel chamado resumo_pedidos.xlsx que contenha esses pedidos, com os mesmos cabeçalhos, e adicione uma linha de resumo no final com o total de pedidos listados.

`;

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
