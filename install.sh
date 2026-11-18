#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
command -v node >/dev/null || { echo '请安装 Node.js 22.12+ 和 npm。' >&2; exit 1; }
npm ci
npm run deploy
