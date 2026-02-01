#!/bin/bash
cd "$(dirname "$0")"
node test-chrome.js 2>&1 | tee test-output.log
echo "Exit code: $?" >> test-output.log
