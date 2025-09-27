#!/bin/bash
cd /home/rmondo/repos/claude-code-viewer
PORT=3403 pnpm exec next dev -p 3403 -H 0.0.0.0 --turbopack