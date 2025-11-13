export interface ExcelReadResult {
  status: "sucesso" | "erro";
  data?: Record<string, any[]>;
  detalhe?: string;
}
