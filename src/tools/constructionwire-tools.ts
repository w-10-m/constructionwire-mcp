import { ConstructionwireClient } from '../clients/constructionwire-client.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../services/logger.js';
import { RequestContext } from '../services/request-tracker.js';
import { ProgressReporter } from '../services/progress-reporter.js';

export interface ConstructionwireToolsConfig {
  cONSTRUCTIONWIREUSERNAME?: string;
  cONSTRUCTIONWIREPASSWORD?: string;
  api_base_url?: any;
  authToken?: string;
  logger?: Logger;
}

export class ConstructionwireTools {
  private client: ConstructionwireClient;
  private initialized = false;
  private logger: Logger;

  constructor(client: ConstructionwireClient) {
    this.client = client;
    
    // Get logger from client if available, otherwise create fallback
    this.logger = (client as any).logger || new Logger(
      {
        logLevel: 'ERROR',
        component: 'tools',
        enableConsole: true,
        enableShipping: false,
        serverName: ''
      }
    );
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      // Log tools initialization now that client is ready
      this.logger.info('TOOLS_INIT', 'Tools instance initialization started', { 
        integration: 'constructionwire',
        isOAuth: false
      });
      
      this.logger.info('CLIENT_INITIALIZATION', 'Starting client initialization', {
        isOAuth: false
      });
      
      
      this.initialized = true;
      this.logger.info('CLIENT_INITIALIZATION', 'Client initialization completed', {
        initialized: this.initialized
      });
    }
  }

  getToolDefinitions(): Tool[] {
    return [
      {
        name: 'constructionwire_reports_list',
        description: 'List Construction Projects. Returns minimal data appropriate for app search list views. To retrieve complete details, use endpoint /reports/{reportId}. Lets make sure PageSize is max 10.',
        inputSchema: {
          type: 'object',
          properties: {
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call. Maximum should be 10.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_reports_get',
        description: 'Get a Construction Project. To retrieve multiple, use multiple id (e.g /reports/100?reportTypeId&#x3D;1&amp;id&#x3D;101&amp;id&#x3D;102).',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            },
            id: {
              type: 'array',
              description: 'The unique identifier for the Project.  Id is synonymous to reportId.'
            },
            reportTypeId: {
              type: 'integer',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            }
          },
          required: ['reportId']
        }
      },
      {
        name: 'constructionwire_reports_files',
        description: 'List Project Files (e.g. Plans/Specs). Set keywordsIn&#x3D;12 in query to search files (e.g. /reports?reportType&#x3D;1&amp;keywords&#x3D;{term}&amp;keywordsIn&#x3D;12).',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['reportId']
        }
      },
      {
        name: 'constructionwire_reports_file',
        description: 'Get a Project File (e.g. Plans/Specs)',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['fileId','reportId']
        }
      },
      {
        name: 'constructionwire_reports_notes',
        description: 'List Project Notes',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['reportId']
        }
      },
      {
        name: 'constructionwire_reports_note',
        description: 'Get a Project Note',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['noteId','reportId']
        }
      },
      {
        name: 'constructionwire_reports_questions',
        description: 'List Project Questions',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['reportId']
        }
      },
      {
        name: 'constructionwire_reports_add_question',
        description: 'Create a Project Question',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'string',
              description: 'The unique identifier for the Project.'
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['reportId','body']
        }
      },
      {
        name: 'constructionwire_reports_question',
        description: 'Get a Project Question',
        inputSchema: {
          type: 'object',
          properties: {
            questionId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['questionId','reportId']
        }
      },
      {
        name: 'constructionwire_reports_answers',
        description: 'List Answers to a Question',
        inputSchema: {
          type: 'object',
          properties: {
            questionId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['questionId','reportId']
        }
      },
      {
        name: 'constructionwire_reports_answer',
        description: 'Get an Answer to a Question',
        inputSchema: {
          type: 'object',
          properties: {
            answerId: {
              type: 'integer',
              description: ''
            },
            questionId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['answerId','questionId','reportId']
        }
      },
      {
        name: 'constructionwire_reports_tasks',
        description: 'List Project Tasks',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['reportId']
        }
      },
      {
        name: 'constructionwire_reports_task',
        description: 'Get a Project Task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['taskId','reportId']
        }
      },
      {
        name: 'constructionwire_reports_facets',
        description: 'List Construction Project Facets',
        inputSchema: {
          type: 'object',
          properties: {
            facetId: {
              type: 'array',
              description: ''
            },
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_reports_file_terms',
        description: 'Get Terms and Conditions for Project Files',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_reports_add_file_terms',
        description: 'Set request body to &quot;true&quot; to indicate that you read and agree to BuildCentral&#x27;s Terms and Conditions. Read terms at /2.0/reports/files/terms.',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_reports_follow',
        description: 'Create a Project Following',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: {
              type: 'integer',
              description: ''
            },
            typeId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['folderId','body']
        }
      },
      {
        name: 'constructionwire_reports_unfollow',
        description: 'Delete a Project Following',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_reports_following',
        description: 'List Project Followings',
        inputSchema: {
          type: 'object',
          properties: {
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_reports_all_questions',
        description: 'List Project Questions',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_companies_list',
        description: 'List Companies',
        inputSchema: {
          type: 'object',
          properties: {
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_companies_get',
        description: 'Get a Company',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['companyId']
        }
      },
      {
        name: 'constructionwire_companies_locations',
        description: 'List Company Locations',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['companyId']
        }
      },
      {
        name: 'constructionwire_companies_location',
        description: 'Get a Company Location',
        inputSchema: {
          type: 'object',
          properties: {
            locationId: {
              type: 'integer',
              description: ''
            },
            companyId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['locationId','companyId']
        }
      },
      {
        name: 'constructionwire_companies_people',
        description: 'List Company&#x27;s People',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['companyId']
        }
      },
      {
        name: 'constructionwire_companies_projects',
        description: 'List Company&#x27;s Project Activities',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'integer',
              description: ''
            },
            reportTypeId: {
              type: 'integer',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            }
          },
          required: ['companyId']
        }
      },
      {
        name: 'constructionwire_companies_relationships',
        description: 'List Company&#x27;s Relationships',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'integer',
              description: ''
            },
            reportTypeId: {
              type: 'integer',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            }
          },
          required: ['companyId']
        }
      },
      {
        name: 'constructionwire_companies_stats',
        description: 'List Company&#x27;s Stats',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'integer',
              description: ''
            },
            reportTypeId: {
              type: 'integer',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            }
          },
          required: ['companyId']
        }
      },
      {
        name: 'constructionwire_companies_facets',
        description: 'List Company Facets',
        inputSchema: {
          type: 'object',
          properties: {
            facetId: {
              type: 'array',
              description: ''
            },
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_companies_following',
        description: 'List Company Followings',
        inputSchema: {
          type: 'object',
          properties: {
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_companies_follow',
        description: 'Create a Company Following',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: {
              type: 'integer',
              description: ''
            },
            typeId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['folderId','body']
        }
      },
      {
        name: 'constructionwire_companies_unfollow',
        description: 'Delete a Company Following',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_companies_all_locations',
        description: 'List Locations of multiple Companies',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'array',
              description: ''
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_people_list',
        description: 'List People',
        inputSchema: {
          type: 'object',
          properties: {
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            includeBuildingReport: {
              type: 'boolean',
              description: 'Include construction project information with the search results.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_people_get',
        description: 'Get a Person',
        inputSchema: {
          type: 'object',
          properties: {
            nameId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['nameId']
        }
      },
      {
        name: 'constructionwire_people_projects',
        description: 'List Person&#x27;s Project Activities',
        inputSchema: {
          type: 'object',
          properties: {
            nameId: {
              type: 'integer',
              description: ''
            },
            reportTypeId: {
              type: 'integer',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            }
          },
          required: ['nameId']
        }
      },
      {
        name: 'constructionwire_people_relationships',
        description: 'List Person&#x27;s Relationships',
        inputSchema: {
          type: 'object',
          properties: {
            nameId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['nameId']
        }
      },
      {
        name: 'constructionwire_people_stats',
        description: 'List Person&#x27;s Stats',
        inputSchema: {
          type: 'object',
          properties: {
            nameId: {
              type: 'integer',
              description: ''
            },
            reportTypeId: {
              type: 'integer',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            }
          },
          required: ['nameId']
        }
      },
      {
        name: 'constructionwire_people_facets',
        description: 'List People Facets',
        inputSchema: {
          type: 'object',
          properties: {
            facetId: {
              type: 'array',
              description: ''
            },
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_people_following',
        description: 'List People Followings',
        inputSchema: {
          type: 'object',
          properties: {
            ReportId: {
              type: 'array',
              description: 'The unique identifier for the Project.'
            },
            ReportType: {
              type: 'array',
              description: 'See [/common/lists/1](/common/lists/1).  Report type access is dependent on subscription.  Call 866-316-5300 to access all report types.'
            },
            City: {
              type: 'string',
              description: ''
            },
            State: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            },
            PostalCode: {
              type: 'string',
              description: ''
            },
            County: {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            PublishedUpdatedDateMin: {
              type: 'string',
              description: 'Published Updated Date minimum'
            },
            PublishedUpdatedDateMax: {
              type: 'string',
              description: 'Published Updated Date maximum'
            },
            PublishedUpdatedDateByDayCount: {
              type: 'integer',
              description: 'Set publishedUpdatedDateMin by subtracting some *number of days* from the current date.'
            },
            UpdatedDateMin: {
              type: 'string',
              description: 'Updated Date (system log date) minimum'
            },
            UpdatedDateMax: {
              type: 'string',
              description: 'Updated Date (system log date) maximum'
            },
            Sector: {
              type: 'array',
              description: 'See [/common/lists/24](/common/lists/24)'
            },
            ProjectType: {
              type: 'array',
              description: 'See [/common/lists/27](/common/lists/27)'
            },
            ProjectValue: {
              type: 'array',
              description: 'See [/common/lists/25](/common/lists/25)'
            },
            ProjectSize: {
              type: 'array',
              description: 'See [/common/lists/29](/common/lists/29)'
            },
            ConstructionType: {
              type: 'array',
              description: 'See [/common/lists/28](/common/lists/28)'
            },
            ConstructionStage: {
              type: 'array',
              description: 'See [/common/lists/31](/common/lists/31)'
            },
            CommercialRealEstate: {
              type: 'array',
              description: 'Commercial Real Estate (CRE).  See [/common/lists/161](/common/lists/161)'
            },
            ConstructionStartDateMin: {
              type: 'string',
              description: 'Construction Start Date minimum'
            },
            ConstructionStartDateMax: {
              type: 'string',
              description: 'Construction Start Date maximum'
            },
            ConstructionEndDateMin: {
              type: 'string',
              description: 'Construction End Date minimum'
            },
            ConstructionEndDateMax: {
              type: 'string',
              description: 'Construction End Date maximum'
            },
            ConstructionLeadValueMin: {
              type: 'integer',
              description: 'Opportunity Size minimum'
            },
            ConstructionLeadValueMax: {
              type: 'integer',
              description: 'Opportunity Size maximum'
            },
            ShoreType: {
              type: 'array',
              description: 'Onshore/Offshore.  Applies to Energy and Mining.  See [/common/lists/162](/common/lists/162)'
            },
            SiteAreaSizeMin: {
              type: 'number',
              description: 'Site Area Size minimum.  Applies to Energy and Mining.'
            },
            SiteAreaSizeMax: {
              type: 'number',
              description: 'Site Area Size maximum.  Applies to Energy and Mining.'
            },
            "Grocery.Chain": {
              type: 'array',
              description: 'Grocery Chain.  See [/common/lists/156](/common/lists/156)'
            },
            "Grocery.ShoppingCenterName": {
              type: 'string',
              description: ''
            },
            "Grocery.ConstructionType": {
              type: 'integer',
              description: '1-New, 9-Backfill'
            },
            "Grocery.Schedule": {
              type: 'array',
              description: 'Construction Schedule.  See [/common/lists/30](/common/lists/30)'
            },
            "Grocery.OpeningDateMin": {
              type: 'string',
              description: 'Opening Date minimum'
            },
            "Grocery.OpeningDateMax": {
              type: 'string',
              description: 'Opening Date maximum'
            },
            "Grocery.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Grocery.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Grocery.AuditDateMin": {
              type: 'string',
              description: ''
            },
            "Grocery.AuditDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.Chain": {
              type: 'array',
              description: 'See [/common/lists/43](/common/lists/43)'
            },
            "Hotel.Franchise": {
              type: 'array',
              description: 'See [/common/lists/44](/common/lists/44)'
            },
            "Hotel.Scale": {
              type: 'array',
              description: 'See [/common/lists/45](/common/lists/45)'
            },
            "Hotel.Amenity": {
              type: 'array',
              description: 'See [/common/lists/47](/common/lists/47)'
            },
            "Hotel.RoomCount": {
              type: 'array',
              description: 'Number of rooms.   See [/common/lists/48](/common/lists/48)'
            },
            "Hotel.MeetingRoomSize": {
              type: 'array',
              description: 'See [/common/lists/52](/common/lists/52)'
            },
            "Hotel.StarRating": {
              type: 'array',
              description: 'See [/common/lists/133](/common/lists/133)'
            },
            "Hotel.PriceRateMin": {
              type: 'number',
              description: ''
            },
            "Hotel.PriceRateMax": {
              type: 'number',
              description: ''
            },
            "Hotel.MarketActivity": {
              type: 'array',
              description: 'See [/common/lists/51](/common/lists/51)'
            },
            "Hotel.OpeningDateMin": {
              type: 'string',
              description: ''
            },
            "Hotel.OpeningDateMax": {
              type: 'string',
              description: ''
            },
            "Hotel.ParkingType": {
              type: 'array',
              description: 'Type of parking available.  Applies to Hotel.  See [/common/lists/33](/common/lists/33)'
            },
            "Medical.FacilityType": {
              type: 'array',
              description: 'Level of Care.  See [/common/lists/54](/common/lists/54)'
            },
            "Medical.ClinicalSpecialty": {
              type: 'array',
              description: 'See [/common/lists/55](/common/lists/55)'
            },
            "Medical.ConDateType": {
              type: 'integer',
              description: 'Type of Certification of Need.  1009-CON Application, 1010-CON Approval'
            },
            "Medical.ConDateMin": {
              type: 'string',
              description: 'Certification of Need minimum date'
            },
            "Medical.ConDateMax": {
              type: 'string',
              description: 'Certification of Need maximum date'
            },
            "Medical.ConApplicationDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.ConApprovalDateByDayCount": {
              type: 'integer',
              description: 'Subtract some *number of days* from the current date.'
            },
            "Medical.SystemName": {
              type: 'string',
              description: 'Name of Health System'
            },
            "MultiFamily.ProjectType": {
              type: 'array',
              description: 'MultiFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "MultiFamily.ProductType": {
              type: 'array',
              description: 'Product Type.  See [/common/lists/61](/common/lists/61)'
            },
            "MultiFamily.SeniorHousingType": {
              type: 'array',
              description: 'See [/common/lists/121](/common/lists/121)'
            },
            "MultiFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  Applies to MultiFamily.  See [/common/lists/64](/common/lists/64)'
            },
            "MultiFamily.BuildingType": {
              type: 'array',
              description: 'See [/common/lists/63](/common/lists/63)'
            },
            "Retail.Chain": {
              type: 'array',
              description: 'See [/common/lists/retail-chains](/common/lists/retail-chains)'
            },
            "Retail.FootPrint": {
              type: 'array',
              description: 'See [/common/lists/157](/common/lists/157)'
            },
            "Retail.DevelopmentType": {
              type: 'array',
              description: 'See [/common/lists/158](/common/lists/158)'
            },
            "Retail.ChainCompanyName": {
              type: 'string',
              description: ''
            },
            "SingleFamily.Acreage": {
              type: 'array',
              description: 'See [/common/lists/149](/common/lists/149)'
            },
            "SingleFamily.UnitCount": {
              type: 'array',
              description: 'Number of units.  See [/common/lists/64](/common/lists/64)'
            },
            "SingleFamily.Price": {
              type: 'array',
              description: 'See [/common/lists/150](/common/lists/150)'
            },
            "SingleFamily.Amenity": {
              type: 'array',
              description: 'See [/common/lists/152](/common/lists/152)'
            },
            "SingleFamily.ProjectType": {
              type: 'array',
              description: 'SingleFamily Project Type.  See [/common/lists/59](/common/lists/59)'
            },
            "SingleFamily.ProductType": {
              type: 'array',
              description: 'See [/common/lists/61](/common/lists/61)'
            },
            "Energy.PowerOutput": {
              type: 'array',
              description: 'Power output in megawatts (MW).  See [/common/lists/163](/common/lists/163)'
            },
            "Energy.PowerGrid": {
              type: 'array',
              description: 'North American power transmission grid/interconnection.  See [/common/lists/164](/common/lists/164)'
            },
            "Energy.WindTurbineCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.WindTurbineCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMin": {
              type: 'integer',
              description: ''
            },
            "Energy.SolarPanelCountMax": {
              type: 'integer',
              description: ''
            },
            "Energy.PowerOutputMin": {
              type: 'number',
              description: 'Power Output (MW) minimum'
            },
            "Energy.PowerOutputMax": {
              type: 'number',
              description: 'Power Output (MW) maximum'
            },
            "Energy.QueueNumber": {
              type: 'string',
              description: ''
            },
            "Energy.SizeMin": {
              type: 'integer',
              description: 'Facility Size minimum'
            },
            "Energy.SizeMax": {
              type: 'integer',
              description: 'Facility Size maximum'
            },
            "Infrastructure.RequestType": {
              type: 'array',
              description: 'See [/common/lists/170](/common/lists/170)'
            },
            "Infrastructure.FundingType": {
              type: 'array',
              description: 'See [/common/lists/171](/common/lists/171)'
            },
            "Infrastructure.MaterialType": {
              type: 'array',
              description: 'See [/common/lists/172](/common/lists/172)'
            },
            "Infrastructure.Category": {
              type: 'array',
              description: 'See [/common/lists/173](/common/lists/173)'
            },
            "Infrastructure.DocumentFeeMin": {
              type: 'number',
              description: 'Document Fee minimum'
            },
            "Infrastructure.DocumentFeeMax": {
              type: 'number',
              description: 'Document Fee maximum'
            },
            "Mining.Resource": {
              type: 'array',
              description: 'See [/common/lists/166](/common/lists/166)'
            },
            "Mining.MiningType": {
              type: 'array',
              description: 'See [/common/lists/167](/common/lists/167)'
            },
            "Mining.Stage": {
              type: 'array',
              description: 'See [/common/lists/168](/common/lists/168)'
            },
            "Contact.ContactId": {
              type: 'integer',
              description: ''
            },
            "Contact.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.LocationId": {
              type: 'integer',
              description: ''
            },
            "Contact.NameId": {
              type: 'integer',
              description: ''
            },
            "Contact.ParentObjectId": {
              type: 'integer',
              description: ''
            },
            "Contact.Company.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Company.Name": {
              type: 'string',
              description: ''
            },
            "Contact.Company.Url": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.NameId": {
              type: 'array',
              description: ''
            },
            "Contact.ContactName.CompanyId": {
              type: 'integer',
              description: ''
            },
            "Contact.ContactName.FullName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.FirstName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.LastName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.MiddleName": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Title": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.PhoneExt": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.Email": {
              type: 'string',
              description: ''
            },
            "Contact.ContactName.ContainsField": {
              type: 'array',
              description: 'See [/common/lists/80](/common/lists/80)'
            },
            "Contact.Location.LocationId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.CompanyId": {
              type: 'array',
              description: ''
            },
            "Contact.Location.Address1": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Address2": {
              type: 'string',
              description: ''
            },
            "Contact.Location.City": {
              type: 'string',
              description: ''
            },
            "Contact.Location.State": {
              type: 'array',
              description: ''
            },
            "Contact.Location.PostalCode": {
              type: 'string',
              description: ''
            },
            "Contact.Location.County": {
              type: 'array',
              description: 'See [/common/lists/states/CA/counties](/common/lists/states/CA/counties)'
            },
            "Contact.Location.Country": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Latitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Longitude": {
              type: 'number',
              description: ''
            },
            "Contact.Location.Phone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Fax": {
              type: 'string',
              description: ''
            },
            "Contact.Location.TollFree": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CellPhone": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Email": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Url": {
              type: 'string',
              description: ''
            },
            "Contact.Location.LocationName": {
              type: 'string',
              description: ''
            },
            "Contact.Location.Description": {
              type: 'string',
              description: ''
            },
            "Contact.Location.DunsNumber": {
              type: 'string',
              description: ''
            },
            "Contact.Location.CategoryType": {
              type: 'array',
              description: '2-Headquarters, 999-Any'
            },
            "Contact.Role": {
              type: 'array',
              description: 'See [/common/lists/75](/common/lists/75)'
            },
            "Contact.Keyword": {
              type: 'string',
              description: ''
            },
            "Contact.Keywords": {
              type: 'array',
              description: ''
            },
            "Contact.KeywordsIn": {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            "Contact.KeywordMatchType": {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            "Contact.KeywordLocation": {
              type: 'string',
              description: ''
            },
            "Contact.SortBy": {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            "Contact.SortOrder": {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            "Contact.PageSize": {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            "Contact.Page": {
              type: 'integer',
              description: 'Page Number'
            },
            "Contact.QueryRecordCount": {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            "Contact.CustomParameters": {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            DistanceMiles: {
              type: 'number',
              description: 'Distance in miles from coordinates.  Set GeographyPolygon to one coordinate.'
            },
            GeographyPolygon: {
              type: 'string',
              description: 'Coordinates.  E.g. -122.031577 47.578581,-122.031577 47.678581,-122.131577 47.678581,-122.031577 47.578581'
            },
            Folder: {
              type: 'array',
              description: 'Authenticated user&#x27;s folder IDs.  See [/common/lists/5000](/common/lists/5000)'
            },
            Keyword: {
              type: 'string',
              description: ''
            },
            Keywords: {
              type: 'array',
              description: ''
            },
            KeywordsIn: {
              type: 'array',
              description: 'Each keywordsIn must have corresponding index in keywords.  See [/common/lists/81](/common/lists/81)'
            },
            KeywordMatchType: {
              type: 'integer',
              description: 'See [/common/lists/82](/common/lists/82)'
            },
            KeywordLocation: {
              type: 'string',
              description: ''
            },
            SortBy: {
              type: 'string',
              description: 'See [/common/lists/36](/common/lists/36)'
            },
            SortOrder: {
              type: 'string',
              description: 'See [/common/lists/23](/common/lists/23)'
            },
            PageSize: {
              type: 'integer',
              description: 'The number of records to return in one query call.'
            },
            Page: {
              type: 'integer',
              description: 'Page Number'
            },
            QueryRecordCount: {
              type: 'integer',
              description: 'The number of records returned by a query.  Set this value in pagination queries to improve performance.  E.g. Set QueryRecordCount to RecordCount value returned by query&#x27;s page 1 results.'
            },
            CustomParameters: {
              type: 'string',
              description: 'Custom Parameters.  Set to &#x27;LoadAllReports:true&#x27; to include all reports outside subscription.  Reports outside subscription are in preview mode.'
            },
            includeBuildingReport: {
              type: 'boolean',
              description: 'Include construction project information with the search results.'
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_people_follow',
        description: 'Create a Person Following',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: {
              type: 'integer',
              description: ''
            },
            typeId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['folderId','body']
        }
      },
      {
        name: 'constructionwire_people_unfollow',
        description: 'Delete a Person Following',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_folders_list',
        description: 'List Folders',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_folders_create',
        description: 'Create a Folder',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_folders_get',
        description: 'Get a Folder',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['folderId']
        }
      },
      {
        name: 'constructionwire_folders_update',
        description: 'Update a Folder',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['folderId','body']
        }
      },
      {
        name: 'constructionwire_folders_delete',
        description: 'Delete a Folder',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['folderId']
        }
      },
      {
        name: 'constructionwire_folders_add_item',
        description: 'Save Items to a Folder',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: {
              type: 'integer',
              description: ''
            },
            typeId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['folderId','body']
        }
      },
      {
        name: 'constructionwire_notes_list',
        description: 'List Notes',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['reportId']
        }
      },
      {
        name: 'constructionwire_notes_create',
        description: 'Create a Note',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_notes_get',
        description: 'Get a Note',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['noteId','reportId']
        }
      },
      {
        name: 'constructionwire_notes_update',
        description: 'Update a Note',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['noteId','body']
        }
      },
      {
        name: 'constructionwire_notes_delete',
        description: 'Delete a Note',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['noteId']
        }
      },
      {
        name: 'constructionwire_news_list',
        description: 'List Product News',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_news_get',
        description: 'Get a Product News',
        inputSchema: {
          type: 'object',
          properties: {
            entryId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['entryId']
        }
      },
      {
        name: 'constructionwire_searches_list',
        description: 'List Saved Searches',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_searches_create',
        description: 'Create a Saved Search',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_searches_get',
        description: 'Get a Saved Search',
        inputSchema: {
          type: 'object',
          properties: {
            searchId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['searchId']
        }
      },
      {
        name: 'constructionwire_searches_update',
        description: 'Update a Saved Search',
        inputSchema: {
          type: 'object',
          properties: {
            searchId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['searchId','body']
        }
      },
      {
        name: 'constructionwire_subscriptions_create_free',
        description: 'Create a Free Subscription',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_subscriptions_usage',
        description: 'List Subscription Usage Reports',
        inputSchema: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              description: 'Page Number'
            },
            dateMin: {
              type: 'string',
              description: ''
            },
            dateMax: {
              type: 'string',
              description: ''
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_tasks_list',
        description: 'List Tasks',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['reportId']
        }
      },
      {
        name: 'constructionwire_tasks_create',
        description: 'Create a Task',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_tasks_get',
        description: 'Get a Task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'integer',
              description: ''
            },
            reportId: {
              type: 'integer',
              description: 'The unique identifier for the Project.'
            }
          },
          required: ['taskId','reportId']
        }
      },
      {
        name: 'constructionwire_tasks_update',
        description: 'Update a Task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'integer',
              description: ''
            },
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['taskId','body']
        }
      },
      {
        name: 'constructionwire_tasks_delete',
        description: 'Delete a Task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'integer',
              description: ''
            }
          },
          required: ['taskId']
        }
      },
      {
        name: 'constructionwire_auth_login',
        description: 'Create an Access Token',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'object',
              description: 'Request body data'
            }
          },
          required: ['body']
        }
      },
      {
        name: 'constructionwire_auth_details',
        description: 'List Authenticated Session Details',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_auth_logout',
        description: 'Logout from Authenticated Session',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_auth_subscription',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_common_get_list',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
            listId: {
              type: 'integer',
              description: 'See [/common/lists/999](/common/lists/999)'
            },
            id: {
              type: 'array',
              description: 'See listId'
            }
          },
          required: ['listId']
        }
      },
      {
        name: 'constructionwire_common_retail_chains',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: ''
            },
            option: {
              type: 'string',
              description: ''
            }
          },
          required: []
        }
      },
      {
        name: 'constructionwire_common_states',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      },
      {
        name: 'constructionwire_common_counties',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
            stateAbbr: {
              type: 'string',
              description: ''
            },
            state: {
              type: 'array',
              description: 'See [/common/lists/8](/common/lists/8)'
            }
          },
          required: ['stateAbbr']
        }
      },
      {
        name: 'constructionwire_common_regions',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
          },
          required: []
        }
      }
    ];
  }

  canHandle(toolName: string): boolean {
    const supportedTools: string[] = [
      'constructionwire_reports_list',
      'constructionwire_reports_get',
      'constructionwire_reports_files',
      'constructionwire_reports_file',
      'constructionwire_reports_notes',
      'constructionwire_reports_note',
      'constructionwire_reports_questions',
      'constructionwire_reports_add_question',
      'constructionwire_reports_question',
      'constructionwire_reports_answers',
      'constructionwire_reports_answer',
      'constructionwire_reports_tasks',
      'constructionwire_reports_task',
      'constructionwire_reports_facets',
      'constructionwire_reports_file_terms',
      'constructionwire_reports_add_file_terms',
      'constructionwire_reports_follow',
      'constructionwire_reports_unfollow',
      'constructionwire_reports_following',
      'constructionwire_reports_all_questions',
      'constructionwire_companies_list',
      'constructionwire_companies_get',
      'constructionwire_companies_locations',
      'constructionwire_companies_location',
      'constructionwire_companies_people',
      'constructionwire_companies_projects',
      'constructionwire_companies_relationships',
      'constructionwire_companies_stats',
      'constructionwire_companies_facets',
      'constructionwire_companies_following',
      'constructionwire_companies_follow',
      'constructionwire_companies_unfollow',
      'constructionwire_companies_all_locations',
      'constructionwire_people_list',
      'constructionwire_people_get',
      'constructionwire_people_projects',
      'constructionwire_people_relationships',
      'constructionwire_people_stats',
      'constructionwire_people_facets',
      'constructionwire_people_following',
      'constructionwire_people_follow',
      'constructionwire_people_unfollow',
      'constructionwire_folders_list',
      'constructionwire_folders_create',
      'constructionwire_folders_get',
      'constructionwire_folders_update',
      'constructionwire_folders_delete',
      'constructionwire_folders_add_item',
      'constructionwire_notes_list',
      'constructionwire_notes_create',
      'constructionwire_notes_get',
      'constructionwire_notes_update',
      'constructionwire_notes_delete',
      'constructionwire_news_list',
      'constructionwire_news_get',
      'constructionwire_searches_list',
      'constructionwire_searches_create',
      'constructionwire_searches_get',
      'constructionwire_searches_update',
      'constructionwire_subscriptions_create_free',
      'constructionwire_subscriptions_usage',
      'constructionwire_tasks_list',
      'constructionwire_tasks_create',
      'constructionwire_tasks_get',
      'constructionwire_tasks_update',
      'constructionwire_tasks_delete',
      'constructionwire_auth_login',
      'constructionwire_auth_details',
      'constructionwire_auth_logout',
      'constructionwire_auth_subscription',
      'constructionwire_common_get_list',
      'constructionwire_common_retail_chains',
      'constructionwire_common_states',
      'constructionwire_common_counties',
      'constructionwire_common_regions'
    ];
    return supportedTools.includes(toolName);
  }

  async executeTool(name: string, args: any, context?: RequestContext, progressReporter?: ProgressReporter): Promise<any> {
    const startTime = Date.now();
    
    this.logger.logToolStart(name, args);
    
    // Check for early cancellation
    if (context?.abortController.signal.aborted) {
      this.logger.info('TOOL_CANCELLED_EARLY', 'Tool execution cancelled before start', {
        tool: name,
        requestId: context.requestId
      });
      throw new Error('Request was cancelled');
    }
    
    await this.ensureInitialized();
    
    // Validate tool is supported
    if (!this.canHandle(name)) {
      this.logger.error('TOOL_ERROR', 'Unknown tool requested', {
        tool: name,
        supportedTools: ['constructionwire_reports_list', 'constructionwire_reports_get', 'constructionwire_reports_files', 'constructionwire_reports_file', 'constructionwire_reports_notes', 'constructionwire_reports_note', 'constructionwire_reports_questions', 'constructionwire_reports_add_question', 'constructionwire_reports_question', 'constructionwire_reports_answers', 'constructionwire_reports_answer', 'constructionwire_reports_tasks', 'constructionwire_reports_task', 'constructionwire_reports_facets', 'constructionwire_reports_file_terms', 'constructionwire_reports_add_file_terms', 'constructionwire_reports_follow', 'constructionwire_reports_unfollow', 'constructionwire_reports_following', 'constructionwire_reports_all_questions', 'constructionwire_companies_list', 'constructionwire_companies_get', 'constructionwire_companies_locations', 'constructionwire_companies_location', 'constructionwire_companies_people', 'constructionwire_companies_projects', 'constructionwire_companies_relationships', 'constructionwire_companies_stats', 'constructionwire_companies_facets', 'constructionwire_companies_following', 'constructionwire_companies_follow', 'constructionwire_companies_unfollow', 'constructionwire_companies_all_locations', 'constructionwire_people_list', 'constructionwire_people_get', 'constructionwire_people_projects', 'constructionwire_people_relationships', 'constructionwire_people_stats', 'constructionwire_people_facets', 'constructionwire_people_following', 'constructionwire_people_follow', 'constructionwire_people_unfollow', 'constructionwire_folders_list', 'constructionwire_folders_create', 'constructionwire_folders_get', 'constructionwire_folders_update', 'constructionwire_folders_delete', 'constructionwire_folders_add_item', 'constructionwire_notes_list', 'constructionwire_notes_create', 'constructionwire_notes_get', 'constructionwire_notes_update', 'constructionwire_notes_delete', 'constructionwire_news_list', 'constructionwire_news_get', 'constructionwire_searches_list', 'constructionwire_searches_create', 'constructionwire_searches_get', 'constructionwire_searches_update', 'constructionwire_subscriptions_create_free', 'constructionwire_subscriptions_usage', 'constructionwire_tasks_list', 'constructionwire_tasks_create', 'constructionwire_tasks_get', 'constructionwire_tasks_update', 'constructionwire_tasks_delete', 'constructionwire_auth_login', 'constructionwire_auth_details', 'constructionwire_auth_logout', 'constructionwire_auth_subscription', 'constructionwire_common_get_list', 'constructionwire_common_retail_chains', 'constructionwire_common_states', 'constructionwire_common_counties', 'constructionwire_common_regions']
      });
      throw new Error(`Unknown tool: ${name}`);
    }
    
    // Validate required parameters
    this.logger.debug('PARAM_VALIDATION', 'Validating tool parameters', {
      tool: name,
      providedArgs: Object.keys(args || {})
    });
    
    try {
      let result;
      
      // Create request options with cancellation and progress support
      const requestOptions = {
        signal: context?.abortController.signal,
        onProgress: context?.progressToken && progressReporter ? 
          progressReporter.createProgressCallback(context.progressToken) : 
          undefined
      };
      
      switch (name) {
        case 'constructionwire_reports_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_list',
            clientMethod: 'reportsList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_list operation...`
            });
          }
          
          result = await this.client.reportsList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_list operation`
            });
          }
          break;
        case 'constructionwire_reports_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_get',
            clientMethod: 'reportsGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_get operation...`
            });
          }
          
          result = await this.client.reportsGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_get operation`
            });
          }
          break;
        case 'constructionwire_reports_files':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_files',
            clientMethod: 'reportsFiles',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_files operation...`
            });
          }
          
          result = await this.client.reportsFiles(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_files operation`
            });
          }
          break;
        case 'constructionwire_reports_file':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_file',
            clientMethod: 'reportsFile',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_file operation...`
            });
          }
          
          result = await this.client.reportsFile(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_file operation`
            });
          }
          break;
        case 'constructionwire_reports_notes':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_notes',
            clientMethod: 'reportsNotes',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_notes operation...`
            });
          }
          
          result = await this.client.reportsNotes(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_notes operation`
            });
          }
          break;
        case 'constructionwire_reports_note':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_note',
            clientMethod: 'reportsNote',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_note operation...`
            });
          }
          
          result = await this.client.reportsNote(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_note operation`
            });
          }
          break;
        case 'constructionwire_reports_questions':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_questions',
            clientMethod: 'reportsQuestions',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_questions operation...`
            });
          }
          
          result = await this.client.reportsQuestions(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_questions operation`
            });
          }
          break;
        case 'constructionwire_reports_add_question':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_add_question',
            clientMethod: 'reportsAddQuestion',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_add_question operation...`
            });
          }
          
          result = await this.client.reportsAddQuestion(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_add_question operation`
            });
          }
          break;
        case 'constructionwire_reports_question':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_question',
            clientMethod: 'reportsQuestion',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_question operation...`
            });
          }
          
          result = await this.client.reportsQuestion(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_question operation`
            });
          }
          break;
        case 'constructionwire_reports_answers':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_answers',
            clientMethod: 'reportsAnswers',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_answers operation...`
            });
          }
          
          result = await this.client.reportsAnswers(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_answers operation`
            });
          }
          break;
        case 'constructionwire_reports_answer':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_answer',
            clientMethod: 'reportsAnswer',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_answer operation...`
            });
          }
          
          result = await this.client.reportsAnswer(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_answer operation`
            });
          }
          break;
        case 'constructionwire_reports_tasks':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_tasks',
            clientMethod: 'reportsTasks',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_tasks operation...`
            });
          }
          
          result = await this.client.reportsTasks(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_tasks operation`
            });
          }
          break;
        case 'constructionwire_reports_task':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_task',
            clientMethod: 'reportsTask',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_task operation...`
            });
          }
          
          result = await this.client.reportsTask(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_task operation`
            });
          }
          break;
        case 'constructionwire_reports_facets':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_facets',
            clientMethod: 'reportsFacets',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_facets operation...`
            });
          }
          
          result = await this.client.reportsFacets(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_facets operation`
            });
          }
          break;
        case 'constructionwire_reports_file_terms':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_file_terms',
            clientMethod: 'reportsFileTerms',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_file_terms operation...`
            });
          }
          
          result = await this.client.reportsFileTerms(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_file_terms operation`
            });
          }
          break;
        case 'constructionwire_reports_add_file_terms':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_add_file_terms',
            clientMethod: 'reportsAddFileTerms',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_add_file_terms operation...`
            });
          }
          
          result = await this.client.reportsAddFileTerms(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_add_file_terms operation`
            });
          }
          break;
        case 'constructionwire_reports_follow':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_follow',
            clientMethod: 'reportsFollow',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_follow operation...`
            });
          }
          
          result = await this.client.reportsFollow(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_follow operation`
            });
          }
          break;
        case 'constructionwire_reports_unfollow':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_unfollow',
            clientMethod: 'reportsUnfollow',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_unfollow operation...`
            });
          }
          
          result = await this.client.reportsUnfollow(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_unfollow operation`
            });
          }
          break;
        case 'constructionwire_reports_following':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_following',
            clientMethod: 'reportsFollowing',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_following operation...`
            });
          }
          
          result = await this.client.reportsFollowing(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_following operation`
            });
          }
          break;
        case 'constructionwire_reports_all_questions':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_reports_all_questions',
            clientMethod: 'reportsAllQuestions',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting reports_all_questions operation...`
            });
          }
          
          result = await this.client.reportsAllQuestions(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed reports_all_questions operation`
            });
          }
          break;
        case 'constructionwire_companies_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_list',
            clientMethod: 'companiesList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_list operation...`
            });
          }
          
          result = await this.client.companiesList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_list operation`
            });
          }
          break;
        case 'constructionwire_companies_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_get',
            clientMethod: 'companiesGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_get operation...`
            });
          }
          
          result = await this.client.companiesGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_get operation`
            });
          }
          break;
        case 'constructionwire_companies_locations':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_locations',
            clientMethod: 'companiesLocations',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_locations operation...`
            });
          }
          
          result = await this.client.companiesLocations(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_locations operation`
            });
          }
          break;
        case 'constructionwire_companies_location':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_location',
            clientMethod: 'companiesLocation',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_location operation...`
            });
          }
          
          result = await this.client.companiesLocation(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_location operation`
            });
          }
          break;
        case 'constructionwire_companies_people':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_people',
            clientMethod: 'companiesPeople',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_people operation...`
            });
          }
          
          result = await this.client.companiesPeople(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_people operation`
            });
          }
          break;
        case 'constructionwire_companies_projects':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_projects',
            clientMethod: 'companiesProjects',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_projects operation...`
            });
          }
          
          result = await this.client.companiesProjects(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_projects operation`
            });
          }
          break;
        case 'constructionwire_companies_relationships':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_relationships',
            clientMethod: 'companiesRelationships',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_relationships operation...`
            });
          }
          
          result = await this.client.companiesRelationships(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_relationships operation`
            });
          }
          break;
        case 'constructionwire_companies_stats':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_stats',
            clientMethod: 'companiesStats',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_stats operation...`
            });
          }
          
          result = await this.client.companiesStats(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_stats operation`
            });
          }
          break;
        case 'constructionwire_companies_facets':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_facets',
            clientMethod: 'companiesFacets',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_facets operation...`
            });
          }
          
          result = await this.client.companiesFacets(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_facets operation`
            });
          }
          break;
        case 'constructionwire_companies_following':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_following',
            clientMethod: 'companiesFollowing',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_following operation...`
            });
          }
          
          result = await this.client.companiesFollowing(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_following operation`
            });
          }
          break;
        case 'constructionwire_companies_follow':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_follow',
            clientMethod: 'companiesFollow',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_follow operation...`
            });
          }
          
          result = await this.client.companiesFollow(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_follow operation`
            });
          }
          break;
        case 'constructionwire_companies_unfollow':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_unfollow',
            clientMethod: 'companiesUnfollow',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_unfollow operation...`
            });
          }
          
          result = await this.client.companiesUnfollow(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_unfollow operation`
            });
          }
          break;
        case 'constructionwire_companies_all_locations':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_companies_all_locations',
            clientMethod: 'companiesAllLocations',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting companies_all_locations operation...`
            });
          }
          
          result = await this.client.companiesAllLocations(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed companies_all_locations operation`
            });
          }
          break;
        case 'constructionwire_people_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_list',
            clientMethod: 'peopleList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_list operation...`
            });
          }
          
          result = await this.client.peopleList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_list operation`
            });
          }
          break;
        case 'constructionwire_people_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_get',
            clientMethod: 'peopleGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_get operation...`
            });
          }
          
          result = await this.client.peopleGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_get operation`
            });
          }
          break;
        case 'constructionwire_people_projects':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_projects',
            clientMethod: 'peopleProjects',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_projects operation...`
            });
          }
          
          result = await this.client.peopleProjects(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_projects operation`
            });
          }
          break;
        case 'constructionwire_people_relationships':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_relationships',
            clientMethod: 'peopleRelationships',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_relationships operation...`
            });
          }
          
          result = await this.client.peopleRelationships(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_relationships operation`
            });
          }
          break;
        case 'constructionwire_people_stats':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_stats',
            clientMethod: 'peopleStats',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_stats operation...`
            });
          }
          
          result = await this.client.peopleStats(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_stats operation`
            });
          }
          break;
        case 'constructionwire_people_facets':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_facets',
            clientMethod: 'peopleFacets',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_facets operation...`
            });
          }
          
          result = await this.client.peopleFacets(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_facets operation`
            });
          }
          break;
        case 'constructionwire_people_following':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_following',
            clientMethod: 'peopleFollowing',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_following operation...`
            });
          }
          
          result = await this.client.peopleFollowing(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_following operation`
            });
          }
          break;
        case 'constructionwire_people_follow':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_follow',
            clientMethod: 'peopleFollow',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_follow operation...`
            });
          }
          
          result = await this.client.peopleFollow(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_follow operation`
            });
          }
          break;
        case 'constructionwire_people_unfollow':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_people_unfollow',
            clientMethod: 'peopleUnfollow',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting people_unfollow operation...`
            });
          }
          
          result = await this.client.peopleUnfollow(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed people_unfollow operation`
            });
          }
          break;
        case 'constructionwire_folders_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_folders_list',
            clientMethod: 'foldersList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting folders_list operation...`
            });
          }
          
          result = await this.client.foldersList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed folders_list operation`
            });
          }
          break;
        case 'constructionwire_folders_create':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_folders_create',
            clientMethod: 'foldersCreate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting folders_create operation...`
            });
          }
          
          result = await this.client.foldersCreate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed folders_create operation`
            });
          }
          break;
        case 'constructionwire_folders_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_folders_get',
            clientMethod: 'foldersGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting folders_get operation...`
            });
          }
          
          result = await this.client.foldersGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed folders_get operation`
            });
          }
          break;
        case 'constructionwire_folders_update':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_folders_update',
            clientMethod: 'foldersUpdate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting folders_update operation...`
            });
          }
          
          result = await this.client.foldersUpdate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed folders_update operation`
            });
          }
          break;
        case 'constructionwire_folders_delete':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_folders_delete',
            clientMethod: 'foldersDelete',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting folders_delete operation...`
            });
          }
          
          result = await this.client.foldersDelete(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed folders_delete operation`
            });
          }
          break;
        case 'constructionwire_folders_add_item':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_folders_add_item',
            clientMethod: 'foldersAddItem',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting folders_add_item operation...`
            });
          }
          
          result = await this.client.foldersAddItem(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed folders_add_item operation`
            });
          }
          break;
        case 'constructionwire_notes_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_notes_list',
            clientMethod: 'notesList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting notes_list operation...`
            });
          }
          
          result = await this.client.notesList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed notes_list operation`
            });
          }
          break;
        case 'constructionwire_notes_create':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_notes_create',
            clientMethod: 'notesCreate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting notes_create operation...`
            });
          }
          
          result = await this.client.notesCreate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed notes_create operation`
            });
          }
          break;
        case 'constructionwire_notes_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_notes_get',
            clientMethod: 'notesGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting notes_get operation...`
            });
          }
          
          result = await this.client.notesGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed notes_get operation`
            });
          }
          break;
        case 'constructionwire_notes_update':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_notes_update',
            clientMethod: 'notesUpdate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting notes_update operation...`
            });
          }
          
          result = await this.client.notesUpdate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed notes_update operation`
            });
          }
          break;
        case 'constructionwire_notes_delete':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_notes_delete',
            clientMethod: 'notesDelete',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting notes_delete operation...`
            });
          }
          
          result = await this.client.notesDelete(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed notes_delete operation`
            });
          }
          break;
        case 'constructionwire_news_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_news_list',
            clientMethod: 'newsList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting news_list operation...`
            });
          }
          
          result = await this.client.newsList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed news_list operation`
            });
          }
          break;
        case 'constructionwire_news_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_news_get',
            clientMethod: 'newsGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting news_get operation...`
            });
          }
          
          result = await this.client.newsGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed news_get operation`
            });
          }
          break;
        case 'constructionwire_searches_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_searches_list',
            clientMethod: 'searchesList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting searches_list operation...`
            });
          }
          
          result = await this.client.searchesList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed searches_list operation`
            });
          }
          break;
        case 'constructionwire_searches_create':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_searches_create',
            clientMethod: 'searchesCreate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting searches_create operation...`
            });
          }
          
          result = await this.client.searchesCreate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed searches_create operation`
            });
          }
          break;
        case 'constructionwire_searches_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_searches_get',
            clientMethod: 'searchesGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting searches_get operation...`
            });
          }
          
          result = await this.client.searchesGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed searches_get operation`
            });
          }
          break;
        case 'constructionwire_searches_update':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_searches_update',
            clientMethod: 'searchesUpdate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting searches_update operation...`
            });
          }
          
          result = await this.client.searchesUpdate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed searches_update operation`
            });
          }
          break;
        case 'constructionwire_subscriptions_create_free':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_subscriptions_create_free',
            clientMethod: 'subscriptionsCreateFree',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting subscriptions_create_free operation...`
            });
          }
          
          result = await this.client.subscriptionsCreateFree(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed subscriptions_create_free operation`
            });
          }
          break;
        case 'constructionwire_subscriptions_usage':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_subscriptions_usage',
            clientMethod: 'subscriptionsUsage',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting subscriptions_usage operation...`
            });
          }
          
          result = await this.client.subscriptionsUsage(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed subscriptions_usage operation`
            });
          }
          break;
        case 'constructionwire_tasks_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_tasks_list',
            clientMethod: 'tasksList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting tasks_list operation...`
            });
          }
          
          result = await this.client.tasksList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed tasks_list operation`
            });
          }
          break;
        case 'constructionwire_tasks_create':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_tasks_create',
            clientMethod: 'tasksCreate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting tasks_create operation...`
            });
          }
          
          result = await this.client.tasksCreate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed tasks_create operation`
            });
          }
          break;
        case 'constructionwire_tasks_get':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_tasks_get',
            clientMethod: 'tasksGet',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting tasks_get operation...`
            });
          }
          
          result = await this.client.tasksGet(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed tasks_get operation`
            });
          }
          break;
        case 'constructionwire_tasks_update':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_tasks_update',
            clientMethod: 'tasksUpdate',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting tasks_update operation...`
            });
          }
          
          result = await this.client.tasksUpdate(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed tasks_update operation`
            });
          }
          break;
        case 'constructionwire_tasks_delete':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_tasks_delete',
            clientMethod: 'tasksDelete',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting tasks_delete operation...`
            });
          }
          
          result = await this.client.tasksDelete(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed tasks_delete operation`
            });
          }
          break;
        case 'constructionwire_auth_login':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_auth_login',
            clientMethod: 'authLogin',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting auth_login operation...`
            });
          }
          
          result = await this.client.authLogin(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed auth_login operation`
            });
          }
          break;
        case 'constructionwire_auth_details':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_auth_details',
            clientMethod: 'authDetails',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting auth_details operation...`
            });
          }
          
          result = await this.client.authDetails(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed auth_details operation`
            });
          }
          break;
        case 'constructionwire_auth_logout':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_auth_logout',
            clientMethod: 'authLogout',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting auth_logout operation...`
            });
          }
          
          result = await this.client.authLogout(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed auth_logout operation`
            });
          }
          break;
        case 'constructionwire_auth_subscription':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_auth_subscription',
            clientMethod: 'authSubscription',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting auth_subscription operation...`
            });
          }
          
          result = await this.client.authSubscription(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed auth_subscription operation`
            });
          }
          break;
        case 'constructionwire_common_get_list':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_common_get_list',
            clientMethod: 'commonGetList',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting common_get_list operation...`
            });
          }
          
          result = await this.client.commonGetList(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed common_get_list operation`
            });
          }
          break;
        case 'constructionwire_common_retail_chains':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_common_retail_chains',
            clientMethod: 'commonRetailChains',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting common_retail_chains operation...`
            });
          }
          
          result = await this.client.commonRetailChains(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed common_retail_chains operation`
            });
          }
          break;
        case 'constructionwire_common_states':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_common_states',
            clientMethod: 'commonStates',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting common_states operation...`
            });
          }
          
          result = await this.client.commonStates(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed common_states operation`
            });
          }
          break;
        case 'constructionwire_common_counties':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_common_counties',
            clientMethod: 'commonCounties',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting common_counties operation...`
            });
          }
          
          result = await this.client.commonCounties(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed common_counties operation`
            });
          }
          break;
        case 'constructionwire_common_regions':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'constructionwire_common_regions',
            clientMethod: 'commonRegions',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting common_regions operation...`
            });
          }
          
          result = await this.client.commonRegions(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed common_regions operation`
            });
          }
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.logToolSuccess(name, duration, result);

      // Return raw result for non-OAuth templates
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if error is due to cancellation
      const isCancelled = context?.abortController.signal.aborted || 
                         (error instanceof Error && error.message === 'Request was cancelled');
      
      if (isCancelled) {
        this.logger.info('TOOL_CANCELLED', 'Tool execution cancelled', {
          tool: name,
          duration_ms: duration,
          requestId: context?.requestId
        });
      } else {
        this.logger.logToolError(name, error, duration, args);
      }
      throw error;
    }
  }
}