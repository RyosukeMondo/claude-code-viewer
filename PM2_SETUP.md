# PM2 Multi-Instance Setup

This setup allows you to run multiple instances of the Claude Code Viewer simultaneously using PM2 process manager.

## Prerequisites

1. Install PM2 globally:
```bash
npm install -g pm2
```

## Quick Start

1. **Start all instances** (ports 3401-3405):
```bash
pnpm pm2:start
```

2. **Check running instances**:
```bash
pnpm pm2:list
```

3. **View logs**:
```bash
pnpm pm2:logs
```

4. **Stop all instances**:
```bash
pnpm pm2:stop
```

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm pm2:start` | Start all instances defined in ecosystem.config.js |
| `pnpm pm2:stop` | Stop all instances |
| `pnpm pm2:restart` | Restart all instances |
| `pnpm pm2:delete` | Delete all instances from PM2 |
| `pnpm pm2:list` | List all running PM2 processes |
| `pnpm pm2:logs` | Show logs from all instances |
| `pnpm pm2:monit` | Open PM2 monitoring dashboard |
| `pnpm pm2:save` | Save current process list |
| `pnpm pm2:startup` | Setup PM2 to start on system boot |

## Individual Instance Management

Start specific instances:
```bash
pm2 start ecosystem.config.js --only claude-viewer-3401
pm2 start ecosystem.config.js --only claude-viewer-3402
```

Stop specific instances:
```bash
pm2 stop claude-viewer-3401
pm2 restart claude-viewer-3402
```

## Accessing Instances

Once started, your instances will be available at:
- http://localhost:3401
- http://localhost:3402
- http://localhost:3403
- http://localhost:3404
- http://localhost:3405

## Configuration

The `ecosystem.config.js` file defines 5 instances by default. To modify:

1. Edit `ecosystem.config.js`
2. Add/remove app configurations
3. Restart PM2: `pnpm pm2:restart`

## Auto-start on Boot

To automatically start instances when your system boots:

1. Save current process list: `pnpm pm2:save`
2. Generate startup script: `pnpm pm2:startup`
3. Follow the instructions provided by PM2

## Troubleshooting

**Port conflicts**: If ports are already in use, edit `ecosystem.config.js` and change the port numbers.

**Memory issues**: Each instance has a 1GB memory limit. Adjust `max_memory_restart` in the config if needed.

**Logs**: Check logs with `pnpm pm2:logs` or `pm2 logs claude-viewer-3401` for specific instances.

**Reset everything**:
```bash
pnpm pm2:delete
pnpm pm2:start
```