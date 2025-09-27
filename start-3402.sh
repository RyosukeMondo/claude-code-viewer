#!/bin/bash
cd /home/rmondo/repos/claude-code-viewer
PORT=3402 pnpm exec next dev -p 3402 -H 0.0.0.0 --turbopack