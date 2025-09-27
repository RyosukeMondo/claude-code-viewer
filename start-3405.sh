#!/bin/bash
cd /home/rmondo/repos/claude-code-viewer
PORT=3405 pnpm exec next dev -p 3405 -H 0.0.0.0 --turbopack