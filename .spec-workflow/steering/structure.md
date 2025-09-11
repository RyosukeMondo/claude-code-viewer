# Project Structure

## Directory Organization

```
claude-code-viewer/
├── src/                          # Source code
│   ├── app/                     # Next.js App Router structure
│   │   ├── api/                 # API routes (Hono.js integration)
│   │   ├── components/          # Global React components
│   │   ├── hooks/               # Global React hooks  
│   │   ├── projects/            # Projects feature module
│   │   │   ├── [projectId]/     # Dynamic project routes
│   │   │   │   ├── components/  # Project-specific components
│   │   │   │   └── sessions/    # Session routes and components
│   │   │   ├── components/      # Project list components
│   │   │   └── hooks/           # Project-related hooks
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx            # Home page
│   │   └── globals.css         # Global styles
│   ├── components/              # Shared UI components
│   │   └── ui/                 # shadcn/ui component library
│   ├── hooks/                   # Shared React hooks
│   ├── lib/                     # Utility libraries
│   │   ├── api/                # API client utilities
│   │   ├── atoms/              # Jotai state atoms
│   │   ├── conversation-schema/ # Zod validation schemas
│   │   ├── sse/                # Server-Sent Events utilities
│   │   └── utils.ts            # General utilities
│   ├── server/                  # Server-side code
│   │   ├── config/             # Server configuration
│   │   ├── hono/               # Hono.js app setup
│   │   └── service/            # Business logic services
│   └── utils/                   # Additional utilities
├── scripts/                     # Build and utility scripts
├── docs/                        # Project documentation
├── public/                      # Static assets
└── [config files]              # Root configuration files
```

## Naming Conventions

### Files
- **Components**: `PascalCase.tsx` (e.g., `ProjectList.tsx`, `ChatInput.tsx`)
- **Pages**: `page.tsx` for Next.js App Router convention
- **Hooks**: `use` prefix with `camelCase.ts` (e.g., `useProjects.ts`, `useConfig.ts`)
- **Utilities**: `camelCase.ts` (e.g., `utils.ts`, `collection.ts`)
- **Tests**: `[filename].test.ts` pattern (Vitest convention)

### Code
- **React Components**: `PascalCase` (e.g., `ProjectList`, `ChatInput`)
- **Functions/Hooks**: `camelCase` (e.g., `useProjects`, `getProject`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`, `DEFAULT_PORT`)
- **Variables**: `camelCase` (e.g., `projectId`, `sessionData`)

## Import Patterns

### Import Order
1. External dependencies (React, Next.js, third-party libraries)
2. Internal absolute imports (from `@/` path alias)
3. Relative imports within the same module
4. Type-only imports (using `import type`)

### Module/Package Organization
```typescript
// 1. External dependencies
import { useState } from 'react'
import { NextRequest } from 'next/server'
import { z } from 'zod'

// 2. Internal absolute imports
import { Button } from '@/components/ui/button'
import { useProjects } from '@/app/projects/hooks/useProjects'

// 3. Relative imports
import './styles.css'
import type { LocalType } from './types'
```

## Code Structure Patterns

### React Component Organization
```typescript
// 1. Imports
import { useState } from 'react'
import type { ComponentProps } from './types'

// 2. Type definitions
interface Props extends ComponentProps {
  // component-specific props
}

// 3. Main component implementation
export function ComponentName({ prop1, prop2 }: Props) {
  // hooks and state
  // event handlers
  // render logic
}

// 4. Default export (if needed)
export default ComponentName
```

### Service/API Organization
```typescript
// 1. Imports and dependencies
// 2. Type definitions and schemas
// 3. Configuration constants
// 4. Main service functions
// 5. Helper functions
// 6. Exports
```

### File Organization Principles
- One main export per file (component, hook, or service)
- Related types and utilities in the same file when tightly coupled
- Barrel exports (`index.ts`) for complex modules with multiple related exports
- Clear separation between public API and implementation details

## Code Organization Principles

1. **Feature-based Grouping**: Code organized by application features (`projects/`, `sessions/`) rather than technical layers
2. **Co-location**: Related components, hooks, and utilities are placed near where they're used
3. **Layer Separation**: Clear boundaries between UI (`app/`), business logic (`server/service/`), and utilities (`lib/`)
4. **Type Safety**: Zod schemas for runtime validation, TypeScript interfaces for compile-time safety

## Module Boundaries

### Core Architecture Layers:
- **Presentation Layer** (`src/app/`): Next.js App Router pages and React components
- **API Layer** (`src/app/api/`): Hono.js routes mounted in Next.js API routes
- **Business Logic** (`src/server/service/`): Core application services and file operations
- **Data Layer** (`src/lib/conversation-schema/`): Data validation and parsing
- **Infrastructure** (`src/lib/`): Shared utilities, API clients, and configuration

### Dependency Direction:
```
Presentation → API → Business Logic → Data Layer
     ↓           ↓         ↓
Infrastructure (shared by all layers)
```

### Boundary Rules:
- UI components should not directly access file system operations
- Business logic services should not import React components
- Data schemas are shared across all layers for type consistency
- Infrastructure utilities are available to all layers

## Code Size Guidelines

- **File size**: Maximum 300 lines per file (excluding generated code)
- **Component size**: Maximum 150 lines per React component
- **Function size**: Maximum 50 lines per function
- **Nesting depth**: Maximum 4 levels of indentation

## Dashboard/Monitoring Structure

### Next.js App Router Structure:
```
src/app/
├── api/[[...route]]/route.ts    # Single catch-all API route for Hono integration
├── projects/                    # Projects feature module
│   ├── [projectId]/            # Dynamic routing for individual projects
│   │   ├── sessions/[sessionId]/ # Nested dynamic routing for sessions
│   │   ├── components/         # Project-specific UI components
│   │   └── page.tsx           # Project overview page
│   ├── components/            # Project list components
│   └── page.tsx              # Projects listing page
└── layout.tsx                # Root application layout
```

### Real-time Communication Architecture:
- **Server-Sent Events**: Implemented via Hono's `streamSSE()` at `/api/events/state_changes`
- **File System Monitoring**: `FileWatcherService` singleton monitoring `~/.claude/projects/`
- **State Synchronization**: TanStack Query cache invalidation triggered by SSE events
- **Error Boundaries**: React Error Boundaries for graceful failure handling

### Separation of Concerns:
- **Frontend State**: Jotai atoms for client-side UI state (filtering, preferences)
- **Server State**: TanStack Query for API data caching and synchronization
- **File System**: Node.js services handle direct file operations
- **Validation**: Zod schemas ensure data consistency across all layers

## Documentation Standards

- **Public APIs**: JSDoc comments for all exported functions and components
- **Complex Logic**: Inline comments explaining non-obvious business logic
- **Module README**: Each major feature module includes usage documentation
- **Type Definitions**: Comprehensive TypeScript interfaces with descriptive property names
- **Configuration**: Environment variables and configuration options documented in code comments