import * as ExcelJS from "exceljs";
import * as path from "path";

export interface ExcelResult {
  status: "sucesso" | "erro";
  caminho?: string;
  detalhe?: string;
}

export interface ExcelReadResult {
  status: "sucesso" | "erro";
  data?: Record<string, any[]>;
  detalhe?: string;
}

export interface SummaryOperation {
  coluna: string;
  operacao: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN";
  label: string;
}

export interface PlanilhaArgs {
  nome_arquivo: string;
  cabecalhos: string[];
  dados: Record<string, any>[];
}

export async function createExcelFile(
  nomeArquivo: string,
  cabecalhos: string[],
  dados: Record<string, any>[],
  summaryOps?: SummaryOperation[]
): Promise<ExcelResult> {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Dados");

    const columns = cabecalhos.map((header) => ({
      header: header,
      key: header.toLowerCase().replace(/[^a-z0-9]/gi, "_"),
      width: 25,
    }));
    worksheet.columns = columns;

    const headerRow = worksheet.getRow(1);
    headerRow.font = { color: { argb: "FFFFFFFF" }, bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF00008B" },
    };

    const dadosMapeados = dados.map((item) => {
      const newItem: Record<string, any> = {};
      for (const key in item) {
        const safeKey = key.toLowerCase().replace(/[^a-z0-9]/gi, "_");
        newItem[safeKey] = item[key];
      }
      return newItem;
    });
    worksheet.addRows(dadosMapeados);

    if (summaryOps && summaryOps.length > 0) {
      const dataRowCount = dados.length;
      if (dataRowCount > 0) {
        worksheet.addRow([]);

        const summaryRow = worksheet.addRow([]);

        summaryOps.forEach((op) => {
          const col = columns.find((c) => c.header === op.coluna);
          if (col) {
            const colLetter = worksheet.getColumn(col.key).letter;
            worksheet.getCell(`A${summaryRow.number}`).value = op.label;
            worksheet.getCell(`A${summaryRow.number}`).font = { bold: true };

            const formulaCell = worksheet.getCell(
              `${colLetter}${summaryRow.number}`
            );
            formulaCell.value = {
              formula: `${op.operacao}(${colLetter}2:${colLetter}${
                dataRowCount + 1
              })`,
            };
            formulaCell.font = { bold: true };
          }
        });
      }
    }

    const caminhoCompleto = path.join(process.cwd(), nomeArquivo);
    await workbook.xlsx.writeFile(caminhoCompleto);

    console.log(`[excelTool] Arquivo salvo: ${caminhoCompleto}`);
    return { status: "sucesso", caminho: caminhoCompleto };
  } catch (error) {
    console.error("[excelTool] Erro:", error);
    return { status: "erro", detalhe: (error as Error).message };
  }
}

export async function readExcelFile(
  nomeArquivo: string
): Promise<ExcelReadResult> {
  try {
    const workbook = new ExcelJS.Workbook();
    const caminhoCompleto = path.join(process.cwd(), nomeArquivo);
    await workbook.xlsx.readFile(caminhoCompleto);

    const sheetsData: Record<string, any[]> = {};

    workbook.eachSheet((sheet, id) => {
      // 1. Pega a primeira linha (cabeçalhos)
      // Usamos .slice(1) para remover o primeiro item 'null' que o exceljs retorna
      const headerRow = sheet.getRow(1).values as string[];
      const headers = headerRow.slice(1);

      const sheetData: any[] = [];

      // 2. Itera sobre as linhas, começando da linha 2
      sheet.eachRow((row, rowNumber) => {
        // Pula a linha de cabeçalho
        if (rowNumber === 1) return;

        const rowObject: Record<string, any> = {};
        const rowValues = (row.values as any[]).slice(1); // Pega os valores da linha

        // 3. Monta o objeto (ex: { 'Região': 'Região Sul', 'Status': 'Pendente' })
        headers.forEach((header, index) => {
          rowObject[header] = rowValues[index];
        });

        sheetData.push(rowObject);
      });

      sheetsData[sheet.name] = sheetData;
    });

    console.log(`[excelTool] Arquivo lido e formatado: ${nomeArquivo}`);
    return { status: "sucesso", data: sheetsData };
  } catch (error) {
    console.error("[excelTool] Erro ao ler:", error);
    return { status: "erro", detalhe: (error as Error).message };
  }
}
