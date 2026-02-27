import nock from 'nock';
import { ConstructionwireTools } from '../constructionwire-tools.js';
import { ConstructionwireClient } from '../../clients/constructionwire-client.js';

const BASE_URL = 'https://api.constructionwire.com';

describe('ConstructionwireTools', () => {
  let tools: ConstructionwireTools;
  let client: ConstructionwireClient;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    client = new ConstructionwireClient({
      constructionwireUsername: 'testuser',
      constructionwirePassword: 'testpass',
      apiBaseUrl: `${BASE_URL}/v1`,
      maxRetries: 0
    });
    tools = new ConstructionwireTools(client);
    nock.cleanAll();
  });

  describe('getToolDefinitions', () => {
    it('returns all 75 tool definitions', () => {
      const defs = tools.getToolDefinitions();
      expect(defs.length).toBe(75);
    });

    it('every tool has name, description, and inputSchema', () => {
      const defs = tools.getToolDefinitions();
      for (const tool of defs) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('all tool names start with constructionwire_', () => {
      const defs = tools.getToolDefinitions();
      for (const tool of defs) {
        expect(tool.name).toMatch(/^constructionwire_/);
      }
    });
  });

  describe('canHandle', () => {
    it('returns true for known tools', () => {
      expect(tools.canHandle('constructionwire_reports_list')).toBe(true);
      expect(tools.canHandle('constructionwire_companies_get')).toBe(true);
      expect(tools.canHandle('constructionwire_auth_login')).toBe(true);
    });

    it('returns false for unknown tools', () => {
      expect(tools.canHandle('unknown_tool')).toBe(false);
      expect(tools.canHandle('constructionwire_nonexistent')).toBe(false);
      expect(tools.canHandle('')).toBe(false);
    });
  });

  describe('executeTool', () => {
    it('routes constructionwire_reports_list to client', async () => {
      nock(BASE_URL)
        .get('/v1/2.0/reports')
        .reply(200, { reports: [{ id: 1 }] });

      const result = await tools.executeTool('constructionwire_reports_list', {});
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
    });

    it('routes constructionwire_companies_get with args', async () => {
      nock(BASE_URL)
        .get('/v1/2.0/companies/55')
        .reply(200, { companyId: 55, name: 'Acme Corp' });

      const result = await tools.executeTool('constructionwire_companies_get', { companyId: 55 });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe('Acme Corp');
    });

    it('throws for unknown tool', async () => {
      await expect(tools.executeTool('constructionwire_unknown', {}))
        .rejects.toThrow('Unknown tool');
    });

    it('returns error content on API failure', async () => {
      nock(BASE_URL)
        .get('/v1/2.0/reports')
        .reply(500, { error: 'Server error' });

      await expect(tools.executeTool('constructionwire_reports_list', {}))
        .rejects.toThrow();
    });
  });
});
