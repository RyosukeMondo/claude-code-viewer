# Technology Stack

## Project Type
Web-based Claude Code client application that combines a modern Next.js frontend with a Node.js backend to provide real-time conversation viewing and task management capabilities.

## Core Technologies

### Primary Language(s)
- **Language**: TypeScript (strict mode via @tsconfig/strictest)
- **Runtime/Compiler**: Node.js >=20.12.0 with Next.js 15.5.2 compilation
- **Language-specific tools**: pnpm 10.8.1 package manager, TypeScript compiler

### Key Dependencies/Libraries
- **Next.js 15.5.2**: React-based web framework with app router and API routes
- **React 19.1.1**: Frontend UI library with latest features and Suspense
- **Hono.js 4.9.5**: Lightweight web framework for API layer with type safety
- **TanStack Query 5.85.5**: Server state management with Suspense integration
- **Zod 4.1.5**: Runtime type validation and schema parsing
- **Tailwind CSS 4.1.12**: Utility-first CSS framework for styling
- **Radix UI**: Accessible component primitives via shadcn/ui
- **Jotai 2.13.1**: Atomic state management for client-side filtering

### Application Architecture
Monorepo structure with integrated backend API - single Next.js application with Hono.js API routes mounted at `/api`. Frontend uses React Server Components and client components with Suspense boundaries for progressive loading.

### Data Storage
- **Primary storage**: File system - reads JSONL conversation files from `~/.claude/projects/`
- **Caching**: In-memory caching via TanStack Query with automatic invalidation
- **Data formats**: JSONL (JSON Lines) for conversation data, Zod schemas for validation

### External Integrations
- **APIs**: File system monitoring via Node.js `fs.watch()` API
- **Protocols**: HTTP/REST API, Server-Sent Events for real-time updates
- **Authentication**: None - local file access only

### Monitoring & Dashboard Technologies
- **Dashboard Framework**: React 19 with Next.js App Router and TypeScript
- **Real-time Communication**: Server-Sent Events via Hono's `streamSSE()` with heartbeat mechanism
- **Visualization Libraries**: React Markdown for conversation rendering, React Syntax Highlighter for code blocks
- **State Management**: Jotai atoms for UI state, TanStack Query for server state

## Development Environment

### Build & Development Tools
- **Build System**: Next.js build system with custom shell script for standalone bundling
- **Package Management**: pnpm with workspace configuration and exact version locking
- **Development workflow**: Turbopack for fast development, hot reload on port 3400

### Code Quality Tools
- **Static Analysis**: Biome 2.2.2 for both linting and formatting (replaces ESLint + Prettier)
- **Formatting**: Biome format with write mode for automatic fixes
- **Testing Framework**: Vitest 3.2.4 with global test setup and watch mode
- **Documentation**: Inline TypeScript documentation and README

### Version Control & Collaboration
- **VCS**: Git with GitHub repository hosting
- **Branching Strategy**: Feature branches with main branch protection
- **Code Review Process**: Pull request reviews with automated checks

### Dashboard Development
- **Live Reload**: Turbopack development server with hot module replacement
- **Port Management**: Configurable PORT environment variable (default 3400)
- **Multi-Instance Support**: Single instance design with file system locking

## Deployment & Distribution
- **Target Platform(s)**: Cross-platform Node.js environments (Linux, macOS, Windows)
- **Distribution Method**: npm package `@kimuson/claude-code-viewer` with global CLI installation
- **Installation Requirements**: Node.js >=20.12.0, access to `~/.claude/projects/` directory
- **Update Mechanism**: npm package updates with semantic versioning

## Technical Requirements & Constraints

### Performance Requirements
- Real-time file system monitoring with <100ms response time
- Server-Sent Events with 30-second heartbeat intervals
- Efficient JSONL parsing for large conversation files
- Memory-efficient conversation rendering with progressive loading

### Compatibility Requirements  
- **Platform Support**: Node.js >=20.12.0 on Linux, macOS, Windows
- **Dependency Versions**: Strict TypeScript mode, latest stable React/Next.js
- **Standards Compliance**: Web standards for SSE, accessibility standards via Radix UI

### Security & Compliance
- **Security Requirements**: Local file system access only, no external network calls
- **Compliance Standards**: No sensitive data transmission, local-only operation
- **Threat Model**: File system access permissions, input validation via Zod

### Scalability & Reliability
- **Expected Load**: Single-user local development environment usage
- **Availability Requirements**: Local development tool availability
- **Growth Projections**: Support for multiple Claude projects and session management

## Technical Decisions & Rationale

### Decision Log
1. **Next.js over pure React**: Full-stack capability with API routes, built-in optimization, and excellent TypeScript support
2. **Hono.js over Express**: Lightweight, type-safe API framework with better performance and modern features
3. **Biome over ESLint/Prettier**: Single tool for formatting and linting, faster performance, better TypeScript integration
4. **Server-Sent Events over WebSockets**: Simpler unidirectional communication model fits the file monitoring use case
5. **File system as source of truth**: No database needed, direct integration with Claude Code's JSONL format

## Known Limitations

- **Single-user design**: Not designed for multi-user concurrent access to conversation files
- **File system dependency**: Requires direct access to `~/.claude/projects/` directory structure
- **Real-time sync limitations**: File system watching may have platform-specific limitations or delays