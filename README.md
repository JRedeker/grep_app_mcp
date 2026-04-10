# Grep App MCP Server

A Model Context Protocol (MCP) server that provides powerful code search capabilities across public GitHub repositories using the grep.app API. Perfect for code discovery, learning from open source projects, and finding implementation examples.

## 🚀 Features

- **🔍 Advanced Code Search**: Search across millions of public repositories on GitHub
- **📁 File Retrieval**: Fetch specific files or batches of files from GitHub
- **🎯 Flexible Filtering**: Filter by language, repository, file path, and more  
- **📊 Multiple Output Formats**: JSON, numbered lists, or formatted text
- **⚡ Batch Operations**: Retrieve multiple files efficiently with concurrency control
- **🔄 Result Caching**: Cache search results for quick file retrieval
- **📝 Comprehensive Logging**: Built-in logging with daily rotation
- **🛡️ Rate Limit Resilience**: Automatic retry with exponential backoff, Retry-After header support, and concurrency limiting
- **⏱️ Request Timeouts**: 10s default timeout on all HTTP requests (grep.app and GitHub), configurable via environment variables
- **🔑 GitHub Token Support**: Authenticated GitHub API access (60 → 5,000 req/hr)

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Claude Code CLI

### Quick Start

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/JRedeker/grep_app_mcp.git
   cd grep_app_mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Test the server**
   ```bash
   # HTTP mode (recommended for development)
   ./run.sh http dev
   
   # or STDIO mode
   ./run.sh stdio dev
   ```

## 🔧 Adding to Claude Code

### Method 1: Using MCP Configuration

Add this server to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "grep_app": {
      "command": "node",
      "args": ["/path/to/grep_app_mcp/dist/server-stdio.js"],
      "env": {}
    }
  }
}
```

### Method 2: Using HTTP Transport

For HTTP mode, add to your configuration:

```json
{
  "mcpServers": {
    "grep_app": {
      "url": "http://localhost:8603/mcp"
    }
  }
}
```

Then start the server:
```bash
./run.sh http prod
```

## 📖 run.sh Usage

The `run.sh` script provides convenient ways to start the server:

### Basic Usage
```bash
./run.sh [mode] [environment]
```

### Modes
- **`http`** - HTTP server with streaming support (default)
- **`stdio`** - STDIO server for direct MCP integration

### Environments  
- **`dev`** - Development mode with hot reload (default)
- **`prod`** - Production mode (requires build step)

### Examples
```bash
# Development (default) - HTTP server with hot reload
./run.sh

# Development - HTTP server  
./run.sh http dev

# Production - HTTP server
./run.sh http prod

# Development - STDIO server
./run.sh stdio dev

# Production - STDIO server  
./run.sh stdio prod

# Show help
./run.sh help
```

### HTTP Endpoints (when using HTTP mode)
- **HTTP Streaming**: `http://localhost:8603/mcp`
- **Server-Sent Events**: `http://localhost:8603/sse`

## 🔨 Available Tools

### 1. searchCode
Search for code across public GitHub repositories.

**Parameters:**
- `query` (required) - Search query string
- `jsonOutput` - Return JSON format (default: false)
- `numberedOutput` - Return numbered list format (default: false)  
- `caseSensitive` - Case-sensitive search
- `useRegex` - Treat query as regex pattern
- `wholeWords` - Search whole words only
- `repoFilter` - Filter by repository name pattern
- `pathFilter` - Filter by file path pattern
- `langFilter` - Filter by programming language(s)

**Example:**
```json
{
  "query": "async function fetchData",
  "langFilter": "TypeScript,JavaScript",
  "numberedOutput": true
}
```

### 2. github_file
Fetch a single file from a GitHub repository.

**Parameters:**
- `owner` (required) - Repository owner
- `repo` (required) - Repository name
- `path` (required) - File path
- `ref` (optional) - Branch/commit/tag reference

**Example:**
```json
{
  "owner": "microsoft",
  "repo": "vscode", 
  "path": "src/vs/editor/editor.api.ts"
}
```

### 3. github_batch_files
Fetch multiple files from GitHub repositories in parallel.

**Parameters:**
- `files` (required) - Array of file objects with owner, repo, path, and optional ref

**Example:**
```json
{
  "files": [
    {"owner": "facebook", "repo": "react", "path": "packages/react/index.js"},
    {"owner": "microsoft", "repo": "TypeScript", "path": "src/compiler/types.ts"}
  ]
}
```

### 4. batch_retrieve_files
Retrieve files from previously cached search results.

**Parameters:**
- `query` (required) - Original search query
- `resultNumbers` (optional) - Array of result indices to retrieve

**Example:**
```json
{
  "query": "tower_governor",
  "resultNumbers": [1, 2, 3]
}
```

## 🛡️ Rate Limit Resilience

The server includes built-in protection against API rate limits on both the grep.app and GitHub APIs.

### Automatic Retry with Backoff

All API calls are wrapped with retry logic that:
- **Retries on HTTP 429** (Too Many Requests) and **5xx** (Server errors)
- **Retries on HTTP 403** for GitHub secondary rate limits
- **Retries on network errors** (ECONNRESET, timeouts)
- Uses **exponential backoff with jitter** to avoid thundering herd
- Respects **Retry-After** headers (both seconds and HTTP date formats)
- Respects GitHub **x-ratelimit-reset** headers
- Configurable: max 3 retries, 1s base delay, 5s max delay

