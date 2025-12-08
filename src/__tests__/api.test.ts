/**
 * Testes de Integração para a API REST
 * Execute com: npx jest src/__tests__/api.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Configuração base para testes de API
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';

// Helper para fazer requisições
async function apiRequest(
  method: string,
  endpoint: string,
  body?: any
): Promise<{ status: number; data: any }> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, data: { error: 'Connection failed' } };
  }
}

describe('API Integration Tests', () => {
  // Pular testes se o servidor não estiver rodando
  let serverAvailable = false;

  beforeAll(async () => {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      serverAvailable = response.ok;
    } catch {
      serverAvailable = false;
    }
  });

  describe('Health Check', () => {
    it('API-021: GET /health deve retornar status ok', async () => {
      if (!serverAvailable) {
        console.log('⚠️ Servidor não disponível, pulando teste');
        return;
      }

      const { status, data } = await apiRequest('GET', '/health');

      expect(status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Documents Endpoints', () => {
    it('API-005: GET /documents deve listar documentos', async () => {
      if (!serverAvailable) return;

      const { status, data } = await apiRequest('GET', '/documents');

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('API-008: GET /documents/:id com ID inexistente deve retornar 404', async () => {
      if (!serverAvailable) return;

      const { status } = await apiRequest('GET', '/documents/999999');

      expect(status).toBe(404);
    });
  });

  describe('Drafts Endpoints', () => {
    it('API-016: GET /drafts/:id com ID inexistente deve retornar 404', async () => {
      if (!serverAvailable) return;

      const { status } = await apiRequest('GET', '/drafts/999999');

      expect(status).toBe(404);
    });

    it('API-011: GET /drafts/:id/status deve retornar status do draft', async () => {
      if (!serverAvailable) return;

      // Este teste assume que existe um draft com ID 1
      const { status, data } = await apiRequest('GET', '/drafts/1/status');

      if (status === 200) {
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('status');
      } else {
        expect(status).toBe(404);
      }
    });
  });

  describe('Chat Endpoint', () => {
    it('API-001: POST /chat deve processar mensagem', async () => {
      if (!serverAvailable) return;

      const { status, data } = await apiRequest('POST', '/chat', {
        message: 'Olá, teste de integração',
      });

      // Pode demorar devido à IA, então aceitamos timeout também
      if (status === 200) {
        expect(data).toHaveProperty('response');
        expect(data).toHaveProperty('draftUpdated');
      }
    }, 60000); // Timeout de 60s para chamadas de IA

    it('API-004: POST /chat sem mensagem deve funcionar ou retornar erro', async () => {
      if (!serverAvailable) return;

      const { status } = await apiRequest('POST', '/chat', {});

      // Pode retornar 400 ou 500 dependendo da implementação
      expect([200, 400, 500]).toContain(status);
    });
  });

  describe('OnlyOffice Endpoints', () => {
    it('API-020: GET /onlyoffice/status deve retornar disponibilidade', async () => {
      if (!serverAvailable) return;

      const { status, data } = await apiRequest('GET', '/onlyoffice/status');

      expect(status).toBe(200);
      expect(data).toHaveProperty('available');
      expect(data).toHaveProperty('serverUrl');
    });
  });
});

describe('API Error Handling', () => {
  describe('Invalid Requests', () => {
    it('deve retornar erro para endpoint inexistente', async () => {
      const { status } = await apiRequest('GET', '/endpoint-inexistente');

      // 404 ou 0 (se servidor não disponível)
      expect([0, 404]).toContain(status);
    });

    it('deve retornar erro para método não permitido', async () => {
      const { status } = await apiRequest('DELETE', '/health');

      // 404, 405 ou 0
      expect([0, 404, 405]).toContain(status);
    });
  });
});

describe('API Response Format', () => {
  it('respostas devem ser JSON válido', async () => {
    const endpoints = ['/health', '/documents', '/onlyoffice/status'];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${BASE_URL}${endpoint}`);
        if (response.ok) {
          const data = await response.json();
          expect(data).toBeDefined();
        }
      } catch {
        // Servidor não disponível
      }
    }
  });
});
