import { loadConfig, validateConfig, ServerConfig } from '../config.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load default configuration', () => {
      process.env.CONSTRUCTIONWIRE_EMAIL = 'test@example.com';
      process.env.CONSTRUCTIONWIRE_PASSWORD = 'test-password';
      const config = loadConfig();

      expect(config.logShipping.enabled).toBe(false);
      expect(config.logShipping.batchSize).toBe(500);
      expect(config.logShipping.flushInterval).toBe(5000);
      expect(config.logShipping.maxRetries).toBe(3);
      expect(config.logShipping.logLevel).toBe('ERROR');
    });

    it('should load log shipping configuration from environment', () => {
      process.env.LOG_SHIPPING_ENABLED = 'true';
      process.env.LOG_INGESTION_URL = 'https://logs.example.com';
      process.env.LOG_INGESTION_API_KEY = 'api-key';
      process.env.LOG_SHIPPING_BATCH_SIZE = '100';
      process.env.LOG_SHIPPING_INTERVAL = '10000';
      process.env.LOG_SHIPPING_MAX_RETRIES = '5';
      process.env.LOG_LEVEL = 'DEBUG';
      process.env.CONSTRUCTIONWIRE_EMAIL = 'test@example.com';
      process.env.CONSTRUCTIONWIRE_PASSWORD = 'test-password';

      const config = loadConfig();

      expect(config.logShipping.enabled).toBe(true);
      expect(config.logShipping.endpoint).toBe('https://logs.example.com');
      expect(config.logShipping.apiKey).toBe('api-key');
      expect(config.logShipping.batchSize).toBe(100);
      expect(config.logShipping.flushInterval).toBe(10000);
      expect(config.logShipping.maxRetries).toBe(5);
      expect(config.logShipping.logLevel).toBe('DEBUG');
    });

    it('should load constructionwire configuration', () => {
      process.env.CONSTRUCTIONWIRE_USERNAME = 'cw_username';
      process.env.CONSTRUCTIONWIRE_PASSWORD = 'cw_password';

      const config = loadConfig();

      expect(config.constructionwire.cONSTRUCTIONWIREUSERNAME).toBe('cw_username');
      expect(config.constructionwire.cONSTRUCTIONWIREPASSWORD).toBe('cw_password');
      expect(config.constructionwire.api_base_url).toBe('https://api.constructionwire.com/v1');
    });
  });

  describe('validateConfig', () => {
    it('should validate a valid configuration', () => {
      process.env.CONSTRUCTIONWIRE_EMAIL = 'test@example.com';
      process.env.CONSTRUCTIONWIRE_PASSWORD = 'test-password';

      const config: ServerConfig = {
        logShipping: {
          enabled: false,
          endpoint: '',
          batchSize: 500,
          flushInterval: 5000,
          maxRetries: 3,
          logLevel: 'ERROR'
        },
        constructionwire: {
          cONSTRUCTIONWIREUSERNAME: 'test-user',
          cONSTRUCTIONWIREPASSWORD: 'test-password',
          api_base_url: 'https://api.constructionwire.com/v1'
        }
      };

      const result = validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require CONSTRUCTIONWIRE_EMAIL', () => {
      delete process.env.CONSTRUCTIONWIRE_EMAIL;
      process.env.CONSTRUCTIONWIRE_PASSWORD = 'test-password';

      const config: ServerConfig = {
        logShipping: {
          enabled: false,
          endpoint: '',
          batchSize: 500,
          flushInterval: 5000,
          maxRetries: 3,
          logLevel: 'ERROR'
        },
        constructionwire: {
          cONSTRUCTIONWIREUSERNAME: '',
          cONSTRUCTIONWIREPASSWORD: 'test-password',
          api_base_url: 'https://api.constructionwire.com/v1'
        }
      };

      const result = validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CONSTRUCTIONWIRE_EMAIL environment variable is required for ConstructionWire basic+bearer authentication');
    });

    it('should require CONSTRUCTIONWIRE_PASSWORD', () => {
      process.env.CONSTRUCTIONWIRE_EMAIL = 'test@example.com';
      delete process.env.CONSTRUCTIONWIRE_PASSWORD;

      const config: ServerConfig = {
        logShipping: {
          enabled: false,
          endpoint: '',
          batchSize: 500,
          flushInterval: 5000,
          maxRetries: 3,
          logLevel: 'ERROR'
        },
        constructionwire: {
          cONSTRUCTIONWIREUSERNAME: 'test-user',
          cONSTRUCTIONWIREPASSWORD: '',
          api_base_url: 'https://api.constructionwire.com/v1'
        }
      };

      const result = validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CONSTRUCTIONWIRE_PASSWORD environment variable is required for ConstructionWire basic+bearer authentication');
    });

    describe('log shipping validation', () => {
      beforeEach(() => {
        process.env.CONSTRUCTIONWIRE_EMAIL = 'test@example.com';
        process.env.CONSTRUCTIONWIRE_PASSWORD = 'test-password';
      });

      it('should require endpoint when log shipping is enabled', () => {
        const config: ServerConfig = {
          logShipping: {
            enabled: true,
            endpoint: '',
            batchSize: 500,
            flushInterval: 5000,
            maxRetries: 3,
            logLevel: 'ERROR'
          },
          constructionwire: {
            cONSTRUCTIONWIREUSERNAME: 'test-user',
            cONSTRUCTIONWIREPASSWORD: 'test-password',
            api_base_url: 'https://api.constructionwire.com/v1'
          }
        };

        const result = validateConfig(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('LOG_INGESTION_URL environment variable is required when log shipping is enabled');
      });

      it('should require HTTPS for endpoint', () => {
        const config: ServerConfig = {
          logShipping: {
            enabled: true,
            endpoint: 'http://logs.example.com',
            batchSize: 500,
            flushInterval: 5000,
            maxRetries: 3,
            logLevel: 'ERROR'
          },
          constructionwire: {
            cONSTRUCTIONWIREUSERNAME: 'test-user',
            cONSTRUCTIONWIREPASSWORD: 'test-password',
            api_base_url: 'https://api.constructionwire.com/v1'
          }
        };

        const result = validateConfig(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('LOG_INGESTION_URL must use HTTPS protocol');
      });

      it('should validate batch size range', () => {
        const config: ServerConfig = {
          logShipping: {
            enabled: true,
            endpoint: 'https://logs.example.com',
            batchSize: 1500,
            flushInterval: 5000,
            maxRetries: 3,
            logLevel: 'ERROR'
          },
          constructionwire: {
            cONSTRUCTIONWIREUSERNAME: 'test-user',
            cONSTRUCTIONWIREPASSWORD: 'test-password',
            api_base_url: 'https://api.constructionwire.com/v1'
          }
        };

        const result = validateConfig(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('LOG_SHIPPING_BATCH_SIZE must be between 1 and 1000');
      });

      it('should validate minimum flush interval', () => {
        const config: ServerConfig = {
          logShipping: {
            enabled: true,
            endpoint: 'https://logs.example.com',
            batchSize: 500,
            flushInterval: 500,
            maxRetries: 3,
            logLevel: 'ERROR'
          },
          constructionwire: {
            cONSTRUCTIONWIREUSERNAME: 'test-user',
            cONSTRUCTIONWIREPASSWORD: 'test-password',
            api_base_url: 'https://api.constructionwire.com/v1'
          }
        };

        const result = validateConfig(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('LOG_SHIPPING_INTERVAL must be at least 1000ms');
      });

      it('should require API key when requireApiKey is true', () => {
        const config: ServerConfig = {
          logShipping: {
            enabled: true,
            endpoint: 'https://logs.example.com',
            requireApiKey: true,
            batchSize: 500,
            flushInterval: 5000,
            maxRetries: 3,
            logLevel: 'ERROR'
          },
          constructionwire: {
            cONSTRUCTIONWIREUSERNAME: 'test-user',
            cONSTRUCTIONWIREPASSWORD: 'test-password',
            api_base_url: 'https://api.constructionwire.com/v1'
          }
        };

        const result = validateConfig(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('LOG_INGESTION_API_KEY environment variable is required when LOG_SHIPPING_REQUIRE_API_KEY is true');
      });
    });
  });
});
