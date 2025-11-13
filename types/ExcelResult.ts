export interface ExcelResult {
  status: "sucesso" | "erro";
  caminho?: string;
  detalhe?: string;
}
