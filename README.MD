# MCP Gemini Word

Integração entre Google Gemini AI e Model Context Protocol (MCP) para manipulação inteligente de documentos Word (.docx).

## 📋 Sobre o Projeto

Este projeto permite que o Google Gemini AI manipule documentos Word através do Model Context Protocol (MCP), possibilitando:

- ✍️ Criação automática de documentos Word a partir de templates
- 📝 Análise e modificação de documentos existentes
- 🤖 Geração de conteúdo estruturado (seções, tabelas, formatação)
- 🔄 Integração via Function Calling do Gemini com ferramentas Python

## 🚀 Tecnologias

- **TypeScript** - Linguagem principal
- **Google Gemini AI** (gemini-2.5-pro) - Modelo de IA
- **Model Context Protocol (MCP)** - Comunicação com ferramentas Python
- **docxtemplater** - Manipulação de templates Word
- **mammoth** - Leitura de documentos Word
- **Zod** - Validação de schemas

## 📦 Instalação

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
```

Configure sua chave da API do Google Gemini no arquivo `.env`:

```env
GOOGLE_API_KEY=sua_chave_aqui
```

## ⚙️ Configuração de Caminhos

**IMPORTANTE:** O projeto utiliza caminhos absolutos para templates e arquivos de saída. Você deve configurar esses caminhos em dois locais:

### 1. System Prompt (`src/config/systemPrompts.ts`)

No arquivo `systemPrompts.ts`, localize a seção `### PATH HANDLING` e atualize os exemplos de caminhos conforme sua estrutura:

```typescript
### PATH HANDLING
- **Template Path**: O backend fornece o caminho absoluto para o template
  Exemplo: "C:\\Users\\seu-usuario\\Documents\\projeto\\templates\\template.docx"

- **Output Path**: O backend fornece o caminho absoluto para salvar documentos
  Exemplo: "C:\\Users\\seu-usuario\\Documents\\projeto\\output\\"
```

### 2. Prompts do Usuário (`src/index.ts`)

Ao fazer requisições, sempre forneça caminhos absolutos completos:

```typescript
// ✅ CORRETO - Caminho absoluto
const promptDoUsuario = `
  Analise o documento em C:\\Users\\seu-usuario\\Documents\\projeto\\output\\documento.docx
  e modifique o título "Objetivo" para "Objetivo da Política".
`;

// ❌ ERRADO - Caminho relativo
const promptDoUsuario = `
  Analise o documento em ./output/documento.docx
`;
```

### Estrutura de Pastas Recomendada

```
seu-projeto/
├── templates/
│   └── template.docx          # Template base (caminho absoluto necessário)
├── output/                    # Documentos gerados (caminho absoluto necessário)
└── src/
    └── ...
```

**Dica:** Use `path.resolve()` ou `__dirname` para construir caminhos absolutos dinamicamente se necessário.

## 🎯 Como Usar

### Executar o projeto

```bash
npx tsx src/index.ts
```

### Exemplos de Uso

**1. Criar documento a partir de template:**

```typescript
const promptDoUsuario = `
  Crie uma política de Home Office.
  
  Preencha com estas informações:
  - Código: FIERGS-HO-321
  - Assunto: Política de Home Office
  - Departamento: RH
  - Revisão: 1
  - Data de publicação: 25/11/2024
  - Data de vigência: 25/11/2026
  
  Diretrizes:
  1. Crie no mínimo 8 seções textuais bem elaboradas.
  2. Crie uma tabela "tabela_dinamica" com colunas: Cargo, Limite Horas, Home Office.
`;
```

**2. Modificar documento existente:**

```typescript
const promptDoUsuario = `
  Analise o documento em C:\\caminho\\documento.docx
  e modifique o título "Objetivo" para "Objetivo da Política".
`;
```

## 🏗️ Estrutura do Projeto

```
mcp-gemini-word/
├── src/
│   ├── api/
│   │   └── chatApi.ts          # Integração com Gemini AI
│   ├── config/
│   │   └── systemPrompts.ts    # Instruções do sistema
│   ├── registry/
│   │   └── toolRegistry.ts     # Registro de ferramentas MCP
│   ├── services/
│   │   └── mcpService.ts       # Comunicação com MCP Python
│   └── index.ts                # Ponto de entrada
├── templates/
│   └── template.docx           # Template base para documentos
├── output/                     # Documentos gerados
└── package.json
```

## 🔧 Funcionamento

1. **Usuário envia prompt** → Solicitação em linguagem natural
2. **Gemini analisa** → Identifica quais ferramentas usar
3. **Function Calling** → Gemini chama ferramentas MCP Python
4. **MCP executa** → Manipula documentos Word
5. **Resposta final** → Gemini retorna resultado ao usuário

## 🛠️ Ferramentas Disponíveis

O projeto se conecta dinamicamente às ferramentas Python via MCP, incluindo:

- Criação de documentos Word
- Preenchimento de templates
- Análise de conteúdo
- Modificação de estrutura
- Geração de tabelas e formatação

## 📝 Requisitos

- Node.js 18+
- TypeScript 5+
- Servidor MCP Python configurado
- Chave de API do Google Gemini

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## 📄 Licença

This project is licensed under the MIT License - see the LICENSE file for details.
