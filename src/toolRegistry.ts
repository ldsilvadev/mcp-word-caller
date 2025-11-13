import { SchemaType, type Tool } from "@google/generative-ai";
// Importe as *duas* funções agora

import {
  ExcelReadResult,
  ExcelResult,
  PlanilhaArgs,
  SummaryOperation,
} from "../types";
import {
  appendMultipleRowsToExcel,
  appendRowToExcel,
  createExcelFile,
  readExcelFile,
  updateCellInExcel,
} from "./tools/excelTool";
import { createPolicySmart, PolicyData, ToolResult } from "./tools/wordTool";

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

const appendRowTool: Tool = {
  functionDeclarations: [
    {
      name: "append_row_to_excel",
      description:
        "Adiciona uma única linha de dados no final de um arquivo Excel existente. Os dados devem ser um objeto com os cabeçalhos como chaves.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          nomeArquivo: {
            type: SchemaType.STRING,
            description:
              "O nome do arquivo a ser modificado (ex: 'pedidos.xlsx')",
          },
          dadosObjeto: {
            type: SchemaType.OBJECT,
            description:
              "Um objeto com os dados da nova linha. Ex: {'Produto': 'Mouse', 'Valor': 150}",
            properties: {},
          },
        },
        required: ["nomeArquivo", "dadosObjeto"],
      },
    },
  ],
};

const appendMultipleRowsTool: Tool = {
  functionDeclarations: [
    {
      name: "append_multiple_rows_to_excel",
      description:
        "Adiciona MÚLTIPLAS linhas de dados (um array de objetos) no final de um arquivo Excel existente. Muito mais eficiente para adicionar mais de uma linha.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          nomeArquivo: {
            type: SchemaType.STRING,
            description:
              "O nome do arquivo a ser modificado (ex: 'pedidos.xlsx')",
          },
          dadosObjetos: {
            type: SchemaType.ARRAY,
            description:
              "Um ARRAY de objetos com os dados das novas linhas. Ex: [{'Produto': 'Mouse'}, {'Produto': 'Teclado'}]",
            items: {
              type: SchemaType.OBJECT,
              properties: {},
            },
          },
        },
        required: ["nomeArquivo", "dadosObjetos"],
      },
    },
  ],
};

const updateCellTool: Tool = {
  functionDeclarations: [
    {
      name: "update_cell_in_excel",
      description:
        "Atualiza o valor de uma única célula em um arquivo Excel existente, usando a coordenada da célula (ex: 'B5').",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          nomeArquivo: {
            type: SchemaType.STRING,
            description:
              "O nome do arquivo a ser modificado (ex: 'pedidos.xlsx')",
          },
          celula: {
            type: SchemaType.STRING,
            description:
              "A coordenada da célula a ser atualizada (ex: 'B5', 'C10')",
          },
          valor: {
            type: SchemaType.STRING,
            description:
              "O novo valor para a célula (pode ser texto ou número).",
          },
        },
        required: ["nomeArquivo", "celula", "valor"],
      },
    },
  ],
};

const createWordPolicyTool: Tool = {
  functionDeclarations: [
    {
      name: "create_policy_document",
      description:
        "Cria um novo documento de Política ou Procedimento. A IA é responsável por gerar/inferir TODO o conteúdo (metadados e seções) com base no pedido do usuário.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          // O ÚNICO ARGUMENTO É O OBJETO 'DADOS'
          dados: {
            type: SchemaType.OBJECT,
            description:
              "Objeto com todos os dados da política, inferidos ou gerados pela IA.",
            properties: {
              titulo_documento: {
                type: SchemaType.STRING,
                description: "O título (ex: 'Política de Férias')",
              },
              codigo_documento: {
                type: SchemaType.STRING,
                description: "O código (ex: 'FIERGS-RH-PR-00012')",
              },
              departamento: {
                type: SchemaType.STRING,
                description: "O departamento (ex: 'RH', 'TI')",
              },
              tipo_documento: {
                type: SchemaType.STRING,
                description: "Ex: 'Procedimento', 'Política'",
              },
              data_publicacao: {
                type: SchemaType.STRING,
                description: "A data de publicação (ex: 13/11/2025)",
              },
              data_vigencia: {
                type: SchemaType.STRING,
                description: "A data de vigência (ex: 13/11/2027)",
              },
              secoes: {
                type: SchemaType.ARRAY,
                description:
                  "Array com o conteúdo (títulos e textos) gerado pela IA.",
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    titulo: { type: SchemaType.STRING },
                    texto: { type: SchemaType.STRING },
                  },
                  required: ["titulo", "texto"],
                },
              },
            },
            required: [
              "titulo_documento",
              "codigo_documento",
              "departamento",
              "tipo_documento",
              "data_publicacao",
              "data_vigencia",
              "secoes",
            ],
          },
        },
        required: ["dados"], // <-- OBRIGA A IA A ENVIAR O OBJETO INTEIRO
      },
    },
  ],
};

export const allToolDefinitions: Tool[] = [
  createExcelTool,
  readExcelTool,
  appendRowTool,
  updateCellTool,
  appendMultipleRowsTool,
  createWordPolicyTool,
];

interface ReadArgs {
  nomeArquivo: string;
}
interface AppendArgs {
  nomeArquivo: string;
  dadosObjeto: Record<string, any>;
}
interface UpdateCellArgs {
  nomeArquivo: string;
  celula: string;
  valor: string | number | null;
}
interface AppendMultipleArgs {
  nomeArquivo: string;
  dadosObjetos: Record<string, any>[];
}

interface PolicyArgs {
  dados: PolicyData;
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
  [
    "append_row_to_excel",
    (args: AppendArgs): Promise<ExcelResult> =>
      appendRowToExcel(args.nomeArquivo, args.dadosObjeto),
  ],
  [
    "append_multiple_rows_to_excel",
    (args: AppendMultipleArgs): Promise<ExcelResult> =>
      appendMultipleRowsToExcel(args.nomeArquivo, args.dadosObjetos),
  ],
  [
    "update_cell_in_excel",
    (args: UpdateCellArgs): Promise<ExcelResult> =>
      updateCellInExcel(args.nomeArquivo, args.celula, args.valor),
  ],
  [
    "create_policy_document",
    (args: PolicyArgs): Promise<ToolResult> => createPolicySmart(args.dados), // <-- Chama a nova função
  ],
]);
