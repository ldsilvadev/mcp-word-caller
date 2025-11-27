# Proposta de Arquitetura: Editor de Documentos Real-Time (Fluxo Híbrido)

## 1. Contexto e Objetivo

O objetivo é permitir a edição em tempo real via web, mas mantendo a geração inicial robusta do DOCX que já existe.

**Fluxo Definido:**
`Prompt` -> `Gera DOCX (Backend)` -> `Converte para HTML` -> `Editor Web (Real-Time)` -> `Exporta DOCX Final`

## 2. Detalhamento do Fluxo

### Passo 1: Geração Inicial (DOCX)

- **Responsável:** `office_mcp` (Python).
- **Ação:** A IA continua utilizando as ferramentas atuais (`create_word_document`, `fill_document_template`) para gerar o arquivo `.docx` inicial.
- **Vantagem:** Garante que o documento nasce com o template correto, cabeçalhos, rodapés e estilos corporativos definidos no servidor.

### Passo 2: Conversão DOCX -> HTML

- **Responsável:** Backend Node.js (mcp-word-caller) ou Python.
- **Ação:** Assim que o DOCX é gerado, o sistema o converte para HTML para ser enviado ao frontend.
- **Tecnologia Sugerida:**
  - **Mammoth.js (Node):** Excelente para extrair _conteúdo_ limpo (foca no texto semântico, ignora estilos visuais complexos que quebrariam o editor).
  - **Ou Pandoc (via Python):** Se precisar de uma conversão mais "literal".
- **Resultado:** Um HTML limpo que representa o corpo do documento.

### Passo 3: Edição Real-Time (Frontend)

- **Responsável:** Interface Web (Next.js + Tiptap).
- **Ação:** O HTML é carregado no editor.
  - O usuário vê o conteúdo e pode editar.
  - A IA pode atuar sobre esse HTML (ex: "Reescreva o parágrafo 2").
- **Importante:** Nesta etapa, estamos manipulando o _conteúdo_. Cabeçalhos e rodapés complexos do Word geralmente não são editáveis aqui para não quebrar o layout, ou são mostrados apenas como visualização.

### Passo 4: Exportação Final (HTML -> DOCX)

- **Responsável:** Backend de Exportação.
- **Ação:** Pegar o HTML editado e gerar o DOCX final.
- **Desafio de Fidelidade (Round-Trip):**
  - Se convertermos o HTML direto para um _novo_ DOCX, podemos perder o template original (capa, cabeçalho da empresa).
  - **Solução Recomendada:** Usar o DOCX original (do Passo 1) como "Base/Template". O sistema pega o conteúdo do HTML editado e _injeta_ de volta no corpo do DOCX original, preservando o layout corporativo que estava em volta.

## 3. Arquitetura Técnica

### Backend (Node/Next.js)

1.  **Endpoint `/api/chat`:**

    - Recebe prompt.
    - Chama MCP para gerar DOCX.
    - Lê o DOCX gerado -> Converte p/ HTML (ex: `mammoth.convertToHtml`).
    - Retorna o HTML para o frontend.

2.  **Endpoint `/api/save-document`:**
    - Recebe o HTML editado.
    - Chama serviço de conversão (HTML -> DOCX).
    - Salva o novo DOCX no banco/storage.

### Frontend

- **Componente Editor:** Recebe a prop `initialContent` (HTML).
- **Botão Salvar/Baixar:** Envia o estado atual do editor para o backend.

## 4. Próximos Passos

1.  **Instalar conversor:** Adicionar `mammoth` no projeto Node.js (`npm install mammoth`).
2.  **Criar Rota de Teste:** Um endpoint que lê um DOCX existente da pasta `output`, converte para HTML e retorna.
3.  **Frontend:** Criar a página com o editor Tiptap recebendo esse HTML.

## 5. Conclusão

Este fluxo híbrido é mais seguro pois usa o DOCX como "fonte da verdade" para o layout/template, usando o HTML apenas como meio de transporte para a interface de edição. Isso mitiga o risco de criar documentos fora do padrão.
