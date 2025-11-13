export interface ToolResult {
  status: 'sucesso' | 'erro';
  caminho?: string;
  detalhe?: string;
}