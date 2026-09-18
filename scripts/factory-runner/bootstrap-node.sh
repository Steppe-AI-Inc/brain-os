#!/usr/bin/env bash
# ONE NODE BOOTSTRAP, IDENTICAL ON EVERY COMPUTER.
#
#   bash scripts/factory-runner/bootstrap-node.sh --role generic      # Home PC (implementation + generic work)
#   bash scripts/factory-runner/bootstrap-node.sh --role verifier     # Work PC (independent acceptance authority)
#
# There is no Home-PC script and no Work-PC script: the only thing that differs is the security role the node
# registers on the plane, and the plane's node record - not the machine - is what the claim enforces.
#
# It needs FACTORY_RUNNER_PG_URL in the environment (set by the founder from provision-control-plane.mjs's output;
# never committed, never written under the checkout). It refuses to proceed without it, prints the URL nowhere,
# and stops at the first failing link so the fix is named rather than guessed.
set -u
ROLE=generic
ENV_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) echo "unknown argument: $1"; exit 2 ;;
  esac
done
case "$ROLE" in generic|verifier|release_broker) ;; *) echo "role must be generic | verifier | release_broker"; exit 2 ;; esac

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT" || exit 2

echo "factory node bootstrap  role=$ROLE  checkout=$ROOT"
echo

# 1. the URL - its absence is the designed refusal, reported as a setup step
# --env-file <path>: the file provision-control-plane.mjs --write-env produced (one line, FACTORY_RUNNER_PG_URL=...).
# Read here, exported for the checks below, never echoed. FACTORY_RUNNER_ENV_FILE does the same from the environment.
ENV_FILE="${ENV_FILE:-${FACTORY_RUNNER_ENV_FILE:-}}"
if [ -n "$ENV_FILE" ]; then
  if [ ! -f "$ENV_FILE" ]; then echo "  FAIL env file not found: $ENV_FILE"; exit 2; fi
  URL_LINE="$(grep -a -m1 '^FACTORY_RUNNER_PG_URL=' "$ENV_FILE" | tr -d '\r')"
  if [ -z "$URL_LINE" ]; then echo "  FAIL $ENV_FILE has no FACTORY_RUNNER_PG_URL= line"; exit 2; fi
  export FACTORY_RUNNER_PG_URL="${URL_LINE#FACTORY_RUNNER_PG_URL=}"
  echo "  ok   FACTORY_RUNNER_PG_URL read from $ENV_FILE (not printed)"
fi
if [ -z "${FACTORY_RUNNER_PG_URL:-}" ]; then
  echo "  FAIL FACTORY_RUNNER_PG_URL is not set in this shell."
  echo "       Windows, persistent for this user:  setx FACTORY_RUNNER_PG_URL \"<url printed by provision-control-plane.mjs>\""
  echo "       then open a NEW shell. Nothing was registered."
  exit 2
fi
echo "  ok   FACTORY_RUNNER_PG_URL is set (not printed)"

# 2. the toolchain
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then echo "  FAIL node $NODE_MAJOR found; 20 or newer is required"; exit 2; fi
echo "  ok   node $(node -v)"
git --version >/dev/null 2>&1 || { echo "  FAIL git is not on PATH"; exit 2; }
echo "  ok   git $(git --version | cut -d' ' -f3) at $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD)"
if [ ! -d node_modules/pg ]; then
  echo "  ..   installing dependencies (npm ci)"
  npm ci --no-audit --no-fund >/dev/null 2>&1 || { echo "  FAIL npm ci failed"; exit 2; }
fi
echo "  ok   dependencies present"
if command -v claude >/dev/null 2>&1; then echo "  ok   claude CLI $(claude --version 2>/dev/null | head -1)"; else echo "  note claude CLI not on PATH - this node can hold the plane but cannot run an agent"; fi

# 3. the plane, link by link (refuses a superuser, a production project, or a network crossed in the clear)
echo
export FACTORY_NODE_ROLE="$ROLE"
if ! node scripts/factory-runner/plane-health.mjs --role "$ROLE"; then
  echo
  echo "  bootstrap stopped at the failing row above; nothing else was changed."
  exit 1
fi

echo
echo "  node id  $(node scripts/factory-runner/node.mjs id)"
echo "  role     $ROLE (registered on the plane; the claim enforces it from the node record)"
echo
echo "BOOTSTRAPPED. To start claiming work:  FACTORY_NODE_ROLE=$ROLE node scripts/factory-runner/node.mjs start"
echo "Two-machine acceptance:              qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md §E"
