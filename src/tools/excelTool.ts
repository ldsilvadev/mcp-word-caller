import * as ExcelJS from "exceljs";
import * as path from "path";
import { ExcelReadResult, ExcelResult, SummaryOperation } from "../../types";

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
      const headerRow = sheet.getRow(1).values as string[];
      const headers = headerRow.slice(1);

      const sheetData: any[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const rowObject: Record<string, any> = {};
        const rowValues = (row.values as any[]).slice(1);

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

export async function appendRowToExcel(
  nomeArquivo: string,
  dadosObjeto: Record<string, any>
): Promise<ExcelResult> {
  try {
    const workbook = new ExcelJS.Workbook();
    const caminhoCompleto = path.join(process.cwd(), nomeArquivo);
    await workbook.xlsx.readFile(caminhoCompleto);

    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      throw new Error(`Planilha não encontrada no arquivo: ${nomeArquivo}`);
    }

    const headerRow = worksheet.getRow(1).values as string[];
    const headers = headerRow.slice(1);

    const safeKeys = headers.map((h) =>
      h.toLowerCase().replace(/[^a-z0-9]/gi, "_")
    );

    headers.forEach((header, index) => {
      const col = worksheet.getColumn(index + 1);
      col.key =
        safeKeys[index] || header.toLowerCase().replace(/[^a-z0-9]/gi, "_");
    });

    const dadosMapeados: Record<string, any> = {};
    for (const key in dadosObjeto) {
      const safeKey = key.toLowerCase().replace(/[^a-z0-9]/gi, "_");
      dadosMapeados[safeKey] = dadosObjeto[key];
    }

    worksheet.addRow(dadosMapeados);

    await workbook.xlsx.writeFile(caminhoCompleto);

    console.log(`[excelTool] Nova linha adicionada em: ${nomeArquivo}`);
    return { status: "sucesso", caminho: caminhoCompleto };
  } catch (error) {
    console.error("[excelTool] Erro ao adicionar linha:", error);
    return { status: "erro", detalhe: (error as Error).message };
  }
}

export async function appendMultipleRowsToExcel(
  nomeArquivo: string,
  dadosObjetos: Record<string, any>[]
): Promise<ExcelResult> {
  try {
    const workbook = new ExcelJS.Workbook();
    const caminhoCompleto = path.join(process.cwd(), nomeArquivo);
    await workbook.xlsx.readFile(caminhoCompleto);
    
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      throw new Error(`Planilha não encontrada no arquivo: ${nomeArquivo}`);
    }

    const headerRow = worksheet.getRow(1).values as string[];
    const headers = headerRow.slice(1);
    const safeKeys = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/gi, '_'));
    headers.forEach((header, index) => {
      const col = worksheet.getColumn(index + 1);
      col.key = safeKeys[index] || header.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    });

    const dadosMapeados = dadosObjetos.map(item => {
      const newItem: Record<string, any> = {};
      for (const key in item) {
        const safeKey = key.toLowerCase().replace(/[^a-z0-9]/gi, '_');
        newItem[safeKey] = item[key];
      }
      return newItem;
    });
  
    dadosMapeados.forEach(item => {
      worksheet.addRow(item);
    });

    await workbook.xlsx.writeFile(caminhoCompleto);

    console.log(`[excelTool] ${dadosObjetos.length} novas linhas adicionadas em: ${nomeArquivo}`);
    return { status: 'sucesso', caminho: caminhoCompleto };
  } catch (error) {
    console.error('[excelTool] Erro ao adicionar múltiplas linhas:', error);
    return { status: 'erro', detalhe: (error as Error).message };
  }
}

export async function updateCellInExcel(
  nomeArquivo: string,
  celula: string,
  valor: string | number | null
): Promise<ExcelResult> {
  try {
    const workbook = new ExcelJS.Workbook();
    const caminhoCompleto = path.join(process.cwd(), nomeArquivo);

    await workbook.xlsx.readFile(caminhoCompleto);

    const worksheet = workbook.getWorksheet(1);

    const cell = worksheet?.getCell(celula);
    if (!cell) {
      throw new Error(`Célula ${celula} não encontrada.`);
    }
    cell.value = valor;

    await workbook.xlsx.writeFile(caminhoCompleto);

    console.log(`[excelTool] Célula ${celula} atualizada em: ${nomeArquivo}`);
    return { status: "sucesso", caminho: caminhoCompleto };
  } catch (error) {
    console.error("[excelTool] Erro ao atualizar célula:", error);
    return { status: "erro", detalhe: (error as Error).message };
  }
}
