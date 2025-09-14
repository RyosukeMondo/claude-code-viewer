#!/bin/bash

PORT=${1:-3400}

if [ "$1" = "--port" ] && [ -n "$2" ]; then
    PORT=$2
fi

echo "Looking for processes using port $PORT..."

PID=$(lsof -ti :$PORT)

if [ -z "$PID" ]; then
    echo "No process found using port $PORT"
    exit 0
fi

echo "Found process(es) using port $PORT: $PID"
kill -9 $PID

if [ $? -eq 0 ]; then
    echo "Successfully killed process(es): $PID"
else
    echo "Failed to kill process(es)"
    exit 1
fi