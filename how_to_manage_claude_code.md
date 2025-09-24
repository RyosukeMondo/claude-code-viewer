# Claude Code Project Detection and Management

## Overview

This document describes how the Claude Code Viewer detects, monitors, and manages Claude Code projects and sessions, including state detection and prompt execution.

## Project Detection Architecture

### File System Structure

Claude Code projects are stored in the standard location:
```
~/.claude/projects/
├── project-1/
│   ├── conversations/
│   │   ├── session-1.jsonl
│   │   └── session-2.jsonl
│   └── meta.json
└── project-2/
    ├── conversations/
    └── meta.json
```

### Detection Implementation

**Primary Service**: `src/server/service/project-service.ts`

```typescript
// Core detection functions
getProjects(): Promise<Project[]>         // Discover all projects
getProject(id: string): Promise<Project>  // Get specific project
getProjectMeta(id: string)                // Get project metadata
```

**Detection Process**:
1. Scan `~/.claude/projects/` directory
2. Validate each subdirectory as a Claude project
3. Parse `meta.json` for project metadata
4. Enumerate conversation files in `conversations/` subfolder
5. Return structured project list with session counts

## Session Detection and Parsing

### Session Structure

Sessions are stored as JSONL files containing conversation entries:

```jsonl
{"type": "user", "content": "Hello", "timestamp": "2025-01-15T10:00:00Z"}
{"type": "assistant", "content": "Hi there!", "timestamp": "2025-01-15T10:00:01Z"}
{"type": "tool_use", "name": "bash", "input": {"command": "ls"}}
{"type": "tool_result", "output": "file1.txt file2.txt"}
```

### Parsing Implementation

**Schema Validation**: `src/lib/conversation-schema/`
- Modular Zod schemas for different entry types
- Union types for flexible conversation parsing
- Type-safe validation of all conversation data

**Parsing Functions**:
```typescript
parseJsonl(content: string): ConversationEntry[]  // Parse JSONL to typed entries
parseCommandXml(content: string)                  // Extract command structures
```

## Real-Time State Detection

### File System Monitoring

**Service**: `FileWatcherService` (singleton)
- Monitors `~/.claude/projects/` using Node.js `fs.watch()`
- Detects file changes, additions, deletions
- Tracks session state changes in real-time

### Server-Sent Events Implementation

**Endpoint**: `/api/events/state_changes`

```typescript
// Event types emitted
type StateChangeEvent =
  | { type: 'connected' }
  | { type: 'project_changed', projectId: string }
  | { type: 'session_changed', projectId: string, sessionId: string }
  | { type: 'heartbeat' }
```

**Client Integration**:
```typescript
// Automatic cache invalidation on changes
useEffect(() => {
  const eventSource = new EventSource('/api/events/state_changes')
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'session_changed') {
      queryClient.invalidateQueries(['conversations', data.sessionId])
    }
  }
}, [])
```

## Session State Detection

### Idle vs Working Detection

**Indicators of Active Sessions**:
1. **Recent File Modifications**: Sessions modified within last 30 minutes
2. **Incomplete Tool Sequences**: Tool use without corresponding tool results
3. **Assistant Thinking**: Presence of `<thinking>` blocks without completion
4. **Command Execution**: Ongoing bash/tool commands without results

**Implementation**:
```typescript
function getSessionState(entries: ConversationEntry[]): 'idle' | 'working' {
  const lastEntry = entries[entries.length - 1]
  const lastModified = new Date(lastEntry.timestamp)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

  // Recent activity
  if (lastModified > thirtyMinutesAgo) {
    // Check for incomplete sequences
    const hasIncompleteTools = entries.some(entry =>
      entry.type === 'tool_use' &&
      !entries.some(result => result.type === 'tool_result' && result.tool_use_id === entry.id)
    )

    return hasIncompleteTools ? 'working' : 'idle'
  }

  return 'idle'
}
```

## Session Lifecycle Management

### Claude Code SDK Integration

**SDK Dependency**: Uses `@anthropic-ai/claude-code` (v1.0.98) for programmatic session management

**Process Detection**:
```typescript
// Automatically detects Claude Code executable
private async initializeClaudePath(): Promise<void> {
  const { stdout } = await execAsync("which claude");
  this.claudeExecutablePath = stdout.trim();
}
```

