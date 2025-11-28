# Proposta de Arquitetura: Integração SharePoint e Edição Colaborativa

## Resumo Executivo

**Pergunta do Usuário:** _"Preciso de modificações apenas aqui no meu backend ou também irei precisar no meu mcp?"_

**Resposta Curta:** A maior parte das modificações será no **Backend** (`mcp-word-caller`). O **MCP** (servidor Python) precisará de poucas ou nenhuma alteração, desde que mantenhamos a estratégia de sincronização (Download -> Edita -> Upload) orquestrada pelo Backend.

---

## 1. O Novo Fluxo de Trabalho

O objetivo é transformar o gerador de políticas em um assistente colaborativo.

1.  **Geração**: O usuário pede uma política. O Backend chama o MCP para criar o arquivo.
2.  **Upload & Share**: O Backend faz upload para o **SharePoint/OneDrive** e gera um **Link de Edição**.
3.  **Colaboração**:
    - O Usuário abre o link no **Word Web** (navegador).
    - O Usuário pede alterações via Chat ("Mude o título para X").
    - O Chat (Backend + MCP) aplica a alteração no _mesmo arquivo_.

## 2. Mudanças Necessárias

### A. Backend (`src/server.ts`, `src/api/chatApi.ts`) - **ALTO IMPACTO**

O Backend será o "maestro" dessa integração.

1.  **Autenticação Microsoft (OAuth2)**:

    - Implementar login com Microsoft 365 para obter tokens de acesso ao Microsoft Graph API.
    - Necessário para ler/escrever no SharePoint do usuário (ou da organização).

2.  **Substituição do Storage (Supabase -> SharePoint)**:

    - Atualmente, o `storageService.ts` usa Supabase.
    - Criar um `SharePointService` que usa a **Microsoft Graph API**.
    - Funcionalidades: `uploadFile`, `createSharingLink`, `downloadFile`, `checkFileLock`.

3.  **Orquestração de Edição (Sync Strategy)**:
    - O código atual em `chatApi.ts` já faz "Download on Demand" (baixa do Supabase se não tiver local).
    - Isso deve ser adaptado para baixar do SharePoint.
    - **Fluxo de Edição da IA**:
      1.  Bloquear arquivo (check-out) ou garantir versão recente.
      2.  Baixar do SharePoint -> Pasta Temporária Local.
      3.  Chamar MCP (Python) para editar o arquivo local.
      4.  Fazer Upload da nova versão para o SharePoint.
      5.  O Word Web do usuário atualizará (pode pedir refresh).

### B. MCP (Python Server) - **BAIXO IMPACTO**

As ferramentas atuais (`edit_document`, `replace_text`, etc.) operam em arquivos locais (`.docx`).

- **Se mantivermos a estratégia de Sync (descrita acima):** **Nenhuma mudança obrigatória** nas ferramentas de edição. Elas continuam recebendo um path local, editando e salvando.
- **Opcional:** Se quisermos ler comentários do Word ou metadados específicos do SharePoint, precisaríamos criar novas ferramentas.

### C. Frontend (Next.js) - **MÉDIO IMPACTO**

1.  **Visualização**: Em vez de mostrar um PDF/DOCX num iframe ou download, mostrará o **Word Web** (via WOPI frame ou apenas um link para abrir em nova aba).
2.  **Chat**: Precisa enviar o ID do arquivo no SharePoint para o Backend saber qual arquivo editar.

## 3. Desafios Técnicos e Considerações

1.  **Conflitos de Edição (Co-authoring)**:

    - Se o usuário estiver digitando _no exato momento_ que a IA faz upload de uma nova versão, o Word Web pode avisar "Nova versão disponível" ou tentar um merge.
    - A IA editando via `python-docx` (offline) e subindo o arquivo **não é** "Co-autoria em Tempo Real" (como dois usuários no Google Docs). É uma edição em lote.
    - _Solução:_ Para verdadeira co-autoria, a IA teria que usar a API do Word Online (Graph API) para inserir parágrafos, mas ela é muito mais limitada que o `python-docx`. A abordagem de "Download -> Edit -> Upload" é mais poderosa, mas menos "fluida".

2.  **Latência**:
    - Baixar e subir arquivos para o SharePoint a cada interação pode levar alguns segundos.

## 4. Conclusão

Para realizar sua visão:

1.  Foque no **Backend** para integrar com a **Microsoft Graph API**.
2.  Mantenha o **MCP** como está (processador de arquivos offline).
3.  O Backend fará a ponte: baixa do SharePoint -> MCP edita -> sobe pro SharePoint.
