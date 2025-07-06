#!/usr/bin/env bash
set -euo pipefail

# Ensure we start from repository root
cd "$(dirname "$0")"

# Pull latest changes from current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git remote | grep -q "^origin$"; then
        git pull origin "$CURRENT_BRANCH"
    fi
fi

# Create Python virtual environment if missing
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
# Activate virtual environment
source .venv/bin/activate

# Install Python requirements if available
if [ -f "requirements.txt" ]; then
    pip install --upgrade pip
    pip install -r requirements.txt
fi

# Install Node dependencies
npm install

# Start the application server
exec node server.js
