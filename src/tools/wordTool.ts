// Em src/wordTool.ts
import PizZip = require("pizzip");
import Docxtemplater from "docxtemplater";
import * as fs from "fs";
import * as path from "path";

// --- Interfaces (para exportar) ---
export interface ToolResult {
  status: "sucesso" | "erro";
  caminho?: string;
  detalhe?: string;
}

export interface PolicySection {
  titulo: string;
  texto: string;
}

// Interface para os dados completos (o que a IA vai gerar)
export interface PolicyData {
  titulo_documento: string;
  codigo_documento: string;
  departamento: string;
  tipo_documento: string;
  data_publicacao: string;
  data_vigencia: string;
  secoes: PolicySection[];
  // Adicione 'revisao' aqui se você usar
}

// --- Função Auxiliar (Slugify) ---
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]+/g, "")
    .replace(/__+/g, "_");
}

/**
 * Ferramenta "Inteligente": Cria um documento de política.
 * O template é fixo e o nome do arquivo é gerado automaticamente.
 * A IA é responsável por fornecer TODOS os dados.
 */
export async function createPolicySmart(
  dados: PolicyData // <-- O único argumento
): Promise<ToolResult> {
  try {
    // 1. Lógica Embutida: Define o template fixo
    const templateNome = "template_base_politica.docx";

    // 2. Lógica Embutida: Gera o nome do arquivo
    const novoNome = `${slugify(dados.titulo_documento)}.docx`;

    // 3. Carrega o template
    const templatePath = path.join(process.cwd(), templateNome);
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 4. Popula o template com os dados gerados pela IA
    doc.render(dados); // 'dados' já tem tudo (rodapé e secoes)

    // 5. Gera e salva o novo arquivo
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const novoCaminho = path.join(process.cwd(), novoNome);
    fs.writeFileSync(novoCaminho, buf);

    console.log(`[wordTool] Documento criado: ${novoCaminho}`);
    return { status: "sucesso", caminho: novoCaminho };
  } catch (error: any) {
    console.error("[wordTool] Erro:", error);
    return { status: "erro", detalhe: error.message };
  }
}
