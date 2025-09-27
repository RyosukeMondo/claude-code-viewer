#!/bin/bash
cd /home/rmondo/repos/claude-code-viewer
PORT=3404 pnpm exec next dev -p 3404 -H 0.0.0.0 --turbopack