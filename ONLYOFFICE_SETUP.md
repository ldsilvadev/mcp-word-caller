# OnlyOffice Integration

## Visão Geral

O OnlyOffice Document Server foi integrado para fornecer uma experiência de edição idêntica ao Microsoft Word.

## Requisitos

- Docker e Docker Compose instalados
- Portas 8080 (OnlyOffice) e 3001 (Backend) disponíveis

## Inicialização

### 1. Subir os serviços

```bash
cd mcp-word-caller
docker-compose up -d
```

Isso irá iniciar:
- PostgreSQL (porta 5432)
- OnlyOffice Document Server (porta 8080)

### 2. Verificar se está funcionando

Acesse http://localhost:8080 - você deve ver a página do OnlyOffice.

### 3. Iniciar o backend

```bash
npm run dev
```

### 4. Iniciar o frontend

```bash
cd ../frontend-word-caller
npm run dev
```

## Uso

1. Crie um documento via chat com a IA
2. O documento aparecerá no editor Preview
3. Clique no botão "Word" para abrir no OnlyOffice
4. Edite com todas as ferramentas do Word
5. As alterações são salvas automaticamente

## Automação via Pipeline

### GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Start services
        run: docker-compose up -d
        
      - name: Wait for OnlyOffice
        run: |
          timeout 120 bash -c 'until curl -s http://localhost:8080/healthcheck; do sleep 5; done'
```

### Docker Compose para Produção

```yaml
version: "3.8"
services:
  onlyoffice:
    image: onlyoffice/documentserver:latest
    environment:
      - JWT_ENABLED=true
      - JWT_SECRET=${ONLYOFFICE_JWT_SECRET}
    volumes:
      - onlyoffice_data:/var/www/onlyoffice/Data
    restart: always
    
  backend:
    build: ./mcp-word-caller
    environment:
      - ONLYOFFICE_URL=http://onlyoffice
      - ONLYOFFICE_JWT_SECRET=${ONLYOFFICE_JWT_SECRET}
    depends_on:
      - onlyoffice
      
  frontend:
    build: ./frontend-word-caller
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:3001
    depends_on:
      - backend
```

### Kubernetes (Helm)

O OnlyOffice tem charts oficiais:
```bash
helm repo add onlyoffice https://download.onlyoffice.com/charts/stable
helm install documentserver onlyoffice/docs
```

## Variáveis de Ambiente

| Variável | Descrição | Default |
|----------|-----------|---------|
| `ONLYOFFICE_URL` | URL do servidor OnlyOffice | `http://localhost:8080` |
| `ONLYOFFICE_JWT_SECRET` | Chave JWT para autenticação | `mcp_onlyoffice_secret_key_change_in_production` |
| `BACKEND_URL` | URL do backend (para callbacks) | `http://host.docker.internal:3001` |

## Troubleshooting

### OnlyOffice não inicia
```bash
docker logs mcp_onlyoffice
```

### Documento não carrega
- Verifique se o backend está acessível pelo OnlyOffice
- Em Docker, use `host.docker.internal` para acessar o host

### Erro de JWT
- Verifique se a chave JWT é a mesma no backend e no OnlyOffice
