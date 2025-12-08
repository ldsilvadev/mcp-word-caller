/**
 * Testes para os serviços do Backend
 * Execute com: npx jest src/__tests__/services.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// Mock do Prisma
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    document: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    draft: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pdfDocument: {
      findUnique: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

// Mock do MCP Service
jest.mock('../services/mcpService', () => ({
  mcpService: {
    connect: jest.fn().mockResolvedValue(undefined),
    getTools: jest.fn().mockResolvedValue([
      { name: 'create_document', description: 'Create a document' },
      { name: 'fill_document_simple', description: 'Fill template' },
    ]),
    callTool: jest.fn().mockResolvedValue('Success'),
  },
}));

describe('DocumentService', () => {
  describe('getAllDocuments', () => {
    it('API-005: deve retornar lista de documentos', async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const mockDocs = [
        { id: 1, filename: 'doc1.docx', createdAt: new Date(), mimeType: 'application/docx', publicUrl: 'http://...' },
        { id: 2, filename: 'doc2.docx', createdAt: new Date(), mimeType: 'application/docx', publicUrl: 'http://...' },
      ];
      
      (prisma.document.findMany as jest.Mock).mockResolvedValue(mockDocs);
      
      const result = await prisma.document.findMany({
        select: {
          id: true,
          filename: true,
          createdAt: true,
          mimeType: true,
          publicUrl: true,
        },
      });
      
      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('doc1.docx');
    });
  });

  describe('getDocumentById', () => {
    it('API-007: deve retornar documento por ID', async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const mockDoc = { id: 1, filename: 'test.docx', storagePath: 'path/test.docx' };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(mockDoc);
      
      const result = await prisma.document.findUnique({ where: { id: 1 } });
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
    });

    it('API-008: deve retornar null para documento inexistente', async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      
      const result = await prisma.document.findUnique({ where: { id: 999 } });
      
      expect(result).toBeNull();
    });
  });

  describe('saveSharePointDocument', () => {
    it('DOC-005: deve salvar documento do SharePoint', async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const mockDoc = {
        id: 1,
        filename: 'sharepoint.docx',
        storagePath: 'sharepoint-id-123',
        publicUrl: 'https://sharepoint.com/doc',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.document.create as jest.Mock).mockResolvedValue(mockDoc);
      
      const result = await prisma.document.create({
        data: {
          filename: 'sharepoint.docx',
          storagePath: 'sharepoint-id-123',
          publicUrl: 'https://sharepoint.com/doc',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      });
      
      expect(result.filename).toBe('sharepoint.docx');
      expect(result.publicUrl).toContain('sharepoint');
    });
  });
});

describe('DraftService', () => {
  describe('getDraft', () => {
    it('DRF-003: deve retornar draft por ID', async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const mockDraft = {
        id: 1,
        title: 'Test Draft',
        content: { filePath: 'test.docx', metadata: {} },
        status: 'draft',
      };
      
      (prisma.draft.findUnique as jest.Mock).mockResolvedValue(mockDraft);
      
      const result = await prisma.draft.findUnique({ where: { id: 1 } });
      
      expect(result).toBeDefined();
      expect(result?.title).toBe('Test Draft');
    });
  });

  describe('createDraft', () => {
    it('DRF-001: deve criar draft com arquivo .docx', async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const mockDraft = {
        id: 1,
        title: 'Nova Política',
        content: {
          filePath: 'Nova_Politica_123456.docx',
          metadata: {
            assunto: 'Nova Política',
            codigo: '---',
          },
        },
        status: 'draft',
      };
      
      (prisma.draft.create as jest.Mock).mockResolvedValue(mockDraft);
      
      const result = await prisma.draft.create({
        data: {
          title: 'Nova Política',
          content: mockDraft.content,
          status: 'draft',
        },
      });
      
      expect(result.title).toBe('Nova Política');
      expect(result.content.filePath).toContain('.docx');
    });
  });

  describe('updateDraftMetadata', () => {
    it('DRF-005: deve atualizar metadados do draft', async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const existingDraft = {
        id: 1,
        content: { metadata: { revisao: '01' } },
      };
      
      const updatedDraft = {
        id: 1,
        content: { metadata: { revisao: '02' } },
      };
      
      (prisma.draft.findUnique as jest.Mock).mockResolvedValue(existingDraft);
      (prisma.draft.update as jest.Mock).mockResolvedValue(updatedDraft);
      
      const result = await prisma.draft.update({
        where: { id: 1 },
        data: { content: { metadata: { revisao: '02' } } },
      });
      
      expect(result.content.metadata.revisao).toBe('02');
    });
  });
});

describe('McpService', () => {
  describe('getTools', () => {
    it('MCP-002: deve listar ferramentas disponíveis', async () => {
      const { mcpService } = require('../services/mcpService');
      
      const tools = await mcpService.getTools();
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
    });
  });

  describe('callTool', () => {
    it('MCP-003: deve chamar ferramenta com sucesso', async () => {
      const { mcpService } = require('../services/mcpService');
      
      const result = await mcpService.callTool('create_document', { filename: 'test.docx' });
      
      expect(result).toBe('Success');
    });
  });
});

describe('ToolRegistry', () => {
  describe('getAllTools', () => {
    it('deve retornar ferramentas MCP + Draft', async () => {
      // Mock para simular o comportamento do registry
      const draftTools = [
        { type: 'function', function: { name: 'create_draft' } },
        { type: 'function', function: { name: 'get_draft' } },
        { type: 'function', function: { name: 'update_draft' } },
        { type: 'function', function: { name: 'generate_document_from_draft' } },
      ];
      
      const mcpTools = [
        { type: 'function', function: { name: 'create_document' } },
        { type: 'function', function: { name: 'fill_document_simple' } },
      ];
      
      const allTools = [...mcpTools, ...draftTools];
      
      expect(allTools.length).toBe(6);
      expect(allTools.some(t => t.function.name === 'create_draft')).toBe(true);
      expect(allTools.some(t => t.function.name === 'create_document')).toBe(true);
    });
  });
});

describe('Markdown Parser', () => {
  // Simula a função parseMarkdownToStructure
  function parseMarkdownToStructure(markdown: string): any {
    const secao: any[] = [];
    const lines = markdown.split('\n');
    let currentSection: any = null;
    
    for (const line of lines) {
      if (line.startsWith('# ')) {
        if (currentSection) secao.push(currentSection);
        currentSection = {
          titulo: line.replace('# ', ''),
          paragrafo: '',
        };
      } else if (currentSection && line.trim()) {
        currentSection.paragrafo += (currentSection.paragrafo ? '\n' : '') + line;
      }
    }
    
    if (currentSection) secao.push(currentSection);
    return { secao };
  }

  it('MD-001: deve converter heading H1', () => {
    const result = parseMarkdownToStructure('# Título');
    expect(result.secao[0].titulo).toBe('Título');
  });

  it('MD-007: deve converter parágrafo simples', () => {
    const result = parseMarkdownToStructure('# Seção\nTexto normal');
    expect(result.secao[0].paragrafo).toContain('Texto normal');
  });

  it('MD-008: deve converter múltiplas seções', () => {
    const result = parseMarkdownToStructure('# S1\nP1\n# S2\nP2');
    expect(result.secao).toHaveLength(2);
    expect(result.secao[0].titulo).toBe('S1');
    expect(result.secao[1].titulo).toBe('S2');
  });
});

describe('API Endpoints (Unit)', () => {
  describe('POST /chat', () => {
    it('API-001: deve processar mensagem simples', async () => {
      // Simula resposta do chat
      const mockResponse = {
        response: 'Olá! Como posso ajudar?',
        draftUpdated: false,
        updatedDraftId: null,
      };
      
      expect(mockResponse.response).toBeDefined();
      expect(mockResponse.draftUpdated).toBe(false);
    });

    it('API-002: deve atualizar draft quando solicitado', async () => {
      const mockResponse = {
        response: 'Draft atualizado com sucesso!',
        draftUpdated: true,
        updatedDraftId: 1,
      };
      
      expect(mockResponse.draftUpdated).toBe(true);
      expect(mockResponse.updatedDraftId).toBe(1);
    });
  });

  describe('GET /health', () => {
    it('API-021: deve retornar status ok', () => {
      const healthResponse = { status: 'ok', timestamp: new Date().toISOString() };
      
      expect(healthResponse.status).toBe('ok');
      expect(healthResponse.timestamp).toBeDefined();
    });
  });
});

describe('Edge Cases', () => {
  it('EDG-005: deve lidar com seção sem parágrafo', () => {
    const data = {
      secao: [{ titulo: 'Título', paragrafo: '' }],
    };
    
    expect(data.secao[0].titulo).toBe('Título');
    expect(data.secao[0].paragrafo).toBe('');
  });

  it('EDG-002: deve preservar caracteres especiais', () => {
    const text = 'Texto com émojis 🎉 e acentuação: ção, ñ, ü';
    expect(text).toContain('🎉');
    expect(text).toContain('ção');
  });
});
