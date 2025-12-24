# constructionwire-mcp

[![npm version](https://img.shields.io/npm/v/@west10tech/constructionwire-mcp.svg)](https://www.npmjs.com/package/@west10tech/constructionwire-mcp)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/w-10-m/COVERAGE_GIST_ID/raw/coverage.json)]()

MCP server with full ConstructionWire capabilities (75 endpoints)

**npm:** https://www.npmjs.com/package/@west10tech/constructionwire-mcp

This MCP server includes the following integrations:

## Available Tools

This MCP server provides 75 tools across 1 integrations:

### Constructionwire Tools
- **constructionwire_reports_list**: List Construction Projects. Returns minimal data appropriate for app search list views. To retrieve complete details, use endpoint /reports/{reportId}. Lets make sure PageSize is max 10.
- **constructionwire_reports_get**: Get a Construction Project. To retrieve multiple, use multiple id (e.g /reports/100?reportTypeId&#x3D;1&amp;id&#x3D;101&amp;id&#x3D;102).
- **constructionwire_reports_files**: List Project Files (e.g. Plans/Specs). Set keywordsIn&#x3D;12 in query to search files (e.g. /reports?reportType&#x3D;1&amp;keywords&#x3D;{term}&amp;keywordsIn&#x3D;12).
- **constructionwire_reports_file**: Get a Project File (e.g. Plans/Specs)
- **constructionwire_reports_notes**: List Project Notes
- **constructionwire_reports_note**: Get a Project Note
- **constructionwire_reports_questions**: List Project Questions
- **constructionwire_reports_add_question**: Create a Project Question
- **constructionwire_reports_question**: Get a Project Question
- **constructionwire_reports_answers**: List Answers to a Question
- **constructionwire_reports_answer**: Get an Answer to a Question
- **constructionwire_reports_tasks**: List Project Tasks
- **constructionwire_reports_task**: Get a Project Task
- **constructionwire_reports_facets**: List Construction Project Facets
- **constructionwire_reports_file_terms**: Get Terms and Conditions for Project Files
- **constructionwire_reports_add_file_terms**: Set request body to &quot;true&quot; to indicate that you read and agree to BuildCentral&#x27;s Terms and Conditions. Read terms at /2.0/reports/files/terms.
- **constructionwire_reports_follow**: Create a Project Following
- **constructionwire_reports_unfollow**: Delete a Project Following
- **constructionwire_reports_following**: List Project Followings
- **constructionwire_reports_all_questions**: List Project Questions
- **constructionwire_companies_list**: List Companies
- **constructionwire_companies_get**: Get a Company
- **constructionwire_companies_locations**: List Company Locations
- **constructionwire_companies_location**: Get a Company Location
- **constructionwire_companies_people**: List Company&#x27;s People
- **constructionwire_companies_projects**: List Company&#x27;s Project Activities
- **constructionwire_companies_relationships**: List Company&#x27;s Relationships
- **constructionwire_companies_stats**: List Company&#x27;s Stats
- **constructionwire_companies_facets**: List Company Facets
- **constructionwire_companies_following**: List Company Followings
- **constructionwire_companies_follow**: Create a Company Following
- **constructionwire_companies_unfollow**: Delete a Company Following
- **constructionwire_companies_all_locations**: List Locations of multiple Companies
- **constructionwire_people_list**: List People
- **constructionwire_people_get**: Get a Person
- **constructionwire_people_projects**: List Person&#x27;s Project Activities
- **constructionwire_people_relationships**: List Person&#x27;s Relationships
- **constructionwire_people_stats**: List Person&#x27;s Stats
- **constructionwire_people_facets**: List People Facets
- **constructionwire_people_following**: List People Followings
- **constructionwire_people_follow**: Create a Person Following
- **constructionwire_people_unfollow**: Delete a Person Following
- **constructionwire_folders_list**: List Folders
- **constructionwire_folders_create**: Create a Folder
- **constructionwire_folders_get**: Get a Folder
- **constructionwire_folders_update**: Update a Folder
- **constructionwire_folders_delete**: Delete a Folder
- **constructionwire_folders_add_item**: Save Items to a Folder
- **constructionwire_notes_list**: List Notes
- **constructionwire_notes_create**: Create a Note
- **constructionwire_notes_get**: Get a Note
- **constructionwire_notes_update**: Update a Note
- **constructionwire_notes_delete**: Delete a Note
- **constructionwire_news_list**: List Product News
- **constructionwire_news_get**: Get a Product News
- **constructionwire_searches_list**: List Saved Searches
- **constructionwire_searches_create**: Create a Saved Search
- **constructionwire_searches_get**: Get a Saved Search
- **constructionwire_searches_update**: Update a Saved Search
- **constructionwire_subscriptions_create_free**: Create a Free Subscription
- **constructionwire_subscriptions_usage**: List Subscription Usage Reports
- **constructionwire_tasks_list**: List Tasks
- **constructionwire_tasks_create**: Create a Task
- **constructionwire_tasks_get**: Get a Task
- **constructionwire_tasks_update**: Update a Task
- **constructionwire_tasks_delete**: Delete a Task
- **constructionwire_auth_login**: Create an Access Token
- **constructionwire_auth_details**: List Authenticated Session Details
- **constructionwire_auth_logout**: Logout from Authenticated Session
- **constructionwire_auth_subscription**: 
- **constructionwire_common_get_list**: 
- **constructionwire_common_retail_chains**: 
- **constructionwire_common_states**: 
- **constructionwire_common_counties**: 
- **constructionwire_common_regions**: 

## Installation

```bash
npm install @west10tech/constructionwire-mcp
```

## Environment Setup

Create a `.env` file with the following variables:

```env
CONSTRUCTIONWIRE_PASSWORD=your_constructionwire_password_here
CONSTRUCTIONWIRE_USERNAME=your_constructionwire_username_here
```

## Usage

### Running the server

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

### Using with Claude Desktop

Add this to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "constructionwire-mcp": {
      "command": "npx",
      "args": ["@west10tech/constructionwire-mcp"],
      "env": {
        "CONSTRUCTIONWIRE_PASSWORD": "your_constructionwire_password_here",
        "CONSTRUCTIONWIRE_USERNAME": "your_constructionwire_username_here"
      }
    }
  }
}
```

## Instructions for Fetching API Keys/Tokens
- **COMING SOON**

## Advanced Features

### Request Cancellation

This MCP server supports request cancellation according to the [MCP cancellation specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation). Clients can cancel in-progress requests by sending a `notifications/cancelled` message with the request ID.

When a request is cancelled:
- The server immediately stops processing the request
- Any ongoing API calls are aborted
- Resources are cleaned up
- No response is sent for the cancelled request

### Progress Notifications

The server supports progress notifications for long-running operations according to the [MCP progress specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress). 

To receive progress updates:
1. Include a `progressToken` in your request metadata
2. The server will send `notifications/progress` messages with:
   - Current progress value
   - Total value (when known)
   - Human-readable status messages

Progress is reported for:
- Multi-step operations
- Batch processing
- Long-running API calls
- File uploads/downloads

Example progress notification:
```json
{
  "method": "notifications/progress",
  "params": {
    "progressToken": "operation-123",
    "progress": 45,
    "total": 100,
    "message": "Processing item 45 of 100..."
  }
}
```

