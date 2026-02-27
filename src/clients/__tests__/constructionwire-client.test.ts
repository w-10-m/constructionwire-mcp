import nock from 'nock';
import { ConstructionwireClient } from '../constructionwire-client.js';

const BASE_URL = 'https://api.constructionwire.com';

describe('ConstructionwireClient', () => {
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
      maxRetries: 0 // disable retries for unit tests
    });
    nock.cleanAll();
  });

  describe('authentication', () => {
    it('sends Basic auth header', async () => {
      const expectedAuth = Buffer.from('testuser:testpass').toString('base64');

      const scope = nock(BASE_URL)
        .get('/v1/2.0/reports')
        .matchHeader('Authorization', `Basic ${expectedAuth}`)
        .reply(200, { data: [] });

      await client.reportsList({});
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('GET endpoints', () => {
    it('reportsList returns ToolResult format', async () => {
      nock(BASE_URL)
        .get('/v1/2.0/reports')
        .reply(200, { reports: [{ id: 1, title: 'Test Report' }] });

      const result = await client.reportsList({});

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      const data = JSON.parse(result.content[0]!.text);
      expect(data.reports[0].title).toBe('Test Report');
    });

    it('reportsGet substitutes path params', async () => {
      const scope = nock(BASE_URL)
        .get('/v1/2.0/reports/42')
        .reply(200, { id: 42, title: 'Report 42' });

      const result = await client.reportsGet({ reportId: 42 });
      expect(scope.isDone()).toBe(true);

      const data = JSON.parse(result.content[0]!.text);
      expect(data.id).toBe(42);
    });

    it('companiesList passes query params', async () => {
      const scope = nock(BASE_URL)
        .get('/v1/2.0/companies')
        .query({ PageSize: '10', State: 'CA' })
        .reply(200, { companies: [] });

      await client.companiesList({ PageSize: 10, State: 'CA' });
      expect(scope.isDone()).toBe(true);
    });

    it('peopleGet substitutes nameId path param', async () => {
      const scope = nock(BASE_URL)
        .get('/v1/2.0/people/123')
        .reply(200, { nameId: 123, name: 'John Doe' });

      await client.peopleGet({ nameId: 123 });
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('POST endpoints', () => {
    it('reportsAddQuestion sends body params', async () => {
      const scope = nock(BASE_URL)
        .post('/v1/2.0/reports/1/questions', (body: any) => {
          return body.Question === 'What is the timeline?';
        })
        .reply(201, { questionId: 99 });

      await client.reportsAddQuestion({
        reportId: 1,
        Question: 'What is the timeline?'
      });
      expect(scope.isDone()).toBe(true);
    });

    it('authLogin sends credentials in body', async () => {
      const scope = nock(BASE_URL)
        .post('/v1/auth', (body: any) => {
          return body.username === 'user1' && body.password === 'pass1';
        })
        .reply(200, { token: 'abc123' });

      await client.authLogin({ username: 'user1', password: 'pass1' });
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('DELETE endpoints', () => {
    it('reportsUnfollow sends DELETE with query params', async () => {
      const scope = nock(BASE_URL)
        .delete('/v1/2.0/reports/followings')
        .query({ ItemId: '5' })
        .reply(204);

      await client.reportsUnfollow({ ItemId: 5 });
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('PATCH endpoints', () => {
    it('foldersUpdate sends PATCH with body', async () => {
      const scope = nock(BASE_URL)
        .patch('/v1/2.0/folders/7', (body: any) => {
          return body.Name === 'Updated Folder';
        })
        .reply(200, { folderId: 7, Name: 'Updated Folder' });

      await client.foldersUpdate({ folderId: 7, Name: 'Updated Folder' });
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws on 404', async () => {
      nock(BASE_URL)
        .get('/v1/2.0/reports/999')
        .reply(404, { error: 'Not found' });

      await expect(client.reportsGet({ reportId: 999 }))
        .rejects.toThrow('Failed to execute reports_get');
    });

    it('throws on 500', async () => {
      nock(BASE_URL)
        .get('/v1/2.0/companies')
        .reply(500, { error: 'Internal server error' });

      await expect(client.companiesList({}))
        .rejects.toThrow('Failed to execute companies_list');
    });

    it('throws on network error', async () => {
      nock(BASE_URL)
        .get('/v1/2.0/reports')
        .replyWithError('ECONNREFUSED');

      await expect(client.reportsList({}))
        .rejects.toThrow('Failed to execute reports_list');
    });
  });

  describe('retry logic', () => {
    it('retries on 429 when retries enabled', async () => {
      const retryClient = new ConstructionwireClient({
        constructionwireUsername: 'testuser',
        constructionwirePassword: 'testpass',
        apiBaseUrl: `${BASE_URL}/v1`,
        maxRetries: 2
      });

      nock(BASE_URL)
        .get('/v1/2.0/reports')
        .reply(429, { error: 'Rate limited' })
        .get('/v1/2.0/reports')
        .reply(200, { reports: [] });

      const result = await retryClient.reportsList({});
      expect(result.content[0]!.type).toBe('text');
    });

    it('gives up after max retries', async () => {
      const retryClient = new ConstructionwireClient({
        constructionwireUsername: 'testuser',
        constructionwirePassword: 'testpass',
        apiBaseUrl: `${BASE_URL}/v1`,
        maxRetries: 1
      });

      nock(BASE_URL)
        .get('/v1/2.0/reports')
        .reply(503, { error: 'Unavailable' })
        .get('/v1/2.0/reports')
        .reply(503, { error: 'Still unavailable' });

      await expect(retryClient.reportsList({}))
        .rejects.toThrow();
    });
  });
});
