import axios, { AxiosInstance } from 'axios';
import { Logger } from '../services/logger.js';
import { RequestOptions, ProgressCallback } from '../types.js';
import { ConstructionWireOAuthClient } from '../oauth/constructionwire-oauth-client.js';

export interface ConstructionwireClientConfig {
  cONSTRUCTIONWIREUSERNAME?: string;
  cONSTRUCTIONWIREPASSWORD?: string;
  api_base_url?: any;
  timeout?: number;
  rateLimit?: number; // requests per minute
  authToken?: string;
  logger?: Logger;
}

export class ConstructionwireClient {
  private httpClient: AxiosInstance;
  private config: ConstructionwireClientConfig;
  private sessionId: string;
  private logger: Logger;
  private oauthClient: ConstructionWireOAuthClient;

  constructor(config: ConstructionwireClientConfig) {
    this.config = config;
    
    // Generate unique session ID for this client instance
    this.sessionId = `constructionwire-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Initialize logger (fallback to console if not provided)
    this.logger = config.logger || new Logger(
      {
        logLevel: 'ERROR',
        component: 'client',
        enableConsole: true,
        enableShipping: false,
        serverName: 'constructionwire-mcp'
      }
    );
    
    this.logger.info('CLIENT_INIT', 'Client instance created', { 
      baseUrl: this.resolveBaseUrl(),
      timeout: this.config.timeout || 30000,
      hasRateLimit: !!this.config.rateLimit,
      configKeys: Object.keys(config)
    });

    this.oauthClient = new ConstructionWireOAuthClient();
    
    this.httpClient = axios.create({
      baseURL: this.resolveBaseUrl(),
      timeout: this.config.timeout || 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'constructionwire-mcp/1.0.0',
        ...this.getAuthHeaders()
      },
    });

    // Add request interceptor for rate limiting
    if (this.config.rateLimit) {
      this.setupRateLimit(this.config.rateLimit);
    }

    // Add request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.logRequestStart(
          config.method?.toUpperCase() || 'GET',
          `${config.baseURL}${config.url}`,
          {
            hasData: !!config.data,
            hasParams: !!(config.params && Object.keys(config.params).length > 0),
            headers: Object.keys(config.headers || {})
          }
        );
        
        if (config.data) {
          this.logger.debug('HTTP_REQUEST_BODY', 'Request body data', {
            dataType: typeof config.data,
            dataSize: JSON.stringify(config.data).length
          });
        }
        
        if (config.params && Object.keys(config.params).length > 0) {
          this.logger.debug('HTTP_REQUEST_PARAMS', 'Query parameters', {
            paramCount: Object.keys(config.params).length,
            paramKeys: Object.keys(config.params)
          });
        }
        
        return config;
      },
      (error) => {
        this.logger.error('HTTP_REQUEST_ERROR', 'Request interceptor error', {
          error: error.message,
          code: error.code
        });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.logRequestSuccess(
          response.config?.method?.toUpperCase() || 'GET',
          `${response.config?.baseURL}${response.config?.url}`,
          response.status,
          0, // Duration will be calculated in endpoint methods
          {
            statusText: response.statusText,
            responseSize: JSON.stringify(response.data).length,
            headers: Object.keys(response.headers || {})
          }
        );
        return response;
      },
      (error) => {
        this.logger.logRequestError(
          error.config?.method?.toUpperCase() || 'GET',
          `${error.config?.baseURL}${error.config?.url}`,
          error,
          0, // Duration will be calculated in endpoint methods
          {
            hasResponseData: !!error.response?.data
          }
        );
        throw error;
      }
    );
  }

  private setupRateLimit(requestsPerMinute: number) {
    const interval = 60000 / requestsPerMinute; // ms between requests
    let lastRequestTime = 0;

    this.logger.info('RATE_LIMIT_SETUP', 'Rate limiting configured', {
      requestsPerMinute,
      intervalMs: interval
    });

    this.httpClient.interceptors.request.use(async (config) => {
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      
      if (timeSinceLastRequest < interval) {
        const delayMs = interval - timeSinceLastRequest;
        this.logger.logRateLimit('HTTP_REQUEST', delayMs, {
          timeSinceLastRequest,
          requiredInterval: interval
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      lastRequestTime = Date.now();
      return config;
    });
  }

  private resolveBaseUrl(): string {
    // Debug logging for base_url resolution
    // console.error('[ConstructionwireClient] Resolving base URL...');
    // console.error('[ConstructionwireClient] Template base_url:', 'https://api-cw.buildcentral.com');
    // console.error('[ConstructionwireClient] CustomConfig baseUrl:', '');
    
    let baseUrl = 'https://api-cw.buildcentral.com';
    
    // console.error('[ConstructionwireClient] Initial resolved baseUrl:', baseUrl);
    
    // If no base URL was found, throw an error
    if (!baseUrl) {
      throw new Error(`No base URL configured for constructionwire. Please provide base_url in template or customConfig.baseUrl.`);
    }
    
    // Handle dynamic domain replacement for patterns like CONFLUENCE_DOMAIN, JIRA_DOMAIN, etc.
    const domainEnvVar = `CONSTRUCTIONWIRE_DOMAIN`;
    const domain = process.env[domainEnvVar];
    // console.error(`[ConstructionwireClient] Domain env var (${domainEnvVar}):`, domain);
    
    // Check for SERVICE_DOMAIN pattern (e.g., CONFLUENCE_DOMAIN, JIRA_DOMAIN, SLACK_DOMAIN)
    // This handles both YOUR_DOMAIN and {SERVICE}_DOMAIN patterns in base URLs
    if (baseUrl.includes('YOUR_DOMAIN') || baseUrl.includes(`${domainEnvVar}`)) {
      if (!domain) {
        throw new Error(`Missing domain configuration. Please set ${domainEnvVar} environment variable.`);
      }
      
      // Replace the placeholder with the actual domain value
      // This handles patterns like https://CONFLUENCE_DOMAIN.atlassian.net
      if (baseUrl.includes('YOUR_DOMAIN')) {
        baseUrl = baseUrl.replace(/YOUR_DOMAIN/g, domain);
      } 
      if (baseUrl.includes(`${domainEnvVar}`)) {
        // Replace all occurrences of the service-specific domain placeholder
        const regex = new RegExp(domainEnvVar, 'g');
        baseUrl = baseUrl.replace(regex, domain);
      }
      
      this.logger.info('DOMAIN_RESOLVED', `Resolved base URL with domain`, {
        template: 'constructionwire',
        baseUrl: baseUrl
      });
    }
    
    // console.error('[ConstructionwireClient] Final resolved baseUrl:', baseUrl);
    return baseUrl;
  }

  private getAuthHeaders(): Record<string, string> {
    // OAuth authentication (both ConstructionWire and standard OAuth) - handled dynamically
    // Tokens will be applied asynchronously via makeAuthenticatedRequest
    this.logger.logAuthEvent('oauth_auth_setup', true, {
      authType: 'basic+bearer',
      message: 'OAuth tokens will be applied dynamically during requests',
      oauthClientPresent: !!this.oauthClient
    });
    return {};
  }

  /**
   * Initialize the client (for OAuth clients that need initialization)
   */
  async initialize(): Promise<void> {
    await this.oauthClient.initialize();
    this.logger.info('CLIENT_INITIALIZE', 'ConstructionWire OAuth client initialized');
  }

  /**
   * Get the session ID for this client instance
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Make an authenticated request with proper headers and cancellation support
   */
  private async makeAuthenticatedRequest(config: any, options?: RequestOptions): Promise<any> {
    // Add abort signal if provided
    if (options?.signal) {
      config.signal = options.signal;
    }
    // Get OAuth token for ConstructionWire
    this.logger.info('REQUEST_AUTH', 'Applying ConstructionWire OAuth authentication', {
      authType: 'basic+bearer',
      requestUrl: config.url,
      hasOAuthClient: !!this.oauthClient
    });
    
    const accessToken = await this.oauthClient.getValidAccessToken();
    config.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...config.headers,
      'Authorization': `Bearer ${accessToken}`
    };
    
    this.logger.logAuthEvent('oauth_token_applied', true, {
      authType: 'basic+bearer',
      tokenPreview: accessToken ? accessToken.substring(0, 8) + '...' : 'null',
      header: 'Authorization',
      tokenSource: 'constructionwire_oauth'
    });
    
    return this.httpClient.request(config);
  }

  private buildPath(template: string, params: Record<string, any>): string {
    let path = template;
    
    // Custom encoding that preserves forward slashes for API paths
    const encodePathComponent = (value: string): string => {
      // For Google API resource names like "people/c123", preserve the forward slash
      return encodeURIComponent(value).replace(/%2F/g, '/');
    };
    
    // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
    const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
    let match;
    const processedParams: string[] = [];
    
    while ((match = googlePathTemplateRegex.exec(template)) !== null) {
      const fullMatch = match[0]; // e.g., "{resourceName=people/*}"
      const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
      
      if (paramName && params[paramName] !== undefined) {
        path = path.replace(fullMatch, encodePathComponent(String(params[paramName])));
        processedParams.push(paramName);
      }
    }
    
    // Handle standard path templates: {resourceName}
    for (const [key, value] of Object.entries(params)) {
      if (!processedParams.includes(key)) {
        const standardTemplate = `{${key}}`;
        if (path.includes(standardTemplate)) {
          path = path.replace(standardTemplate, encodePathComponent(String(value)));
          processedParams.push(key);
        }
      }
    }
    
    this.logger.debug('PATH_BUILD', 'Built API path from template', {
      template,
      resultPath: path,
      paramCount: Object.keys(params).length,
      paramKeys: Object.keys(params),
      processedParams,
      hasGoogleTemplates: googlePathTemplateRegex.test(template)
    });
    return path;
  }

  /* DEBUG: endpoint={"name":"reports_list","method":"GET","path":"/2.0/reports","category":"Project Intelligence","description":"List Construction Projects. Returns minimal data appropriate for app search list views. To retrieve complete details, use endpoint /reports/{reportId}. Lets make sure PageSize is max 10.","parameters":{"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call. Maximum should be 10.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"}},"response_format":"json"} */
  async reportsList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_list',
      method: 'GET',
      path: '/2.0/reports',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_list',
        method: 'GET',
        path: '/2.0/reports',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_list',
          method: 'GET',
          path: '/2.0/reports',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_list',
        method: 'GET',
        path: '/2.0/reports',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_get","method":"GET","path":"/2.0/reports/{reportId}","description":"Get a Construction Project. To retrieve multiple, use multiple id (e.g /reports/100?reportTypeId=1&id=101&id=102).","parameters":{"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"},"id":{"type":"array","required":false,"description":"The unique identifier for the Project.  Id is synonymous to reportId.","location":"query","items":"integer"},"reportTypeId":{"type":"integer","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_get',
      method: 'GET',
      path: '/2.0/reports/{reportId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_get',
        method: 'GET',
        path: '/2.0/reports/{reportId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_get',
          method: 'GET',
          path: '/2.0/reports/{reportId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_get',
        method: 'GET',
        path: '/2.0/reports/{reportId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_files","method":"GET","path":"/2.0/reports/{reportId}/files","description":"List Project Files (e.g. Plans/Specs). Set keywordsIn=12 in query to search files (e.g. /reports?reportType=1&keywords={term}&keywordsIn=12).","parameters":{"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsFiles(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_files',
      method: 'GET',
      path: '/2.0/reports/{reportId}/files',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/files';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/files', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_files request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_files request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_files',
        method: 'GET',
        path: '/2.0/reports/{reportId}/files',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_files',
          method: 'GET',
          path: '/2.0/reports/{reportId}/files',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_files',
        method: 'GET',
        path: '/2.0/reports/{reportId}/files',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_file","method":"GET","path":"/2.0/reports/{reportId}/files/{fileId}","description":"Get a Project File (e.g. Plans/Specs)","parameters":{"fileId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsFile(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_file',
      method: 'GET',
      path: '/2.0/reports/{reportId}/files/{fileId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/files/{fileId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/files/{fileId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_file request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_file request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_file',
        method: 'GET',
        path: '/2.0/reports/{reportId}/files/{fileId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_file',
          method: 'GET',
          path: '/2.0/reports/{reportId}/files/{fileId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_file',
        method: 'GET',
        path: '/2.0/reports/{reportId}/files/{fileId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_notes","method":"GET","path":"/2.0/reports/{reportId}/notes","description":"List Project Notes","parameters":{"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsNotes(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_notes',
      method: 'GET',
      path: '/2.0/reports/{reportId}/notes',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/notes';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/notes', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_notes request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_notes request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_notes',
        method: 'GET',
        path: '/2.0/reports/{reportId}/notes',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_notes',
          method: 'GET',
          path: '/2.0/reports/{reportId}/notes',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_notes',
        method: 'GET',
        path: '/2.0/reports/{reportId}/notes',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_note","method":"GET","path":"/2.0/reports/{reportId}/notes/{noteId}","description":"Get a Project Note","parameters":{"noteId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsNote(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_note',
      method: 'GET',
      path: '/2.0/reports/{reportId}/notes/{noteId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/notes/{noteId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/notes/{noteId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_note request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_note request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_note',
        method: 'GET',
        path: '/2.0/reports/{reportId}/notes/{noteId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_note',
          method: 'GET',
          path: '/2.0/reports/{reportId}/notes/{noteId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_note',
        method: 'GET',
        path: '/2.0/reports/{reportId}/notes/{noteId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_note: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_questions","method":"GET","path":"/2.0/reports/{reportId}/questions","description":"List Project Questions","parameters":{"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsQuestions(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_questions',
      method: 'GET',
      path: '/2.0/reports/{reportId}/questions',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/questions';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/questions', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_questions request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_questions request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_questions',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_questions',
          method: 'GET',
          path: '/2.0/reports/{reportId}/questions',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_questions',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_questions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_add_question","method":"POST","path":"/2.0/reports/{reportId}/questions","description":"Create a Project Question","parameters":{"reportId":{"type":"string","required":true,"description":"The unique identifier for the Project.","location":"path"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsAddQuestion(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_add_question',
      method: 'POST',
      path: '/2.0/reports/{reportId}/questions',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/questions';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/questions', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_add_question request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_add_question request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_add_question',
        method: 'POST',
        path: '/2.0/reports/{reportId}/questions',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_add_question',
          method: 'POST',
          path: '/2.0/reports/{reportId}/questions',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_add_question',
        method: 'POST',
        path: '/2.0/reports/{reportId}/questions',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_add_question: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_question","method":"GET","path":"/2.0/reports/{reportId}/questions/{questionId}","description":"Get a Project Question","parameters":{"questionId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsQuestion(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_question',
      method: 'GET',
      path: '/2.0/reports/{reportId}/questions/{questionId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/questions/{questionId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/questions/{questionId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_question request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_question request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_question',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions/{questionId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_question',
          method: 'GET',
          path: '/2.0/reports/{reportId}/questions/{questionId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_question',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions/{questionId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_question: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_answers","method":"GET","path":"/2.0/reports/{reportId}/questions/{questionId}/answers","description":"List Answers to a Question","parameters":{"questionId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsAnswers(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_answers',
      method: 'GET',
      path: '/2.0/reports/{reportId}/questions/{questionId}/answers',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/questions/{questionId}/answers';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/questions/{questionId}/answers', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_answers request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_answers request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_answers',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions/{questionId}/answers',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_answers',
          method: 'GET',
          path: '/2.0/reports/{reportId}/questions/{questionId}/answers',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_answers',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions/{questionId}/answers',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_answers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_answer","method":"GET","path":"/2.0/reports/{reportId}/questions/{questionId}/answers/{answerId}","description":"Get an Answer to a Question","parameters":{"answerId":{"type":"integer","required":true,"description":"","location":"path"},"questionId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsAnswer(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_answer',
      method: 'GET',
      path: '/2.0/reports/{reportId}/questions/{questionId}/answers/{answerId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/questions/{questionId}/answers/{answerId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/questions/{questionId}/answers/{answerId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_answer request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_answer request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_answer',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions/{questionId}/answers/{answerId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_answer',
          method: 'GET',
          path: '/2.0/reports/{reportId}/questions/{questionId}/answers/{answerId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_answer',
        method: 'GET',
        path: '/2.0/reports/{reportId}/questions/{questionId}/answers/{answerId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_answer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_tasks","method":"GET","path":"/2.0/reports/{reportId}/tasks","description":"List Project Tasks","parameters":{"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsTasks(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_tasks',
      method: 'GET',
      path: '/2.0/reports/{reportId}/tasks',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/tasks';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/tasks', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_tasks request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_tasks request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_tasks',
        method: 'GET',
        path: '/2.0/reports/{reportId}/tasks',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_tasks',
          method: 'GET',
          path: '/2.0/reports/{reportId}/tasks',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_tasks',
        method: 'GET',
        path: '/2.0/reports/{reportId}/tasks',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_tasks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_task","method":"GET","path":"/2.0/reports/{reportId}/tasks/{taskId}","description":"Get a Project Task","parameters":{"taskId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsTask(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_task',
      method: 'GET',
      path: '/2.0/reports/{reportId}/tasks/{taskId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/{reportId}/tasks/{taskId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/{reportId}/tasks/{taskId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_task request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_task request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_task',
        method: 'GET',
        path: '/2.0/reports/{reportId}/tasks/{taskId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_task',
          method: 'GET',
          path: '/2.0/reports/{reportId}/tasks/{taskId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_task',
        method: 'GET',
        path: '/2.0/reports/{reportId}/tasks/{taskId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_task: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_facets","method":"GET","path":"/2.0/reports/facets","description":"List Construction Project Facets","parameters":{"facetId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsFacets(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_facets',
      method: 'GET',
      path: '/2.0/reports/facets',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/facets';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/facets', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_facets request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_facets request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_facets',
        method: 'GET',
        path: '/2.0/reports/facets',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_facets',
          method: 'GET',
          path: '/2.0/reports/facets',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_facets',
        method: 'GET',
        path: '/2.0/reports/facets',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_facets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_file_terms","method":"GET","path":"/2.0/reports/files/terms","description":"Get Terms and Conditions for Project Files","parameters":{},"response_format":"json","category":"Project Intelligence"} */
  async reportsFileTerms(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_file_terms',
      method: 'GET',
      path: '/2.0/reports/files/terms',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/files/terms';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/files/terms', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_file_terms request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_file_terms request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_file_terms',
        method: 'GET',
        path: '/2.0/reports/files/terms',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_file_terms',
          method: 'GET',
          path: '/2.0/reports/files/terms',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_file_terms',
        method: 'GET',
        path: '/2.0/reports/files/terms',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_file_terms: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_add_file_terms","method":"POST","path":"/2.0/reports/files/terms","description":"Set request body to \"true\" to indicate that you read and agree to BuildCentral's Terms and Conditions. Read terms at /2.0/reports/files/terms.","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsAddFileTerms(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_add_file_terms',
      method: 'POST',
      path: '/2.0/reports/files/terms',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/files/terms';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/files/terms', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_add_file_terms request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_add_file_terms request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_add_file_terms',
        method: 'POST',
        path: '/2.0/reports/files/terms',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_add_file_terms',
          method: 'POST',
          path: '/2.0/reports/files/terms',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_add_file_terms',
        method: 'POST',
        path: '/2.0/reports/files/terms',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_add_file_terms: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_follow","method":"POST","path":"/2.0/reports/followings","description":"Create a Project Following","parameters":{"folderId":{"type":"integer","required":true,"description":"","location":"path"},"typeId":{"type":"integer","required":false,"description":"","location":"query"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsFollow(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_follow',
      method: 'POST',
      path: '/2.0/reports/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_follow request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_follow request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_follow',
        method: 'POST',
        path: '/2.0/reports/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_follow',
          method: 'POST',
          path: '/2.0/reports/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_follow',
        method: 'POST',
        path: '/2.0/reports/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_follow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_unfollow","method":"DELETE","path":"/2.0/reports/followings","description":"Delete a Project Following","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsUnfollow(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_unfollow',
      method: 'DELETE',
      path: '/2.0/reports/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_unfollow request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'DELETE', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_unfollow request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_unfollow',
        method: 'DELETE',
        path: '/2.0/reports/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_unfollow',
          method: 'DELETE',
          path: '/2.0/reports/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_unfollow',
        method: 'DELETE',
        path: '/2.0/reports/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_unfollow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_following","method":"GET","path":"/2.0/reports/followings","description":"List Project Followings","parameters":{"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"}},"response_format":"json","category":"Project Intelligence"} */
  async reportsFollowing(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_following',
      method: 'GET',
      path: '/2.0/reports/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_following request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_following request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_following',
        method: 'GET',
        path: '/2.0/reports/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_following',
          method: 'GET',
          path: '/2.0/reports/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_following',
        method: 'GET',
        path: '/2.0/reports/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_following: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"reports_all_questions","method":"GET","path":"/2.0/reports/questions","description":"List Project Questions","parameters":{},"response_format":"json","category":"Project Intelligence"} */
  async reportsAllQuestions(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'reports_all_questions',
      method: 'GET',
      path: '/2.0/reports/questions',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/reports/questions';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/reports/questions', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting reports_all_questions request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed reports_all_questions request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'reports_all_questions',
        method: 'GET',
        path: '/2.0/reports/questions',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'reports_all_questions',
          method: 'GET',
          path: '/2.0/reports/questions',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'reports_all_questions',
        method: 'GET',
        path: '/2.0/reports/questions',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute reports_all_questions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_list","method":"GET","path":"/2.0/companies","description":"List Companies","parameters":{"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"}},"response_format":"json","category":"Data Retrieval"} */
  async companiesList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_list',
      method: 'GET',
      path: '/2.0/companies',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_list',
        method: 'GET',
        path: '/2.0/companies',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_list',
          method: 'GET',
          path: '/2.0/companies',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_list',
        method: 'GET',
        path: '/2.0/companies',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_get","method":"GET","path":"/2.0/companies/{companyId}","description":"Get a Company","parameters":{"companyId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Company Directory"} */
  async companiesGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_get',
      method: 'GET',
      path: '/2.0/companies/{companyId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/{companyId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/{companyId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_get',
        method: 'GET',
        path: '/2.0/companies/{companyId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_get',
          method: 'GET',
          path: '/2.0/companies/{companyId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_get',
        method: 'GET',
        path: '/2.0/companies/{companyId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_locations","method":"GET","path":"/2.0/companies/{companyId}/locations","description":"List Company Locations","parameters":{"companyId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Company Directory"} */
  async companiesLocations(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_locations',
      method: 'GET',
      path: '/2.0/companies/{companyId}/locations',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/{companyId}/locations';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/{companyId}/locations', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_locations request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_locations request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_locations',
        method: 'GET',
        path: '/2.0/companies/{companyId}/locations',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_locations',
          method: 'GET',
          path: '/2.0/companies/{companyId}/locations',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_locations',
        method: 'GET',
        path: '/2.0/companies/{companyId}/locations',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_locations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_location","method":"GET","path":"/2.0/companies/{companyId}/locations/{locationId}","description":"Get a Company Location","parameters":{"locationId":{"type":"integer","required":true,"description":"","location":"path"},"companyId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Company Directory"} */
  async companiesLocation(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_location',
      method: 'GET',
      path: '/2.0/companies/{companyId}/locations/{locationId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/{companyId}/locations/{locationId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/{companyId}/locations/{locationId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_location request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_location request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_location',
        method: 'GET',
        path: '/2.0/companies/{companyId}/locations/{locationId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_location',
          method: 'GET',
          path: '/2.0/companies/{companyId}/locations/{locationId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_location',
        method: 'GET',
        path: '/2.0/companies/{companyId}/locations/{locationId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_location: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_people","method":"GET","path":"/2.0/companies/{companyId}/people","description":"List Company's People","parameters":{"companyId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Company Directory"} */
  async companiesPeople(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_people',
      method: 'GET',
      path: '/2.0/companies/{companyId}/people',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/{companyId}/people';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/{companyId}/people', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_people request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_people request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_people',
        method: 'GET',
        path: '/2.0/companies/{companyId}/people',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_people',
          method: 'GET',
          path: '/2.0/companies/{companyId}/people',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_people',
        method: 'GET',
        path: '/2.0/companies/{companyId}/people',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_people: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_projects","method":"GET","path":"/2.0/companies/{companyId}/projectactivities","description":"List Company's Project Activities","parameters":{"companyId":{"type":"integer","required":true,"description":"","location":"path"},"reportTypeId":{"type":"integer","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query"}},"response_format":"json","category":"Project Intelligence"} */
  async companiesProjects(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_projects',
      method: 'GET',
      path: '/2.0/companies/{companyId}/projectactivities',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/{companyId}/projectactivities';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/{companyId}/projectactivities', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_projects request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_projects request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_projects',
        method: 'GET',
        path: '/2.0/companies/{companyId}/projectactivities',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_projects',
          method: 'GET',
          path: '/2.0/companies/{companyId}/projectactivities',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_projects',
        method: 'GET',
        path: '/2.0/companies/{companyId}/projectactivities',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_projects: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_relationships","method":"GET","path":"/2.0/companies/{companyId}/relationships","description":"List Company's Relationships","parameters":{"companyId":{"type":"integer","required":true,"description":"","location":"path"},"reportTypeId":{"type":"integer","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query"}},"response_format":"json","category":"Company Directory"} */
  async companiesRelationships(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_relationships',
      method: 'GET',
      path: '/2.0/companies/{companyId}/relationships',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/{companyId}/relationships';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/{companyId}/relationships', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_relationships request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_relationships request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_relationships',
        method: 'GET',
        path: '/2.0/companies/{companyId}/relationships',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_relationships',
          method: 'GET',
          path: '/2.0/companies/{companyId}/relationships',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_relationships',
        method: 'GET',
        path: '/2.0/companies/{companyId}/relationships',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_relationships: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_stats","method":"GET","path":"/2.0/companies/{companyId}/stats","description":"List Company's Stats","parameters":{"companyId":{"type":"integer","required":true,"description":"","location":"path"},"reportTypeId":{"type":"integer","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query"}},"response_format":"json","category":"Company Directory"} */
  async companiesStats(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_stats',
      method: 'GET',
      path: '/2.0/companies/{companyId}/stats',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/{companyId}/stats';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/{companyId}/stats', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_stats request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_stats request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_stats',
        method: 'GET',
        path: '/2.0/companies/{companyId}/stats',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_stats',
          method: 'GET',
          path: '/2.0/companies/{companyId}/stats',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_stats',
        method: 'GET',
        path: '/2.0/companies/{companyId}/stats',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_facets","method":"GET","path":"/2.0/companies/facets","description":"List Company Facets","parameters":{"facetId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"}},"response_format":"json","category":"Company Directory"} */
  async companiesFacets(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_facets',
      method: 'GET',
      path: '/2.0/companies/facets',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/facets';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/facets', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_facets request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_facets request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_facets',
        method: 'GET',
        path: '/2.0/companies/facets',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_facets',
          method: 'GET',
          path: '/2.0/companies/facets',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_facets',
        method: 'GET',
        path: '/2.0/companies/facets',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_facets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_following","method":"GET","path":"/2.0/companies/followings","description":"List Company Followings","parameters":{"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"}},"response_format":"json","category":"Company Directory"} */
  async companiesFollowing(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_following',
      method: 'GET',
      path: '/2.0/companies/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_following request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_following request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_following',
        method: 'GET',
        path: '/2.0/companies/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_following',
          method: 'GET',
          path: '/2.0/companies/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_following',
        method: 'GET',
        path: '/2.0/companies/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_following: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_follow","method":"POST","path":"/2.0/companies/followings","description":"Create a Company Following","parameters":{"folderId":{"type":"integer","required":true,"description":"","location":"path"},"typeId":{"type":"integer","required":false,"description":"","location":"query"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Company Directory"} */
  async companiesFollow(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_follow',
      method: 'POST',
      path: '/2.0/companies/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_follow request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_follow request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_follow',
        method: 'POST',
        path: '/2.0/companies/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_follow',
          method: 'POST',
          path: '/2.0/companies/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_follow',
        method: 'POST',
        path: '/2.0/companies/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_follow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_unfollow","method":"DELETE","path":"/2.0/companies/followings","description":"Delete a Company Following","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Company Directory"} */
  async companiesUnfollow(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_unfollow',
      method: 'DELETE',
      path: '/2.0/companies/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_unfollow request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'DELETE', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_unfollow request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_unfollow',
        method: 'DELETE',
        path: '/2.0/companies/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_unfollow',
          method: 'DELETE',
          path: '/2.0/companies/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_unfollow',
        method: 'DELETE',
        path: '/2.0/companies/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_unfollow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"companies_all_locations","method":"GET","path":"/2.0/companies/locations","description":"List Locations of multiple Companies","parameters":{"companyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"}},"response_format":"json","category":"Data Retrieval"} */
  async companiesAllLocations(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'companies_all_locations',
      method: 'GET',
      path: '/2.0/companies/locations',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/companies/locations';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/companies/locations', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting companies_all_locations request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed companies_all_locations request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'companies_all_locations',
        method: 'GET',
        path: '/2.0/companies/locations',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'companies_all_locations',
          method: 'GET',
          path: '/2.0/companies/locations',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'companies_all_locations',
        method: 'GET',
        path: '/2.0/companies/locations',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute companies_all_locations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_list","method":"GET","path":"/2.0/people","description":"List People","parameters":{"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"includeBuildingReport":{"type":"boolean","required":false,"description":"Include construction project information with the search results.","location":"query"}},"response_format":"json","category":"Contact Management"} */
  async peopleList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_list',
      method: 'GET',
      path: '/2.0/people',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_list',
        method: 'GET',
        path: '/2.0/people',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_list',
          method: 'GET',
          path: '/2.0/people',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_list',
        method: 'GET',
        path: '/2.0/people',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_get","method":"GET","path":"/2.0/people/{nameId}","description":"Get a Person","parameters":{"nameId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Contact Management"} */
  async peopleGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_get',
      method: 'GET',
      path: '/2.0/people/{nameId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/{nameId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/{nameId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_get',
        method: 'GET',
        path: '/2.0/people/{nameId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_get',
          method: 'GET',
          path: '/2.0/people/{nameId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_get',
        method: 'GET',
        path: '/2.0/people/{nameId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_projects","method":"GET","path":"/2.0/people/{nameId}/projectactivities","description":"List Person's Project Activities","parameters":{"nameId":{"type":"integer","required":true,"description":"","location":"path"},"reportTypeId":{"type":"integer","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query"}},"response_format":"json","category":"Contact Management"} */
  async peopleProjects(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_projects',
      method: 'GET',
      path: '/2.0/people/{nameId}/projectactivities',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/{nameId}/projectactivities';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/{nameId}/projectactivities', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_projects request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_projects request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_projects',
        method: 'GET',
        path: '/2.0/people/{nameId}/projectactivities',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_projects',
          method: 'GET',
          path: '/2.0/people/{nameId}/projectactivities',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_projects',
        method: 'GET',
        path: '/2.0/people/{nameId}/projectactivities',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_projects: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_relationships","method":"GET","path":"/2.0/people/{nameId}/relationships","description":"List Person's Relationships","parameters":{"nameId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Contact Management"} */
  async peopleRelationships(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_relationships',
      method: 'GET',
      path: '/2.0/people/{nameId}/relationships',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/{nameId}/relationships';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/{nameId}/relationships', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_relationships request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_relationships request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_relationships',
        method: 'GET',
        path: '/2.0/people/{nameId}/relationships',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_relationships',
          method: 'GET',
          path: '/2.0/people/{nameId}/relationships',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_relationships',
        method: 'GET',
        path: '/2.0/people/{nameId}/relationships',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_relationships: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_stats","method":"GET","path":"/2.0/people/{nameId}/stats","description":"List Person's Stats","parameters":{"nameId":{"type":"integer","required":true,"description":"","location":"path"},"reportTypeId":{"type":"integer","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query"}},"response_format":"json","category":"Contact Management"} */
  async peopleStats(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_stats',
      method: 'GET',
      path: '/2.0/people/{nameId}/stats',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/{nameId}/stats';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/{nameId}/stats', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_stats request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_stats request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_stats',
        method: 'GET',
        path: '/2.0/people/{nameId}/stats',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_stats',
          method: 'GET',
          path: '/2.0/people/{nameId}/stats',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_stats',
        method: 'GET',
        path: '/2.0/people/{nameId}/stats',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_facets","method":"GET","path":"/2.0/people/facets","description":"List People Facets","parameters":{"facetId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"}},"response_format":"json","category":"Contact Management"} */
  async peopleFacets(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_facets',
      method: 'GET',
      path: '/2.0/people/facets',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/facets';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/facets', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_facets request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_facets request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_facets',
        method: 'GET',
        path: '/2.0/people/facets',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_facets',
          method: 'GET',
          path: '/2.0/people/facets',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_facets',
        method: 'GET',
        path: '/2.0/people/facets',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_facets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_following","method":"GET","path":"/2.0/people/followings","description":"List People Followings","parameters":{"ReportId":{"type":"array","required":false,"description":"The unique identifier for the Project.","location":"query","items":"integer"},"ReportType":{"type":"array","required":false,"description":"See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.","location":"query","items":"integer"},"City":{"type":"string","required":false,"description":"","location":"query"},"State":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"},"PostalCode":{"type":"string","required":false,"description":"","location":"query"},"County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"PublishedUpdatedDateMin":{"type":"string","required":false,"description":"Published Updated Date minimum","location":"query"},"PublishedUpdatedDateMax":{"type":"string","required":false,"description":"Published Updated Date maximum","location":"query"},"PublishedUpdatedDateByDayCount":{"type":"integer","required":false,"description":"Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.","location":"query"},"UpdatedDateMin":{"type":"string","required":false,"description":"Updated Date (system log date) minimum","location":"query"},"UpdatedDateMax":{"type":"string","required":false,"description":"Updated Date (system log date) maximum","location":"query"},"Sector":{"type":"array","required":false,"description":"See [/common/lists/24](/common/lists/24)","location":"query","items":"integer"},"ProjectType":{"type":"array","required":false,"description":"See [/common/lists/27](/common/lists/27)","location":"query","items":"integer"},"ProjectValue":{"type":"array","required":false,"description":"See [/common/lists/25](/common/lists/25)","location":"query","items":"number"},"ProjectSize":{"type":"array","required":false,"description":"See [/common/lists/29](/common/lists/29)","location":"query","items":"integer"},"ConstructionType":{"type":"array","required":false,"description":"See [/common/lists/28](/common/lists/28)","location":"query","items":"integer"},"ConstructionStage":{"type":"array","required":false,"description":"See [/common/lists/31](/common/lists/31)","location":"query","items":"integer"},"CommercialRealEstate":{"type":"array","required":false,"description":"Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)","location":"query","items":"integer"},"ConstructionStartDateMin":{"type":"string","required":false,"description":"Construction Start Date minimum","location":"query"},"ConstructionStartDateMax":{"type":"string","required":false,"description":"Construction Start Date maximum","location":"query"},"ConstructionEndDateMin":{"type":"string","required":false,"description":"Construction End Date minimum","location":"query"},"ConstructionEndDateMax":{"type":"string","required":false,"description":"Construction End Date maximum","location":"query"},"ConstructionLeadValueMin":{"type":"integer","required":false,"description":"Opportunity Size minimum","location":"query"},"ConstructionLeadValueMax":{"type":"integer","required":false,"description":"Opportunity Size maximum","location":"query"},"ShoreType":{"type":"array","required":false,"description":"Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)","location":"query","items":"integer"},"SiteAreaSizeMin":{"type":"number","required":false,"description":"Site Area Size minimum.  Applies to Energy and Mining.","location":"query"},"SiteAreaSizeMax":{"type":"number","required":false,"description":"Site Area Size maximum.  Applies to Energy and Mining.","location":"query"},"Grocery.Chain":{"type":"array","required":false,"description":"Grocery Chain.  See [/common/lists/156](/common/lists/156)","location":"query","items":"integer"},"Grocery.ShoppingCenterName":{"type":"string","required":false,"description":"","location":"query"},"Grocery.ConstructionType":{"type":"integer","required":false,"description":"1-New, 9-Backfill","location":"query"},"Grocery.Schedule":{"type":"array","required":false,"description":"Construction Schedule.  See [/common/lists/30](/common/lists/30)","location":"query","items":"integer"},"Grocery.OpeningDateMin":{"type":"string","required":false,"description":"Opening Date minimum","location":"query"},"Grocery.OpeningDateMax":{"type":"string","required":false,"description":"Opening Date maximum","location":"query"},"Grocery.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Grocery.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Grocery.AuditDateMin":{"type":"string","required":false,"description":"","location":"query"},"Grocery.AuditDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.Chain":{"type":"array","required":false,"description":"See [/common/lists/43](/common/lists/43)","location":"query","items":"integer"},"Hotel.Franchise":{"type":"array","required":false,"description":"See [/common/lists/44](/common/lists/44)","location":"query","items":"integer"},"Hotel.Scale":{"type":"array","required":false,"description":"See [/common/lists/45](/common/lists/45)","location":"query","items":"integer"},"Hotel.Amenity":{"type":"array","required":false,"description":"See [/common/lists/47](/common/lists/47)","location":"query","items":"integer"},"Hotel.RoomCount":{"type":"array","required":false,"description":"Number of rooms.   See [/common/lists/48](/common/lists/48)","location":"query","items":"integer"},"Hotel.MeetingRoomSize":{"type":"array","required":false,"description":"See [/common/lists/52](/common/lists/52)","location":"query","items":"integer"},"Hotel.StarRating":{"type":"array","required":false,"description":"See [/common/lists/133](/common/lists/133)","location":"query","items":"integer"},"Hotel.PriceRateMin":{"type":"number","required":false,"description":"","location":"query"},"Hotel.PriceRateMax":{"type":"number","required":false,"description":"","location":"query"},"Hotel.MarketActivity":{"type":"array","required":false,"description":"See [/common/lists/51](/common/lists/51)","location":"query","items":"integer"},"Hotel.OpeningDateMin":{"type":"string","required":false,"description":"","location":"query"},"Hotel.OpeningDateMax":{"type":"string","required":false,"description":"","location":"query"},"Hotel.ParkingType":{"type":"array","required":false,"description":"Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)","location":"query","items":"integer"},"Medical.FacilityType":{"type":"array","required":false,"description":"Level of Care.  See [/common/lists/54](/common/lists/54)","location":"query","items":"integer"},"Medical.ClinicalSpecialty":{"type":"array","required":false,"description":"See [/common/lists/55](/common/lists/55)","location":"query","items":"integer"},"Medical.ConDateType":{"type":"integer","required":false,"description":"Type of Certification of Need.  1009-CON Application, 1010-CON Approval","location":"query"},"Medical.ConDateMin":{"type":"string","required":false,"description":"Certification of Need minimum date","location":"query"},"Medical.ConDateMax":{"type":"string","required":false,"description":"Certification of Need maximum date","location":"query"},"Medical.ConApplicationDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.ConApprovalDateByDayCount":{"type":"integer","required":false,"description":"Subtract some *number of days* from the current date.","location":"query"},"Medical.SystemName":{"type":"string","required":false,"description":"Name of Health System","location":"query"},"MultiFamily.ProjectType":{"type":"array","required":false,"description":"MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"MultiFamily.ProductType":{"type":"array","required":false,"description":"Product Type.  See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"MultiFamily.SeniorHousingType":{"type":"array","required":false,"description":"See [/common/lists/121](/common/lists/121)","location":"query","items":"integer"},"MultiFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"MultiFamily.BuildingType":{"type":"array","required":false,"description":"See [/common/lists/63](/common/lists/63)","location":"query","items":"integer"},"Retail.Chain":{"type":"array","required":false,"description":"See [/common/lists/retail-chains](/common/lists/retail-chains)","location":"query","items":"integer"},"Retail.FootPrint":{"type":"array","required":false,"description":"See [/common/lists/157](/common/lists/157)","location":"query","items":"integer"},"Retail.DevelopmentType":{"type":"array","required":false,"description":"See [/common/lists/158](/common/lists/158)","location":"query","items":"integer"},"Retail.ChainCompanyName":{"type":"string","required":false,"description":"","location":"query"},"SingleFamily.Acreage":{"type":"array","required":false,"description":"See [/common/lists/149](/common/lists/149)","location":"query","items":"integer"},"SingleFamily.UnitCount":{"type":"array","required":false,"description":"Number of units.  See [/common/lists/64](/common/lists/64)","location":"query","items":"integer"},"SingleFamily.Price":{"type":"array","required":false,"description":"See [/common/lists/150](/common/lists/150)","location":"query","items":"number"},"SingleFamily.Amenity":{"type":"array","required":false,"description":"See [/common/lists/152](/common/lists/152)","location":"query","items":"integer"},"SingleFamily.ProjectType":{"type":"array","required":false,"description":"SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)","location":"query","items":"integer"},"SingleFamily.ProductType":{"type":"array","required":false,"description":"See [/common/lists/61](/common/lists/61)","location":"query","items":"integer"},"Energy.PowerOutput":{"type":"array","required":false,"description":"Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)","location":"query","items":"number"},"Energy.PowerGrid":{"type":"array","required":false,"description":"North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)","location":"query","items":"integer"},"Energy.WindTurbineCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.WindTurbineCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMin":{"type":"integer","required":false,"description":"","location":"query"},"Energy.SolarPanelCountMax":{"type":"integer","required":false,"description":"","location":"query"},"Energy.PowerOutputMin":{"type":"number","required":false,"description":"Power Output (MW) minimum","location":"query"},"Energy.PowerOutputMax":{"type":"number","required":false,"description":"Power Output (MW) maximum","location":"query"},"Energy.QueueNumber":{"type":"string","required":false,"description":"","location":"query"},"Energy.SizeMin":{"type":"integer","required":false,"description":"Facility Size minimum","location":"query"},"Energy.SizeMax":{"type":"integer","required":false,"description":"Facility Size maximum","location":"query"},"Infrastructure.RequestType":{"type":"array","required":false,"description":"See [/common/lists/170](/common/lists/170)","location":"query","items":"integer"},"Infrastructure.FundingType":{"type":"array","required":false,"description":"See [/common/lists/171](/common/lists/171)","location":"query","items":"integer"},"Infrastructure.MaterialType":{"type":"array","required":false,"description":"See [/common/lists/172](/common/lists/172)","location":"query","items":"integer"},"Infrastructure.Category":{"type":"array","required":false,"description":"See [/common/lists/173](/common/lists/173)","location":"query","items":"integer"},"Infrastructure.DocumentFeeMin":{"type":"number","required":false,"description":"Document Fee minimum","location":"query"},"Infrastructure.DocumentFeeMax":{"type":"number","required":false,"description":"Document Fee maximum","location":"query"},"Mining.Resource":{"type":"array","required":false,"description":"See [/common/lists/166](/common/lists/166)","location":"query","items":"integer"},"Mining.MiningType":{"type":"array","required":false,"description":"See [/common/lists/167](/common/lists/167)","location":"query","items":"integer"},"Mining.Stage":{"type":"array","required":false,"description":"See [/common/lists/168](/common/lists/168)","location":"query","items":"integer"},"Contact.ContactId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.LocationId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.NameId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ParentObjectId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.Company.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Company.Name":{"type":"string","required":false,"description":"","location":"query"},"Contact.Company.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.NameId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.ContactName.CompanyId":{"type":"integer","required":false,"description":"","location":"query"},"Contact.ContactName.FullName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.FirstName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.LastName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.MiddleName":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Title":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.PhoneExt":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.ContactName.ContainsField":{"type":"array","required":false,"description":"See [/common/lists/80](/common/lists/80)","location":"query","items":"integer"},"Contact.Location.LocationId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.CompanyId":{"type":"array","required":false,"description":"","location":"query","items":"integer"},"Contact.Location.Address1":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Address2":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.City":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.State":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.Location.PostalCode":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.County":{"type":"array","required":false,"description":"See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)","location":"query","items":"string"},"Contact.Location.Country":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Latitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Longitude":{"type":"number","required":false,"description":"","location":"query"},"Contact.Location.Phone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Fax":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.TollFree":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CellPhone":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Email":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Url":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.LocationName":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.Description":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.DunsNumber":{"type":"string","required":false,"description":"","location":"query"},"Contact.Location.CategoryType":{"type":"array","required":false,"description":"2-Headquarters, 999-Any","location":"query","items":"integer"},"Contact.Role":{"type":"array","required":false,"description":"See [/common/lists/75](/common/lists/75)","location":"query","items":"integer"},"Contact.Keyword":{"type":"string","required":false,"description":"","location":"query"},"Contact.Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"Contact.KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"Contact.KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"Contact.KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"Contact.SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"Contact.SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"Contact.PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Contact.Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"Contact.QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"Contact.CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"DistanceMiles":{"type":"number","required":false,"description":"Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.","location":"query"},"GeographyPolygon":{"type":"string","required":false,"description":"Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581","location":"query"},"Folder":{"type":"array","required":false,"description":"Authenticated user's folder IDs.  See [/common/lists/5000](/common/lists/5000)","location":"query","items":"integer"},"Keyword":{"type":"string","required":false,"description":"","location":"query"},"Keywords":{"type":"array","required":false,"description":"","location":"query","items":"string"},"KeywordsIn":{"type":"array","required":false,"description":"Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)","location":"query","items":"string"},"KeywordMatchType":{"type":"integer","required":false,"description":"See [/common/lists/82](/common/lists/82)","location":"query"},"KeywordLocation":{"type":"string","required":false,"description":"","location":"query"},"SortBy":{"type":"string","required":false,"description":"See [/common/lists/36](/common/lists/36)","location":"query"},"SortOrder":{"type":"string","required":false,"description":"See [/common/lists/23](/common/lists/23)","location":"query"},"PageSize":{"type":"integer","required":false,"description":"The number of records to return in one query call.","location":"query"},"Page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"QueryRecordCount":{"type":"integer","required":false,"description":"The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query's page 1 results.","location":"query"},"CustomParameters":{"type":"string","required":false,"description":"Custom Parameters.  Set to 'LoadAllReports:true' to include all reports outside subscription.  Reports outside subscription are in preview mode.","location":"query"},"includeBuildingReport":{"type":"boolean","required":false,"description":"Include construction project information with the search results.","location":"query"}},"response_format":"json","category":"Contact Management"} */
  async peopleFollowing(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_following',
      method: 'GET',
      path: '/2.0/people/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_following request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_following request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_following',
        method: 'GET',
        path: '/2.0/people/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_following',
          method: 'GET',
          path: '/2.0/people/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_following',
        method: 'GET',
        path: '/2.0/people/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_following: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_follow","method":"POST","path":"/2.0/people/followings","description":"Create a Person Following","parameters":{"folderId":{"type":"integer","required":true,"description":"","location":"path"},"typeId":{"type":"integer","required":false,"description":"","location":"query"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Contact Management"} */
  async peopleFollow(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_follow',
      method: 'POST',
      path: '/2.0/people/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_follow request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_follow request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_follow',
        method: 'POST',
        path: '/2.0/people/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_follow',
          method: 'POST',
          path: '/2.0/people/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_follow',
        method: 'POST',
        path: '/2.0/people/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_follow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"people_unfollow","method":"DELETE","path":"/2.0/people/followings","description":"Delete a Person Following","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Contact Management"} */
  async peopleUnfollow(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'people_unfollow',
      method: 'DELETE',
      path: '/2.0/people/followings',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/people/followings';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/people/followings', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting people_unfollow request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'DELETE', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed people_unfollow request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'people_unfollow',
        method: 'DELETE',
        path: '/2.0/people/followings',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'people_unfollow',
          method: 'DELETE',
          path: '/2.0/people/followings',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'people_unfollow',
        method: 'DELETE',
        path: '/2.0/people/followings',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute people_unfollow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"folders_list","method":"GET","path":"/2.0/folders","description":"List Folders","parameters":{},"response_format":"json","category":"File Organization"} */
  async foldersList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'folders_list',
      method: 'GET',
      path: '/2.0/folders',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/folders';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/folders', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting folders_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed folders_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'folders_list',
        method: 'GET',
        path: '/2.0/folders',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'folders_list',
          method: 'GET',
          path: '/2.0/folders',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'folders_list',
        method: 'GET',
        path: '/2.0/folders',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute folders_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"folders_create","method":"POST","path":"/2.0/folders","description":"Create a Folder","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"File Organization"} */
  async foldersCreate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'folders_create',
      method: 'POST',
      path: '/2.0/folders',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/folders';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/folders', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting folders_create request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed folders_create request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'folders_create',
        method: 'POST',
        path: '/2.0/folders',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'folders_create',
          method: 'POST',
          path: '/2.0/folders',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'folders_create',
        method: 'POST',
        path: '/2.0/folders',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute folders_create: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"folders_get","method":"GET","path":"/2.0/folders/{folderId}","description":"Get a Folder","parameters":{"folderId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"File Organization"} */
  async foldersGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'folders_get',
      method: 'GET',
      path: '/2.0/folders/{folderId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/folders/{folderId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/folders/{folderId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting folders_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed folders_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'folders_get',
        method: 'GET',
        path: '/2.0/folders/{folderId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'folders_get',
          method: 'GET',
          path: '/2.0/folders/{folderId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'folders_get',
        method: 'GET',
        path: '/2.0/folders/{folderId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute folders_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"folders_update","method":"PATCH","path":"/2.0/folders/{folderId}","description":"Update a Folder","parameters":{"folderId":{"type":"integer","required":true,"description":"","location":"path"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"File Organization"} */
  async foldersUpdate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'folders_update',
      method: 'PATCH',
      path: '/2.0/folders/{folderId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/folders/{folderId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/folders/{folderId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting folders_update request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'PATCH', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed folders_update request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'folders_update',
        method: 'PATCH',
        path: '/2.0/folders/{folderId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'folders_update',
          method: 'PATCH',
          path: '/2.0/folders/{folderId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'folders_update',
        method: 'PATCH',
        path: '/2.0/folders/{folderId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute folders_update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"folders_delete","method":"DELETE","path":"/2.0/folders/{folderId}","description":"Delete a Folder","parameters":{"folderId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"File Organization"} */
  async foldersDelete(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'folders_delete',
      method: 'DELETE',
      path: '/2.0/folders/{folderId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/folders/{folderId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/folders/{folderId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting folders_delete request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'DELETE', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed folders_delete request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'folders_delete',
        method: 'DELETE',
        path: '/2.0/folders/{folderId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'folders_delete',
          method: 'DELETE',
          path: '/2.0/folders/{folderId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'folders_delete',
        method: 'DELETE',
        path: '/2.0/folders/{folderId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute folders_delete: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"folders_add_item","method":"POST","path":"/2.0/folders/{folderId}/items","description":"Save Items to a Folder","parameters":{"folderId":{"type":"integer","required":true,"description":"","location":"path"},"typeId":{"type":"integer","required":false,"description":"","location":"query"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"File Organization"} */
  async foldersAddItem(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'folders_add_item',
      method: 'POST',
      path: '/2.0/folders/{folderId}/items',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/folders/{folderId}/items';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/folders/{folderId}/items', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting folders_add_item request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed folders_add_item request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'folders_add_item',
        method: 'POST',
        path: '/2.0/folders/{folderId}/items',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'folders_add_item',
          method: 'POST',
          path: '/2.0/folders/{folderId}/items',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'folders_add_item',
        method: 'POST',
        path: '/2.0/folders/{folderId}/items',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute folders_add_item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"notes_list","method":"GET","path":"/2.0/notes","description":"List Notes","parameters":{"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Data Retrieval"} */
  async notesList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'notes_list',
      method: 'GET',
      path: '/2.0/notes',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/notes';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/notes', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting notes_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed notes_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'notes_list',
        method: 'GET',
        path: '/2.0/notes',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'notes_list',
          method: 'GET',
          path: '/2.0/notes',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'notes_list',
        method: 'GET',
        path: '/2.0/notes',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute notes_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"notes_create","method":"POST","path":"/2.0/notes","description":"Create a Note","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Data Creation"} */
  async notesCreate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'notes_create',
      method: 'POST',
      path: '/2.0/notes',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/notes';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/notes', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting notes_create request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed notes_create request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'notes_create',
        method: 'POST',
        path: '/2.0/notes',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'notes_create',
          method: 'POST',
          path: '/2.0/notes',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'notes_create',
        method: 'POST',
        path: '/2.0/notes',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute notes_create: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"notes_get","method":"GET","path":"/2.0/notes/{noteId}","description":"Get a Note","parameters":{"noteId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Data Retrieval"} */
  async notesGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'notes_get',
      method: 'GET',
      path: '/2.0/notes/{noteId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/notes/{noteId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/notes/{noteId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting notes_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed notes_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'notes_get',
        method: 'GET',
        path: '/2.0/notes/{noteId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'notes_get',
          method: 'GET',
          path: '/2.0/notes/{noteId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'notes_get',
        method: 'GET',
        path: '/2.0/notes/{noteId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute notes_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"notes_update","method":"PATCH","path":"/2.0/notes/{noteId}","description":"Update a Note","parameters":{"noteId":{"type":"integer","required":true,"description":"","location":"path"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Data Updates"} */
  async notesUpdate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'notes_update',
      method: 'PATCH',
      path: '/2.0/notes/{noteId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/notes/{noteId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/notes/{noteId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting notes_update request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'PATCH', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed notes_update request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'notes_update',
        method: 'PATCH',
        path: '/2.0/notes/{noteId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'notes_update',
          method: 'PATCH',
          path: '/2.0/notes/{noteId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'notes_update',
        method: 'PATCH',
        path: '/2.0/notes/{noteId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute notes_update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"notes_delete","method":"DELETE","path":"/2.0/notes/{noteId}","description":"Delete a Note","parameters":{"noteId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Data Deletion"} */
  async notesDelete(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'notes_delete',
      method: 'DELETE',
      path: '/2.0/notes/{noteId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/notes/{noteId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/notes/{noteId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting notes_delete request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'DELETE', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed notes_delete request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'notes_delete',
        method: 'DELETE',
        path: '/2.0/notes/{noteId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'notes_delete',
          method: 'DELETE',
          path: '/2.0/notes/{noteId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'notes_delete',
        method: 'DELETE',
        path: '/2.0/notes/{noteId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute notes_delete: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"news_list","method":"GET","path":"/2.0/productnews","description":"List Product News","parameters":{},"response_format":"json","category":"Data Retrieval"} */
  async newsList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'news_list',
      method: 'GET',
      path: '/2.0/productnews',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/productnews';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/productnews', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting news_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed news_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'news_list',
        method: 'GET',
        path: '/2.0/productnews',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'news_list',
          method: 'GET',
          path: '/2.0/productnews',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'news_list',
        method: 'GET',
        path: '/2.0/productnews',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute news_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"news_get","method":"GET","path":"/2.0/productnews/{entryId}","description":"Get a Product News","parameters":{"entryId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Data Retrieval"} */
  async newsGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'news_get',
      method: 'GET',
      path: '/2.0/productnews/{entryId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/productnews/{entryId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/productnews/{entryId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting news_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed news_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'news_get',
        method: 'GET',
        path: '/2.0/productnews/{entryId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'news_get',
          method: 'GET',
          path: '/2.0/productnews/{entryId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'news_get',
        method: 'GET',
        path: '/2.0/productnews/{entryId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute news_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"searches_list","method":"GET","path":"/2.0/savedsearches","description":"List Saved Searches","parameters":{},"response_format":"json","category":"Data Retrieval"} */
  async searchesList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'searches_list',
      method: 'GET',
      path: '/2.0/savedsearches',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/savedsearches';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/savedsearches', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting searches_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed searches_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'searches_list',
        method: 'GET',
        path: '/2.0/savedsearches',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'searches_list',
          method: 'GET',
          path: '/2.0/savedsearches',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'searches_list',
        method: 'GET',
        path: '/2.0/savedsearches',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute searches_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"searches_create","method":"POST","path":"/2.0/savedsearches","description":"Create a Saved Search","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Data Creation"} */
  async searchesCreate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'searches_create',
      method: 'POST',
      path: '/2.0/savedsearches',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/savedsearches';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/savedsearches', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting searches_create request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed searches_create request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'searches_create',
        method: 'POST',
        path: '/2.0/savedsearches',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'searches_create',
          method: 'POST',
          path: '/2.0/savedsearches',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'searches_create',
        method: 'POST',
        path: '/2.0/savedsearches',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute searches_create: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"searches_get","method":"GET","path":"/2.0/savedsearches/{searchId}","description":"Get a Saved Search","parameters":{"searchId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Data Retrieval"} */
  async searchesGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'searches_get',
      method: 'GET',
      path: '/2.0/savedsearches/{searchId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/savedsearches/{searchId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/savedsearches/{searchId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting searches_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed searches_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'searches_get',
        method: 'GET',
        path: '/2.0/savedsearches/{searchId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'searches_get',
          method: 'GET',
          path: '/2.0/savedsearches/{searchId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'searches_get',
        method: 'GET',
        path: '/2.0/savedsearches/{searchId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute searches_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"searches_update","method":"PATCH","path":"/2.0/savedsearches/{searchId}","description":"Update a Saved Search","parameters":{"searchId":{"type":"integer","required":true,"description":"","location":"path"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Data Updates"} */
  async searchesUpdate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'searches_update',
      method: 'PATCH',
      path: '/2.0/savedsearches/{searchId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/savedsearches/{searchId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/savedsearches/{searchId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting searches_update request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'PATCH', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed searches_update request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'searches_update',
        method: 'PATCH',
        path: '/2.0/savedsearches/{searchId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'searches_update',
          method: 'PATCH',
          path: '/2.0/savedsearches/{searchId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'searches_update',
        method: 'PATCH',
        path: '/2.0/savedsearches/{searchId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute searches_update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"subscriptions_create_free","method":"POST","path":"/2.0/subscriptions/free","description":"Create a Free Subscription","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Subscription Services"} */
  async subscriptionsCreateFree(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'subscriptions_create_free',
      method: 'POST',
      path: '/2.0/subscriptions/free',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/subscriptions/free';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/subscriptions/free', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting subscriptions_create_free request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed subscriptions_create_free request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'subscriptions_create_free',
        method: 'POST',
        path: '/2.0/subscriptions/free',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'subscriptions_create_free',
          method: 'POST',
          path: '/2.0/subscriptions/free',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'subscriptions_create_free',
        method: 'POST',
        path: '/2.0/subscriptions/free',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute subscriptions_create_free: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"subscriptions_usage","method":"GET","path":"/2.0/subscriptions/usage","description":"List Subscription Usage Reports","parameters":{"page":{"type":"integer","required":false,"description":"Page Number","location":"query"},"dateMin":{"type":"string","required":false,"description":"","location":"query"},"dateMax":{"type":"string","required":false,"description":"","location":"query"}},"response_format":"json","category":"Project Intelligence"} */
  async subscriptionsUsage(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'subscriptions_usage',
      method: 'GET',
      path: '/2.0/subscriptions/usage',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/subscriptions/usage';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/subscriptions/usage', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting subscriptions_usage request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed subscriptions_usage request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'subscriptions_usage',
        method: 'GET',
        path: '/2.0/subscriptions/usage',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'subscriptions_usage',
          method: 'GET',
          path: '/2.0/subscriptions/usage',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'subscriptions_usage',
        method: 'GET',
        path: '/2.0/subscriptions/usage',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute subscriptions_usage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"tasks_list","method":"GET","path":"/2.0/tasks","description":"List Tasks","parameters":{"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Task Planning"} */
  async tasksList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'tasks_list',
      method: 'GET',
      path: '/2.0/tasks',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/tasks';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/tasks', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting tasks_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed tasks_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'tasks_list',
        method: 'GET',
        path: '/2.0/tasks',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'tasks_list',
          method: 'GET',
          path: '/2.0/tasks',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'tasks_list',
        method: 'GET',
        path: '/2.0/tasks',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute tasks_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"tasks_create","method":"POST","path":"/2.0/tasks","description":"Create a Task","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Task Planning"} */
  async tasksCreate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'tasks_create',
      method: 'POST',
      path: '/2.0/tasks',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/tasks';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/tasks', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting tasks_create request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed tasks_create request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'tasks_create',
        method: 'POST',
        path: '/2.0/tasks',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'tasks_create',
          method: 'POST',
          path: '/2.0/tasks',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'tasks_create',
        method: 'POST',
        path: '/2.0/tasks',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute tasks_create: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"tasks_get","method":"GET","path":"/2.0/tasks/{taskId}","description":"Get a Task","parameters":{"taskId":{"type":"integer","required":true,"description":"","location":"path"},"reportId":{"type":"integer","required":true,"description":"The unique identifier for the Project.","location":"path"}},"response_format":"json","category":"Task Planning"} */
  async tasksGet(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'tasks_get',
      method: 'GET',
      path: '/2.0/tasks/{taskId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/tasks/{taskId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/tasks/{taskId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting tasks_get request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed tasks_get request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'tasks_get',
        method: 'GET',
        path: '/2.0/tasks/{taskId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'tasks_get',
          method: 'GET',
          path: '/2.0/tasks/{taskId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'tasks_get',
        method: 'GET',
        path: '/2.0/tasks/{taskId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute tasks_get: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"tasks_update","method":"PATCH","path":"/2.0/tasks/{taskId}","description":"Update a Task","parameters":{"taskId":{"type":"integer","required":true,"description":"","location":"path"},"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Task Planning"} */
  async tasksUpdate(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'tasks_update',
      method: 'PATCH',
      path: '/2.0/tasks/{taskId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/tasks/{taskId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/tasks/{taskId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting tasks_update request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'PATCH', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed tasks_update request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'tasks_update',
        method: 'PATCH',
        path: '/2.0/tasks/{taskId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'tasks_update',
          method: 'PATCH',
          path: '/2.0/tasks/{taskId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'tasks_update',
        method: 'PATCH',
        path: '/2.0/tasks/{taskId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute tasks_update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"tasks_delete","method":"DELETE","path":"/2.0/tasks/{taskId}","description":"Delete a Task","parameters":{"taskId":{"type":"integer","required":true,"description":"","location":"path"}},"response_format":"json","category":"Task Planning"} */
  async tasksDelete(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'tasks_delete',
      method: 'DELETE',
      path: '/2.0/tasks/{taskId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/2.0/tasks/{taskId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/2.0/tasks/{taskId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting tasks_delete request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'DELETE', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed tasks_delete request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'tasks_delete',
        method: 'DELETE',
        path: '/2.0/tasks/{taskId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'tasks_delete',
          method: 'DELETE',
          path: '/2.0/tasks/{taskId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'tasks_delete',
        method: 'DELETE',
        path: '/2.0/tasks/{taskId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute tasks_delete: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"auth_login","method":"POST","path":"/auth","description":"Create an Access Token","parameters":{"body":{"type":"object","required":true,"description":"Request body data","location":"body"}},"response_format":"json","category":"Authentication & Access"} */
  async authLogin(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'auth_login',
      method: 'POST',
      path: '/auth',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/auth';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/auth', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting auth_login request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed auth_login request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'auth_login',
        method: 'POST',
        path: '/auth',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'auth_login',
          method: 'POST',
          path: '/auth',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'auth_login',
        method: 'POST',
        path: '/auth',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute auth_login: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"auth_details","method":"GET","path":"/auth/details","description":"List Authenticated Session Details","parameters":{},"response_format":"json","category":"Authentication & Access"} */
  async authDetails(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'auth_details',
      method: 'GET',
      path: '/auth/details',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/auth/details';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/auth/details', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting auth_details request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed auth_details request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'auth_details',
        method: 'GET',
        path: '/auth/details',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'auth_details',
          method: 'GET',
          path: '/auth/details',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'auth_details',
        method: 'GET',
        path: '/auth/details',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute auth_details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"auth_logout","method":"POST","path":"/auth/logout","description":"Logout from Authenticated Session","parameters":{},"response_format":"json","category":"Authentication & Access"} */
  async authLogout(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'auth_logout',
      method: 'POST',
      path: '/auth/logout',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/auth/logout';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/auth/logout', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting auth_logout request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'POST', url: path, params: queryParams, data: hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined) }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed auth_logout request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'auth_logout',
        method: 'POST',
        path: '/auth/logout',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'auth_logout',
          method: 'POST',
          path: '/auth/logout',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'auth_logout',
        method: 'POST',
        path: '/auth/logout',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute auth_logout: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"auth_subscription","method":"GET","path":"/auth/subscription","description":"","parameters":{},"response_format":"json","category":"Subscription Services"} */
  async authSubscription(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'auth_subscription',
      method: 'GET',
      path: '/auth/subscription',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/auth/subscription';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/auth/subscription', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting auth_subscription request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed auth_subscription request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'auth_subscription',
        method: 'GET',
        path: '/auth/subscription',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'auth_subscription',
          method: 'GET',
          path: '/auth/subscription',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'auth_subscription',
        method: 'GET',
        path: '/auth/subscription',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute auth_subscription: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"common_get_list","method":"GET","path":"/common/lists/{listId}","description":"","parameters":{"listId":{"type":"integer","required":true,"description":"See [/common/lists/999](/common/lists/999)","location":"path"},"id":{"type":"array","required":false,"description":"See listId","location":"query","items":"integer"}},"response_format":"json","category":"Data Retrieval"} */
  async commonGetList(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'common_get_list',
      method: 'GET',
      path: '/common/lists/{listId}',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/common/lists/{listId}';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/common/lists/{listId}', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting common_get_list request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed common_get_list request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'common_get_list',
        method: 'GET',
        path: '/common/lists/{listId}',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'common_get_list',
          method: 'GET',
          path: '/common/lists/{listId}',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'common_get_list',
        method: 'GET',
        path: '/common/lists/{listId}',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute common_get_list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"common_retail_chains","method":"GET","path":"/common/lists/retail-chains","description":"","parameters":{"keyword":{"type":"string","required":false,"description":"","location":"query"},"option":{"type":"string","required":false,"description":"","location":"query"}},"response_format":"json","category":"Data Retrieval"} */
  async commonRetailChains(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'common_retail_chains',
      method: 'GET',
      path: '/common/lists/retail-chains',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/common/lists/retail-chains';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      if (params[""] !== undefined) {
        queryParams[""] = params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/common/lists/retail-chains', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting common_retail_chains request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed common_retail_chains request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'common_retail_chains',
        method: 'GET',
        path: '/common/lists/retail-chains',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'common_retail_chains',
          method: 'GET',
          path: '/common/lists/retail-chains',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'common_retail_chains',
        method: 'GET',
        path: '/common/lists/retail-chains',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute common_retail_chains: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"common_states","method":"GET","path":"/common/lists/states","description":"","parameters":{},"response_format":"json","category":"Data Retrieval"} */
  async commonStates(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'common_states',
      method: 'GET',
      path: '/common/lists/states',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/common/lists/states';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/common/lists/states', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting common_states request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed common_states request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'common_states',
        method: 'GET',
        path: '/common/lists/states',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'common_states',
          method: 'GET',
          path: '/common/lists/states',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'common_states',
        method: 'GET',
        path: '/common/lists/states',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute common_states: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"common_counties","method":"GET","path":"/common/lists/states/{stateAbbr}/counties","description":"","parameters":{"stateAbbr":{"type":"string","required":true,"description":"","location":"path"},"state":{"type":"array","required":false,"description":"See [/common/lists/8](/common/lists/8)","location":"query","items":"string"}},"response_format":"json","category":"Data Retrieval"} */
  async commonCounties(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'common_counties',
      method: 'GET',
      path: '/common/lists/states/{stateAbbr}/counties',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/common/lists/states/{stateAbbr}/counties';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        // Handle array parameters - convert to comma-separated string for Google APIs
        queryParams[""] = Array.isArray(params[""]) 
          ? params[""].join(',') 
          : params[""];
        extractedParams.push("");
      }
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/common/lists/states/{stateAbbr}/counties', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting common_counties request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed common_counties request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'common_counties',
        method: 'GET',
        path: '/common/lists/states/{stateAbbr}/counties',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'common_counties',
          method: 'GET',
          path: '/common/lists/states/{stateAbbr}/counties',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'common_counties',
        method: 'GET',
        path: '/common/lists/states/{stateAbbr}/counties',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute common_counties: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"common_regions","method":"GET","path":"/common/lists/states/regions","description":"","parameters":{},"response_format":"json","category":"Data Retrieval"} */
  async commonRegions(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'common_regions',
      method: 'GET',
      path: '/common/lists/states/regions',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/common/lists/states/regions';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/common/lists/states/regions', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting common_regions request...`
        });
      }
      
      // Use authenticated request for OAuth (both ConstructionWire and standard OAuth)
      const response = await this.makeAuthenticatedRequest({ method: 'GET', url: path, params: queryParams }, options);
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed common_regions request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'common_regions',
        method: 'GET',
        path: '/common/lists/states/regions',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'common_regions',
          method: 'GET',
          path: '/common/lists/states/regions',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'common_regions',
        method: 'GET',
        path: '/common/lists/states/regions',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute common_regions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

}