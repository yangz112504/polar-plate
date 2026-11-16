#!/usr/bin/env bash
#
# run-all-tests.sh — run every existing test suite in the repo with one command.
#
# Suites:
#   backend   -> `npm test` (vitest run) in backend/
#   frontend  -> `npm test` in polar-plate-frontend/ IF its package.json defines a
#                "test" script. Today it has none (only dev/build/start/lint), so it is
#                reported as SKIPPED, which does not count as a failure.
#
# Behavior:
#   - Every suite runs even if an earlier one fails (no `set -e`).
#   - A summary of PASSED / FAILED / SKIPPED is printed at the end.
#   - Exit code is 0 only if no suite FAILED; otherwise 1.
#   - Does not install dependencies, start containers, or touch running processes.
#
# Prerequisite for backend tests: the test Postgres must already be running, e.g.
#   docker compose -f backend/docker-compose.test.yml up -d
#
# Usage: ./run-all-tests.sh

# Resolve the repo root from the script's own location so it works from any cwd.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parallel arrays holding one entry per suite for the final report.
NAMES=()
RESULTS=()

# Colors only when writing to a terminal.
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BOLD=""; RESET=""
fi

# Records a suite result.
# Args: $1 = suite name, $2 = PASSED | FAILED | SKIPPED
record() {
  NAMES+=("$1")
  RESULTS+=("$2")
}

# Runs `npm test` inside a directory and records PASSED/FAILED.
# Args: $1 = suite name, $2 = directory relative to the repo root.
# A missing directory or missing node_modules is a FAILED suite (we never install).
run_npm_test() {
  local name="$1" dir="$ROOT_DIR/$2"

  echo ""
  echo "${BOLD}=== $name ($2) ===${RESET}"

  if [ ! -d "$dir" ]; then
    echo "Directory not found: $dir"
    record "$name" FAILED
    return
  fi
  if [ ! -d "$dir/node_modules" ]; then
    echo "node_modules missing in $2 — run 'npm install' there first (this script never installs)."
    record "$name" FAILED
    return
  fi

  # Subshell so the cd does not leak into later suites.
  if (cd "$dir" && npm test); then
    record "$name" PASSED
  else
    record "$name" FAILED
  fi
}

# --- backend ---------------------------------------------------------------
# Warn (don't block) if the test Postgres port is unreachable; the DB tests will
# then fail with connection errors. Port 54329 comes from backend/docker-compose.test.yml.
if ! (exec 3<>/dev/tcp/127.0.0.1/54329) 2>/dev/null; then
  echo "${YELLOW}Warning: nothing is listening on localhost:54329 (test Postgres)."
  echo "Backend DB tests will likely fail. Start it with:"
  echo "  docker compose -f backend/docker-compose.test.yml up -d${RESET}"
fi
run_npm_test "backend" "backend"

# --- frontend --------------------------------------------------------------
# Only run if a "test" script is actually defined; otherwise `npm test` would fail
# with "Missing script" and misreport a nonexistent suite as broken.
FRONTEND_PKG="$ROOT_DIR/polar-plate-frontend/package.json"
if [ -f "$FRONTEND_PKG" ] && grep -q '"test"[[:space:]]*:' "$FRONTEND_PKG"; then
  run_npm_test "frontend" "polar-plate-frontend"
else
  echo ""
  echo "${BOLD}=== frontend (polar-plate-frontend) ===${RESET}"
  echo "No \"test\" script in package.json — no frontend test suite exists yet."
  record "frontend" SKIPPED
fi

# --- summary ---------------------------------------------------------------
echo ""
echo "${BOLD}================ Summary ================${RESET}"
FAILED_COUNT=0
for i in "${!NAMES[@]}"; do
  case "${RESULTS[$i]}" in
    PASSED)  printf '  %s%-10s PASSED%s\n'  "$GREEN"  "${NAMES[$i]}" "$RESET" ;;
    FAILED)  printf '  %s%-10s FAILED%s\n'  "$RED"    "${NAMES[$i]}" "$RESET"; FAILED_COUNT=$((FAILED_COUNT + 1)) ;;
    SKIPPED) printf '  %s%-10s SKIPPED (no tests defined)%s\n' "$YELLOW" "${NAMES[$i]}" "$RESET" ;;
  esac
done

if [ "$FAILED_COUNT" -gt 0 ]; then
  echo "${RED}${BOLD}$FAILED_COUNT suite(s) failed.${RESET}"
  exit 1
fi
echo "${GREEN}${BOLD}No suite failed.${RESET}"
exit 0
