# Multiple Instance Setup Guide

This guide shows you how to run multiple Claude Code Viewer instances simultaneously on different ports.

## Simple Solution (Recommended)

We've created a simple shell script that launches multiple instances using tmux - no PM2 complexity needed!

### Quick Start

```bash
# Start all 5 instances (ports 3401-3405)
./launch-multiple.sh start
# OR
pnpm run multi:start

# Check status of all instances
./launch-multiple.sh status
# OR
pnpm run multi:status

# Stop all instances
./launch-multiple.sh stop
# OR
pnpm run multi:stop

# Restart all instances
./launch-multiple.sh restart
# OR
pnpm run multi:restart
```

### Access Your Instances

Once started, you can access the instances at:
- http://localhost:3401
- http://localhost:3402
- http://localhost:3403
- http://localhost:3404
- http://localhost:3405

From Windows (if running in WSL), use your WSL IP:
- http://172.31.187.253:3401 (replace with your WSL IP)
- http://172.31.187.253:3402
- etc.

### Advanced Usage

```bash
# Connect to tmux session to see all instances
tmux attach -t claude-viewer

# Inside tmux:
# - Ctrl+B, w = show all windows
# - Ctrl+B, [0-9] = switch to window
# - Ctrl+B, d = detach from session

# View specific instance logs
tmux capture-pane -t claude-viewer:port-3401 -p
```

### Requirements

- tmux must be installed: `sudo apt install tmux`
- All instances run on 0.0.0.0 so they're accessible from Windows via WSL IP

## PM2 Solution (Alternative)

If you prefer PM2, the configuration is still available:

```bash
# Start all instances with PM2
pnpm run pm2:start

# Check PM2 status
pnpm run pm2:list

# View PM2 logs
pnpm run pm2:logs

# Stop PM2 instances
pnpm run pm2:stop
```

**Note**: PM2 currently has some issues with the Claude Code SDK spawn process. The simple shell script solution above is more reliable.

## Ports Configuration

Default ports are 3401-3405. To change them, edit the `PORTS` array in `launch-multiple.sh`:

```bash
PORTS=(3401 3402 3403 3404 3405)
```

## Troubleshooting

### Port Already in Use
If you see "Port already in use" errors:
```bash
# Check what's using the port
netstat -tlnp | grep :3401

# Kill the process if needed
kill <PID>
```

### Instance Not Starting
Check the tmux session:
```bash
tmux attach -t claude-viewer
# Navigate to the problematic window to see error messages
```

### WSL Network Access
To access from Windows, ensure your WSL instance allows connections:
```bash
# Find your WSL IP
ip addr show eth0 | grep inet

# Test accessibility
curl http://localhost:3401
```

## Benefits of Multiple Instances

- **Isolation**: Each instance runs independently
- **Load Distribution**: Spread work across multiple processes
- **Development**: Test different features simultaneously
- **Backup**: If one instance has issues, others continue working
- **Performance**: Better resource utilization