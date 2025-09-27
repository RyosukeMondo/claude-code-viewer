#!/bin/bash
cd /home/rmondo/repos/claude-code-viewer
PORT=3401 pnpm exec next dev -p 3401 -H 0.0.0.0 --turbopack