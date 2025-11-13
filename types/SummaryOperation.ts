export interface SummaryOperation {
  coluna: string;
  operacao: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN";
  label: string;
}
