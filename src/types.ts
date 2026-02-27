
export interface ServerConfig {
  name: string;
  version: string;
}

// Request tracking and cancellation types
export interface RequestContext {
  requestId: string;
  abortController: AbortController;
  progressToken?: string | number;
  startTime: number;
  toolName?: string;
}

// Progress notification types
export interface ProgressUpdate {
  progress: number;
  total?: number;
  message?: string;
}

export interface ProgressCallback {
  (update: ProgressUpdate): Promise<void>;
}

// Extended client options with cancellation and progress support
export interface RequestOptions {
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  progressInterval?: number;
}

// MCP tool result returned by all client methods
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

// Common pagination/filter parameters shared across list endpoints
export interface PaginationParams {
  PageNumber?: number;
  PageSize?: number;
}

// Common date range filter parameters
export interface DateRangeParams {
  PublishedUpdatedDateMin?: string;
  PublishedUpdatedDateMax?: string;
  PublishedUpdatedDateByDayCount?: number;
  UpdatedDateMin?: string;
  UpdatedDateMax?: string;
}

// Report list parameters
export interface ReportsListParams extends PaginationParams, DateRangeParams {
  ReportId?: number[];
  ReportType?: number[];
  City?: string;
  State?: string[];
  PostalCode?: string;
  County?: string[];
  Region?: string[];
  Country?: string[];
  ProjectStage?: number[];
  ProjectType?: number[];
  BuildingUse?: number[];
  Keyword?: string;
  SortBy?: string;
  SortDirection?: string;
}

// Report resource identifier params
export interface ReportIdParams {
  reportId: number;
}

export interface ReportFileParams extends ReportIdParams {
  fileId: number;
}

export interface ReportNoteParams extends ReportIdParams {
  noteId: number;
}

export interface ReportQuestionParams extends ReportIdParams {
  questionId: number;
}

export interface ReportAnswerParams extends ReportQuestionParams {
  answerId: number;
}

export interface ReportTaskParams extends ReportIdParams {
  taskId: number;
}

// Company parameters
export interface CompaniesListParams extends PaginationParams {
  CompanyId?: number[];
  CompanyName?: string;
  City?: string;
  State?: string[];
  PostalCode?: string;
  County?: string[];
  Keyword?: string;
  SortBy?: string;
  SortDirection?: string;
}

export interface CompanyIdParams {
  companyId: number;
}

export interface CompanyLocationParams extends CompanyIdParams {
  locationId: number;
}

// People parameters
export interface PeopleListParams extends PaginationParams {
  NameId?: number[];
  FirstName?: string;
  LastName?: string;
  CompanyName?: string;
  City?: string;
  State?: string[];
  Keyword?: string;
  SortBy?: string;
  SortDirection?: string;
}

export interface PersonIdParams {
  nameId: number;
}

// Folder parameters
export interface FolderIdParams {
  folderId: number;
}

export interface FolderCreateParams {
  Name: string;
  Description?: string;
}

export interface FolderUpdateParams extends FolderIdParams {
  Name?: string;
  Description?: string;
}

export interface FolderAddItemParams extends FolderIdParams {
  ItemType: string;
  ItemId: number;
}

// Note parameters
export interface NoteIdParams {
  noteId: number;
}

export interface NoteCreateParams {
  Title: string;
  Body?: string;
  ReportId?: number;
  CompanyId?: number;
  NameId?: number;
}

export interface NoteUpdateParams extends NoteIdParams {
  Title?: string;
  Body?: string;
}

// Task parameters
export interface TaskIdParams {
  taskId: number;
}

export interface TaskCreateParams {
  Title: string;
  Description?: string;
  DueDate?: string;
  ReportId?: number;
  CompanyId?: number;
  NameId?: number;
}

export interface TaskUpdateParams extends TaskIdParams {
  Title?: string;
  Description?: string;
  DueDate?: string;
  Status?: string;
}

// Saved search parameters
export interface SearchIdParams {
  searchId: number;
}

// Follow/unfollow parameters
export interface FollowParams {
  ItemId: number;
}

// Auth parameters
export interface AuthLoginParams {
  username: string;
  password: string;
}

// Common list parameters
export interface CommonListParams {
  listId: string;
}

export interface CommonCountyParams {
  stateAbbr: string;
}

// News parameters
export interface NewsIdParams {
  entryId: number;
}