### Request Timeouts

All outbound HTTP requests include a **10-second timeout** by default to prevent indefinite hangs:

| Request Type | Env Variable | Default |
|---|---|---|
| grep.app search | `GREP_APP_TIMEOUT_MS` | `10000` (10s) |
| GitHub API (Octokit) | `GITHUB_API_TIMEOUT_MS` | `10000` (10s) |

Override in your environment or MCP configuration:

```bash
export GREP_APP_TIMEOUT_MS=15000      # 15s for grep.app
export GITHUB_API_TIMEOUT_MS=20000    # 20s for GitHub API
```

Values must be positive integers; invalid values fall back to the 10s default.

### GitHub Authentication

Set `GITHUB_TOKEN` to increase the GitHub API rate limit from 60 to 5,000 requests/hour:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

Or in your MCP configuration:

```json
{
  "mcpServers": {
    "grep_app": {
      "command": "node",
      "args": ["/path/to/grep_app_mcp/dist/server-stdio.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Without a token, the server falls back to unauthenticated mode (60 req/hr) and logs a warning.

### Concurrency Control

GitHub batch file fetches are limited to **5 concurrent requests** by default, preventing burst overload that triggers rate limits.

### Search Pagination Throttling

Sequential grep.app page fetches include a **300ms delay** between requests to avoid triggering rate limits during multi-page searches.

### Actionable Error Messages

When rate limits are exhausted after all retries, error messages include:
- Which API was rate-limited (grep.app or GitHub)
- How many retry attempts were made
- Suggested wait time before retrying

## 🎯 Common Workflows

### 1. Code Discovery
```bash
# Search for React hooks examples
searchCode("useEffect cleanup", langFilter: "JavaScript,TypeScript")

# Retrieve specific files from results  
batch_retrieve_files(query: "useEffect cleanup", resultNumbers: [1, 3, 5])
```

### 2. Learning Patterns
```bash
# Find authentication implementations
searchCode("JWT authentication middleware", repoFilter: "*express*")

# Get specific implementation details
github_file(owner: "auth0", repo: "express-jwt", path: "lib/index.js")
```

### 3. API Research  
```bash
# Discover API patterns
searchCode("GraphQL resolver", pathFilter: "*/resolvers/*")

# Compare multiple implementations
github_batch_files([
  {owner: "apollographql", repo: "apollo-server", path: "packages/apollo-server-core/src/resolvers.ts"},
  {owner: "graphql", repo: "graphql-js", path: "src/execution/execute.js"}
])
```

## 📋 Development

### Available Scripts
- `npm run build` - Build TypeScript to JavaScript
- `npm test` - Run test suite (vitest)
- `npm run start` - Start production HTTP server
- `npm run start-stdio` - Start production STDIO server  
- `npm run dev` - Start development HTTP server with hot reload
- `npm run dev-stdio` - Start development STDIO server with hot reload
- `npm run test-client` - Run test client

### Project Structure
```
src/
├── __tests__/          # Test suite (vitest)
│   ├── smoke.test.ts           # Runner smoke test
│   ├── retry.test.ts           # Retry utility tests (16 tests)
│   ├── octokit.test.ts         # Shared Octokit tests (6 tests)
│   ├── grep-app-client.test.ts # grep.app client timeout tests
│   ├── concurrency.test.ts     # pLimit concurrency tests
│   └── error-surface.test.ts   # Rate limit error surfacing tests
├── core/               # Core utilities and infrastructure
│   ├── index.ts                # Barrel exports
│   ├── retry.ts                # withRetry, RateLimitError, exponential backoff
│   ├── octokit.ts              # Shared auth-aware Octokit instance
│   ├── concurrency.ts          # pLimit concurrency limiter
│   ├── cache.ts                # Result caching with page-aware keys
│   ├── grep-app-client.ts      # grep.app API client with retry + throttling
│   ├── github-utils.ts         # GitHub file fetching with retry + concurrency
│   ├── batch-retrieval.ts      # Batch file retrieval from cached results
│   ├── hits.ts                 # Search result data structures
│   ├── logger.ts               # Winston logger with daily rotation
│   └── types.ts                # Shared TypeScript types and schemas
├── tools/              # MCP tool implementations
│   ├── index.ts                # Tool registration
│   ├── search-code.ts          # searchCode tool
│   ├── github-file-tool.ts     # github_file tool
│   ├── github-batch-files-tool.ts  # github_batch_files tool
│   └── batch-retrieval.ts      # batch_retrieve_files tool
├── utils/              # Formatting utilities
├── server.ts           # HTTP server entry point
└── server-stdio.ts     # STDIO server entry point
```

## 📝 Logging

The server includes comprehensive logging with daily rotation:
- **Location**: `logs/` directory
- **Rotation**: Daily with date-based filenames
- **Levels**: error, warn, info, debug
- **Format**: JSON with timestamps

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

ISC License - see package.json for details

## 🔗 Related

- [grep.app](https://grep.app) - The search service powering this tool
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
- [Claude Code](https://claude.ai/code) - Claude's official CLI