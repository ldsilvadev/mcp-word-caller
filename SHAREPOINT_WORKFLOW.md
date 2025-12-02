# Fluxo de Trabalho: Integração SharePoint e Edição Colaborativa

Este documento descreve o novo funcionamento da aplicação após a integração com o Microsoft SharePoint.

## Visão Geral

A aplicação evoluiu de um "Gerador de Arquivos Estáticos" para um **"Copiloto de Documentos Online"**. Agora, todos os documentos gerados são hospedados automaticamente no SharePoint/OneDrive, permitindo edição colaborativa via Word Online.

---

## O Novo Fluxo Passo-a-Passo

### 1. Solicitação (Chat)

- **Ação:** O usuário solicita a criação ou edição de um documento via chat.
- **Exemplo:** _"Crie uma política de Home Office."_

### 2. Geração e Processamento (Backend + MCP)

- **Geração:** O Agente (Python MCP) gera o arquivo `.docx` localmente no servidor, utilizando templates e regras de negócio.
- **Interceptação:** O Backend (Node.js) detecta que um novo arquivo foi criado.

### 3. Sincronização e Upload (SharePoint)

- **Upload:** O Backend envia o arquivo automaticamente para a pasta `/MCP-Output` no OneDrive/SharePoint do usuário autenticado.
- **Link:** É gerado um **Link de Edição** (Web URL) que permite abrir o arquivo no navegador.
- **Persistência:** O sistema salva o ID do arquivo e o Link no banco de dados para referência futura.

### 4. Entrega e Visualização

- **Resposta:** O Chat devolve o link para o usuário.
- **Ação do Usuário:** O usuário clica no link e abre o documento no **Word Online**.
- **Vantagem:** Não é necessário baixar o arquivo. A versão na nuvem é a "fonte da verdade".

### 5. Edição Colaborativa (O Ciclo de Vida)

Quando o usuário pede uma alteração no documento já existente:

1.  **Download:** O Backend baixa a versão mais recente do SharePoint (incluindo edições manuais que o usuário possa ter feito).
2.  **Edição:** O Agente MCP aplica as alterações solicitadas no arquivo.
3.  **Upload (Sobrescrita):** O Backend sobe a nova versão para o SharePoint.
4.  **Atualização:** O usuário vê as alterações aparecerem no Word Online (quase em tempo real).

---

## Benefícios

- **Colaboração Real:** Usuário e IA trabalham no mesmo arquivo.
- **Sem Versões Perdidas:** Fim de `politica_v1_final_agora_vai.docx`. Tudo fica no histórico de versões do SharePoint.
- **Acesso Universal:** O documento pode ser acessado de qualquer lugar via navegador.
