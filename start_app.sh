#!/usr/bin/env sh
set -eu

PORT="${PORT:-8010}"
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if ! command -v php >/dev/null 2>&1; then
  echo "PHP was not found on your PATH."
  echo "Install PHP, then run this script again."
  exit 1
fi

URL="http://127.0.0.1:${PORT}/"
echo "Starting Numbas Diagnostic Tool Analysis JS..."
echo
echo "URL: ${URL}"
echo "Keep this terminal open while using the app."
echo "Press Ctrl+C to stop the server."
echo

if command -v open >/dev/null 2>&1; then
  open "${URL}" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${URL}" >/dev/null 2>&1 || true
fi

cd "${APP_DIR}"
php -S "127.0.0.1:${PORT}" -t .