**Session Invocation**:
```typescript
// Programmatic session creation via SDK
return query({
  prompt: taskSession.generateMessages(),
  options: {
    resume: taskSession.baseSessionId,           // Resume existing session
    cwd: taskSession.cwd,                        // Working directory
    pathToClaudeCodeExecutable: this.claudeExecutablePath,
    permissionMode: "bypassPermissions",        // Automation mode
    abortController: taskSession.abortController // Process control
  },
});
```

### Launching New Sessions

**Automated Session Creation Process**:
1. **Executable Detection**: Locate Claude Code in system PATH via `which claude`
2. **SDK Invocation**: Use `query()` function with message generator
3. **Process Spawning**: Claude Code process launched with specified working directory
4. **Session ID Assignment**: SDK returns session ID for tracking
5. **File System Creation**: JSONL conversation file created automatically
6. **Real-time Detection**: FileWatcherService detects new file and updates UI

**Session Configuration**:
```typescript
interface TaskSession {
  id: string;                          // Internal task identifier
  projectId: string;                   // Project association
  cwd: string;                         // Working directory for Claude Code
  sessionId: string;                   // Claude Code session identifier
  baseSessionId?: string;              // For session resumption
  abortController: AbortController;    // Process termination control
}
```

**Message Generation**:
```typescript
// Creates async generator for message stream
async function* generateMessages(): AsyncGenerator<SDKUserMessage> {
  yield createMessage(firstMessage);
  while (true) {
    const message = await sendMessagePromise.promise;
    yield createMessage(message);
  }
}
```

**Automatic Detection**:
- New session files appear immediately in project listings
- Real-time monitoring ensures instant UI updates
- No manual refresh required - changes propagate automatically

### Claude Code Process Monitoring

**SDK-Level Process Management**:

**Process Detection & Control**:
```typescript
// Process lifecycle management
export class TaskLifecycleService {
  public completeTask(taskId: string): void     // Mark task completed
  public pauseTask(taskId: string): void       // Pause active task
  public failTask(taskId: string): void        // Mark task failed
  public abortAllAliveTasks(): void           // Emergency cleanup
}
```

**AbortController Integration**:
```typescript
// Each Claude Code process has termination control
interface AliveTask {
  sessionId: string;
  abortController: AbortController;    // For process termination
  lastActivity: number;                // Activity timestamp
}

// Graceful process termination
task.abortController.abort();          // Kills Claude Code process
```

**Process Lifecycle States**:
1. **Pending**: Task queued, not yet started
2. **Running**: Claude Code process active and responding
3. **Paused**: Process suspended, can be resumed
4. **Completed**: Task finished successfully
5. **Failed**: Process error or termination
6. **Cancelled**: Manually aborted via AbortController

**Automated Monitoring System**:
```typescript
// Continuous process monitoring (5-second intervals)
private startTaskMonitoring(activeTask: ActiveTask): void {
  const monitoringInterval = setInterval(async () => {
    await this.checkTaskProgress(activeTask);
  }, 5000);
}
```

**Process Kill/Stop/End Management**:

**1. Graceful Termination**:
```typescript
public abortTask(sessionId: string): void {
  const task = this.findTaskBySessionId(sessionId);
  if (task?.abortController) {
    task.abortController.abort();  // Clean SDK termination
  }
}
```

**2. Emergency Cleanup**:
```typescript
// On application exit - cleanup all processes
private setupCleanupHandlers(): void {
  prexit(() => {
    this.taskLifecycle.abortAllAliveTasks();
  });
}
```

**3. Process Death Detection**:
```typescript
// Stream processing detects process termination
for await (const message of this.queryClaudeCode(taskSession)) {
  // Process messages until stream ends or error
}
// Handle stream end - process terminated naturally
await this.handleStreamEnd(currentTask);
```

**Process Independence Architecture**:
- **Viewer Independence**: Claude Code Viewer runs independently of Claude Code processes
- **Session Persistence**: JSONL files survive process crashes/termination
- **Resumable Sessions**: Can restart Claude Code processes using existing session IDs
- **Continuous Monitoring**: File system monitoring continues regardless of process state

**Resource Management**:
- **Automatic Cleanup**: Completed tasks removed after 60 seconds
- **Memory Management**: Process references cleaned up on termination
- **Error Recovery**: Failed processes marked and resources freed
- **Retry Logic**: Maximum 3 retries for transient process errors

