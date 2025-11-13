import { SchemaType, type Tool } from "@google/generative-ai";
// Importe as *duas* funções agora
import {
  createExcelFile,
  readExcelFile,
  type ExcelResult,
  type ExcelReadResult,
  type PlanilhaArgs,
  type SummaryOperation,
} from "./excelTool"; // Atualize as importações de tipos

// --- Definição da Ferramenta 1: CRIAR Excel (Atualizada) ---
const createExcelTool: Tool = {
  functionDeclarations: [
    {
      name: "create_excel_file",
      description:
        "Cria um novo .xlsx formatado, com opção de adicionar uma linha de resumo (Total, Média).",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          nome_arquivo: { type: SchemaType.STRING },
          cabecalhos: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          dados: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.OBJECT, properties: {} },
          },
          // --- NOVO PARÂMETRO (OPCIONAL) ---
          summaryOps: {
            type: SchemaType.ARRAY,
            description:
              "Opcional. Uma lista de operações de resumo a serem adicionadas no final.",
            items: {
              type: SchemaType.OBJECT,
              properties: {
                coluna: {
                  type: SchemaType.STRING,
                  description:
                    "O cabeçalho da coluna a ser calculada (ex: 'Vendas')",
                },
                operacao: {
                  type: SchemaType.STRING,
                  description: "O cálculo (SUM, AVERAGE, COUNT, MAX, ou MIN)",
                },
                label: {
                  type: SchemaType.STRING,
                  description: "O rótulo para a linha (ex: 'Total Geral')",
                },
              },
              required: ["coluna", "operacao", "label"],
            },
          },
        },
        required: ["nome_arquivo", "cabecalhos", "dados"],
      },
    },
  ],
};

const readExcelTool: Tool = {
  functionDeclarations: [
    {
      name: "read_excel_file",
      description:
        "Lê o conteúdo de um arquivo Excel (pelo nome) e retorna os dados como JSON.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          nomeArquivo: {
            type: SchemaType.STRING,
            description: "O nome do arquivo a ser lido (ex: 'vendas.xlsx')",
          },
        },
        required: ["nomeArquivo"],
      },
    },
  ],
};

export const allToolDefinitions: Tool[] = [
  createExcelTool,
  readExcelTool, 
];


interface ReadArgs {
  nomeArquivo: string;
}

export const toolImplementations = new Map<string, Function>([
  [
    "create_excel_file",
    (
      args: PlanilhaArgs & { summaryOps?: SummaryOperation[] }
    ): Promise<ExcelResult> =>
      createExcelFile(
        args.nome_arquivo,
        args.cabecalhos,
        args.dados,
        args.summaryOps
      ), 
  ],
  [
    "read_excel_file",
    (args: ReadArgs): Promise<ExcelReadResult> =>
      readExcelFile(args.nomeArquivo), 
  ],
]);
