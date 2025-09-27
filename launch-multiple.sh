#!/bin/bash

# Claude Code Viewer - Multiple Instance Launcher
# Simple alternative to PM2 for running multiple Next.js instances

cd "$(dirname "$0")"

# Configuration
PORTS=(3401 3402 3403 3404 3405)
SESSION_NAME="claude-viewer"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Claude Code Viewer - Multiple Instance Launcher${NC}"
echo -e "${BLUE}=================================================${NC}"

# Function to check if port is in use
check_port() {
    local port=$1
    if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to start instance
start_instance() {
    local port=$1
    local window_name="port-$port"

    echo -e "${YELLOW}Starting instance on port $port...${NC}"

    # Check if port is already in use
    if check_port $port; then
        echo -e "${RED}⚠️  Port $port is already in use, skipping...${NC}"
        return 1
    fi

    # Create tmux window and start Next.js with proper environment
    tmux new-window -t "$SESSION_NAME" -n "$window_name" -d \
        "cd '$PWD' && export PATH='$PWD/node_modules/.bin:$PATH' && PORT=$port pnpm next dev -p $port -H 0.0.0.0 --turbopack"

    # Wait a moment for startup
    sleep 2

    # Check if the process started successfully
    if check_port $port; then
        echo -e "${GREEN}✅ Instance started successfully on port $port${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to start instance on port $port${NC}"
        return 1
    fi
}

# Function to stop all instances
stop_instances() {
    echo -e "${YELLOW}Stopping all instances...${NC}"

    # Kill tmux session
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        tmux kill-session -t "$SESSION_NAME"
        echo -e "${GREEN}✅ All instances stopped${NC}"
    else
        echo -e "${YELLOW}No active session found${NC}"
    fi

    # Double-check and kill any remaining processes
    for port in "${PORTS[@]}"; do
        local pid=$(lsof -ti :$port 2>/dev/null)
        if [ ! -z "$pid" ]; then
            echo -e "${YELLOW}Killing remaining process on port $port (PID: $pid)${NC}"
            kill $pid 2>/dev/null
        fi
    done
}

# Function to show status
show_status() {
    echo -e "${BLUE}Status of all instances:${NC}"
    echo -e "${BLUE}======================${NC}"

    for port in "${PORTS[@]}"; do
        if check_port $port; then
            local pid=$(lsof -ti :$port 2>/dev/null)
            echo -e "${GREEN}✅ Port $port: RUNNING (PID: $pid)${NC}"
        else
            echo -e "${RED}❌ Port $port: STOPPED${NC}"
        fi
    done

    echo ""
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${BLUE}Tmux session '$SESSION_NAME' is active${NC}"
        echo -e "${BLUE}Use 'tmux attach -t $SESSION_NAME' to connect${NC}"
        echo -e "${BLUE}Use 'Ctrl+B, w' to see all windows${NC}"
    else
        echo -e "${YELLOW}No tmux session found${NC}"
    fi
}

# Function to show logs for all instances
show_logs_all() {
    echo -e "${BLUE}📋 Logs for all instances:${NC}"
    echo -e "${BLUE}=========================${NC}"

    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${RED}❌ No tmux session found. Start instances first.${NC}"
        return 1
    fi

    for port in "${PORTS[@]}"; do
        local window_name="port-$port"
        echo -e "${YELLOW}--- Port $port (last 10 lines) ---${NC}"

        if tmux list-windows -t "$SESSION_NAME" | grep -q "$window_name"; then
            tmux capture-pane -t "$SESSION_NAME:$window_name" -p | tail -10
        else
            echo -e "${RED}Window $window_name not found${NC}"
        fi
        echo ""
    done
}

# Function to show logs for specific port
show_logs_port() {
    local port=$1
    local lines=${2:-50}
    local window_name="port-$port"

    echo -e "${BLUE}📋 Logs for port $port (last $lines lines):${NC}"
    echo -e "${BLUE}======================================${NC}"

    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${RED}❌ No tmux session found. Start instances first.${NC}"
        return 1
    fi

    if tmux list-windows -t "$SESSION_NAME" | grep -q "$window_name"; then
        tmux capture-pane -t "$SESSION_NAME:$window_name" -p | tail -$lines
    else
        echo -e "${RED}❌ Window $window_name not found${NC}"
        return 1
    fi
}

# Function to follow logs for specific port
follow_logs_port() {
    local port=$1
    local window_name="port-$port"

    echo -e "${BLUE}📋 Following logs for port $port (Press Ctrl+C to stop):${NC}"
    echo -e "${BLUE}====================================================${NC}"

    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${RED}❌ No tmux session found. Start instances first.${NC}"
        return 1
    fi

    if ! tmux list-windows -t "$SESSION_NAME" | grep -q "$window_name"; then
        echo -e "${RED}❌ Window $window_name not found${NC}"
        return 1
    fi

    echo -e "${YELLOW}Connecting to tmux window for port $port...${NC}"
    echo -e "${YELLOW}Press Ctrl+B, d to detach from session${NC}"
    echo ""

    # Attach to specific window
    tmux attach-session -t "$SESSION_NAME:$window_name"
}

# Function to restart all instances
restart_instances() {
    echo -e "${YELLOW}Restarting all instances...${NC}"
    stop_instances
    sleep 2
    start_all_instances
}

# Function to start all instances
start_all_instances() {
    # Check if tmux is available
    if ! command -v tmux &> /dev/null; then
        echo -e "${RED}❌ tmux is not installed. Please install it first:${NC}"
        echo -e "${BLUE}   sudo apt install tmux${NC}"
        exit 1
    fi

    # Create tmux session if it doesn't exist
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${YELLOW}Creating new tmux session: $SESSION_NAME${NC}"
        tmux new-session -d -s "$SESSION_NAME" -n "main" "echo 'Claude Code Viewer Session'; bash"
    fi

    local success_count=0

    # Start instances
    for port in "${PORTS[@]}"; do
        if start_instance $port; then
            ((success_count++))
        fi
    done

    echo ""
    echo -e "${BLUE}=================================================${NC}"
    echo -e "${GREEN}✅ Started $success_count/${#PORTS[@]} instances successfully${NC}"
    echo ""
    echo -e "${BLUE}Access your instances at:${NC}"
    for port in "${PORTS[@]}"; do
        if check_port $port; then
            echo -e "${GREEN}  • http://localhost:$port${NC}"
        fi
    done
    echo ""
    echo -e "${BLUE}Commands:${NC}"
    echo -e "${BLUE}  • ./launch-multiple.sh status    - Show status${NC}"
    echo -e "${BLUE}  • ./launch-multiple.sh stop     - Stop all instances${NC}"
    echo -e "${BLUE}  • ./launch-multiple.sh restart  - Restart all instances${NC}"
    echo -e "${BLUE}  • tmux attach -t $SESSION_NAME  - Attach to session${NC}"
}

# Main command handling
case "${1:-start}" in
    start)
        start_all_instances
        ;;
    stop)
        stop_instances
        ;;
    status)
        show_status
        ;;
    restart)
        restart_instances
        ;;
    logs)
        if [ -z "$2" ]; then
            show_logs_all
        else
            show_logs_port "$2" "$3"
        fi
        ;;
    follow)
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Port number required for follow command${NC}"
            echo -e "${BLUE}Usage: $0 follow <port>${NC}"
            exit 1
        fi
        follow_logs_port "$2"
        ;;
    *)
        echo -e "${BLUE}Usage: $0 {start|stop|status|restart|logs|follow}${NC}"
        echo ""
        echo -e "${BLUE}Commands:${NC}"
        echo -e "${BLUE}  start          - Start all instances (default)${NC}"
        echo -e "${BLUE}  stop           - Stop all instances${NC}"
        echo -e "${BLUE}  status         - Show status of all instances${NC}"
        echo -e "${BLUE}  restart        - Restart all instances${NC}"
        echo -e "${BLUE}  logs           - Show logs for all instances (last 10 lines each)${NC}"
        echo -e "${BLUE}  logs <port>    - Show logs for specific port (last 50 lines)${NC}"
        echo -e "${BLUE}  logs <port> <lines> - Show logs for specific port (custom line count)${NC}"
        echo -e "${BLUE}  follow <port>  - Follow logs for specific port (live tail)${NC}"
        echo ""
        echo -e "${BLUE}Examples:${NC}"
        echo -e "${BLUE}  $0 logs                    # All instances, 10 lines each${NC}"
        echo -e "${BLUE}  $0 logs 3401               # Port 3401, 50 lines${NC}"
        echo -e "${BLUE}  $0 logs 3401 100           # Port 3401, 100 lines${NC}"
        echo -e "${BLUE}  $0 follow 3401             # Follow port 3401 live${NC}"
        exit 1
        ;;
esac