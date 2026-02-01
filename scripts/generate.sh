#!/bin/bash

# PvPoke Rankings Generator
# Usage:
#   ./generate.sh --cup all --league 1500
#   ./generate.sh --config cups/championship2026.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check if node_modules exists
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing dependencies..."
    cd "$SCRIPT_DIR" && npm install
fi

# Run the generator from project root (so relative paths work)
cd "$PROJECT_DIR" && node scripts/generate.js "$@"