**Process State Detection**:
```typescript
// Real-time process state detection
function detectProcessState(task: AliveTask): ProcessState {
  if (task.abortController.signal.aborted) return 'terminated';
  if (Date.now() - task.lastActivity > 300000) return 'stale';     // 5 min timeout
  if (hasIncompleteToolUse(task)) return 'working';
  return 'active';
}
```

## Prompt Execution Detection

### Command Structure Recognition

**XML Command Parsing**:
```typescript
// Detects commands in conversation content
const commandPattern = /<command-name>([^<]+)<\/command-name>/
const argsPattern = /<command-args>([^<]*)<\/command-args>/
const outputPattern = /<local-command-stdout>([^<]*)<\/local-command-stdout>/
```

**Detected Command Types**:
- **Slash Commands**: `/help`, `/clear`, `/build`
- **Local Commands**: File operations, git commands
- **Tool Invocations**: `bash`, `read`, `write`, `edit`

### Execution State Tracking

**States**:
1. **Initiated**: Command appears in user message
2. **Processing**: Tool use entry created
3. **Completed**: Tool result received
4. **Failed**: Error in tool result

## API Endpoints for Management

### Core Endpoints

```typescript
GET /api/projects                           // List all projects
GET /api/projects/:projectId               // Get project details
GET /api/projects/:projectId/sessions/:sessionId  // Get session conversations
GET /api/events/state_changes              // Real-time updates (SSE)
POST /api/projects/:projectId/tasks        // Start automated task execution
GET /api/projects/:projectId/tasks/:taskId // Get task status and progress
DELETE /api/projects/:projectId/tasks/:taskId // Cancel running task
```

### Task Management Endpoints

**Start New Task**:
```typescript
POST /api/projects/:projectId/tasks
{
  "prompt": "Implement authentication system",
  "completionCondition": "all_tests_pass",
  "autoContinue": true
}
```

**Monitor Task Progress**:
```typescript
GET /api/projects/:projectId/tasks/:taskId
// Response includes process state, session ID, progress data
```

**Process Control**:
```typescript
DELETE /api/projects/:projectId/tasks/:taskId  // Abort Claude Code process
PUT /api/projects/:projectId/tasks/:taskId/pause  // Suspend process
PUT /api/projects/:projectId/tasks/:taskId/resume // Resume process
```

### Response Formats

**Project List**:
```json
{
  "projects": [
    {
      "id": "project-1",
      "name": "My Project",
      "path": "/home/user/.claude/projects/project-1",
      "sessionCount": 5,
      "lastModified": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**Session Data**:
```json
{
  "id": "session-1",
  "projectId": "project-1",
  "entries": [...],
  "state": "working",
  "lastActivity": "2025-01-15T10:00:00Z"
}
```

## Integration Patterns

### Frontend State Management

**TanStack Query**: Server state with automatic invalidation
```typescript
const { data: conversations } = useQuery({
  queryKey: ['conversations', sessionId],
  queryFn: () => getSessionConversations(projectId, sessionId)
})
```

**Jotai Atoms**: Client-side filtering and UI state
```typescript
const filterAtom = atom<ConversationFilter>({ type: 'all' })
const filteredConversationsAtom = atom((get) => {
  const conversations = get(conversationsAtom)
  const filter = get(filterAtom)
  return applyFilter(conversations, filter)
})
```

### Error Handling

**Graceful Degradation**:
- Invalid JSONL lines are skipped with warnings
- Missing metadata falls back to directory names
- Network errors show retry mechanisms
- File system permissions handled gracefully

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**: Only parse sessions when requested
2. **Incremental Updates**: Only re-parse changed files
3. **Debounced File Watching**: Batch rapid file changes
4. **Memory Management**: Cleanup SSE connections on disconnect
5. **Caching**: TanStack Query cache with smart invalidation

### Scalability Limits

- **File Count**: Tested up to 1000 sessions per project
- **File Size**: Individual sessions up to 100MB JSONL
- **Real-time Updates**: Up to 50 concurrent SSE connections
- **Memory Usage**: ~10MB per 1000 conversation entries

## Troubleshooting

### Common Issues

1. **Missing Projects**: Check `~/.claude/projects/` permissions
2. **Stale Data**: SSE connection may need refresh
3. **Parse Errors**: Invalid JSONL format in session files
4. **Performance**: Large session files may cause delays

### Debug Information

Enable debug logging:
```bash
DEBUG=claude-viewer:* pnpm dev
```

Monitor file system events:
```bash
# Watch for file changes
fswatch ~/.claude/projects/ | head -20
```