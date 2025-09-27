#!/bin/bash
cd /home/rmondo/repos/claude-code-viewer

# Add project's node_modules/.bin to PATH
export PATH="$PWD/node_modules/.bin:$PATH"

# Ensure NVM environment is loaded
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

PORT=3402 pnpm exec next dev -p 3402 -H 0.0.0.0 --turbopack