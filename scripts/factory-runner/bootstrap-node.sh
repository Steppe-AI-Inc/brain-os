#!/usr/bin/env bash
# ONE NODE BOOTSTRAP, IDENTICAL ON EVERY COMPUTER.
#
#   bash scripts/factory-runner/bootstrap-node.sh --role generic      # Home PC (implementation + generic work)
#   bash scripts/factory-runner/bootstrap-node.sh --role verifier     # Work PC (independent acceptance authority)
#   bash scripts/factory-runner/bootstrap-node.sh                     # a node already registered: its role is KEPT as the plane
#                                                                     # holds it (a first bootstrap without --role registers generic)
#
# There is no Home-PC script and no Work-PC script: the only thing that differs is the security role the node
# registers on the plane, and the plane's node record - not the machine - is what the claim enforces.
#
# It needs FACTORY_RUNNER_PG_URL in the environment (set by the founder from provision-control-plane.mjs's output;
# never committed, never written under the checkout). It refuses to proceed without it, prints the URL nowhere,
# and stops at the first failing link so the fix is named rather than guessed.
set -u
ROLE=""
ENV_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) echo "unknown argument: $1"; exit 2 ;;
  esac
done
case "$ROLE" in ""|generic|verifier|release_broker) ;; *) echo "role must be generic | verifier | release_broker"; exit 2 ;; esac

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT" || exit 2

echo "factory node bootstrap  role=${ROLE:-(kept as the plane holds it)}  checkout=$ROOT"
echo

# 1. the URL - its absence is the designed refusal, reported as a setup step
# --env-file <path>: the file provision-control-plane.mjs --write-env produced (one line, FACTORY_RUNNER_PG_URL=...).
# Read here, exported for the checks below, never echoed. FACTORY_RUNNER_ENV_FILE does the same from the environment.
ENV_FILE="${ENV_FILE:-${FACTORY_RUNNER_ENV_FILE:-}}"
if [ -n "$ENV_FILE" ]; then
  if [ ! -f "$ENV_FILE" ]; then echo "  FAIL env file not found: $ENV_FILE"; exit 2; fi
  # the shared loader resolves the CA path for this machine (runner-env.mjs); the URL itself is never printed. The note goes
  # to a temp file, not under .factory/ - a fresh clone has no .factory/ yet, and redirecting into a missing directory failed
  # the whole step (found 2026-09-24 on a clean clone).
  NOTE_FILE="$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/factory-env-note.$$")"
  # a URL whose CA file exists nowhere on this machine is refused here: verify-full would fail closed on every connection
  LOADED="$(node -e "import('./scripts/factory-runner/runner-env.mjs').then(m=>{const r=m.loadRunnerUrl(process.argv[1]);if(!r.usable){console.error(r.note);process.exit(2)}process.stdout.write(r.url);console.error(r.note)})" "$ENV_FILE" 2>"$NOTE_FILE")" || { cat "$NOTE_FILE" 2>/dev/null; rm -f "$NOTE_FILE"; echo "  FAIL could not load $ENV_FILE"; exit 2; }
  export FACTORY_RUNNER_PG_URL="$LOADED"
  echo "  ok   FACTORY_RUNNER_PG_URL read from $ENV_FILE (not printed; $(cat "$NOTE_FILE" 2>/dev/null))"; rm -f "$NOTE_FILE"
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
# the runtime dependencies, installed from the COMMITTED package-lock.json and at its versions (deps.mjs) - not merely "a
# pg folder exists", which a stale or hand-made install also satisfies. npm's own output is shown when it fails.
[ -f package-lock.json ] || { echo "  FAIL package-lock.json is missing - this checkout is not a Factory candidate (npm ci installs from the committed lock)"; exit 2; }
# npm < 11 ignores package.json allowScripts: every locked install script runs. The committed lock's scripted packages are all
# approved (package regression K5), so nothing extra runs today - but the policy is only ENFORCED from npm 11 on. And only
# `npm ci` leaves the lock untouched on every npm; `npm install` on npm 10 rewrites it.
NPM_MAJOR="$(npm -v 2>/dev/null | cut -d. -f1)"
if [ -n "$NPM_MAJOR" ] && [ "$NPM_MAJOR" -lt 11 ] 2>/dev/null; then echo "  note npm $(npm -v) does not enforce allowScripts (npm 11+ does); the locked install scripts are all approved, so this is not a refusal"; fi
if ! DEPLINE="$(node scripts/factory-runner/deps.mjs 2>&1)"; then
  echo "  ..   $DEPLINE"
  echo "  ..   installing the locked dependencies (npm ci)"
  if ! NPMOUT="$(npm ci --no-audit --no-fund 2>&1)"; then echo "$NPMOUT" | tail -12 | sed 's/^/       /'; echo "  FAIL npm ci failed"; exit 2; fi
  DEPLINE="$(node scripts/factory-runner/deps.mjs 2>&1)" || { echo "  FAIL $DEPLINE"; exit 2; }
fi
echo "  ok   $DEPLINE"
if command -v claude >/dev/null 2>&1; then echo "  ok   claude CLI $(claude --version 2>/dev/null | head -1)"; else echo "  note claude CLI not on PATH - this node can hold the plane but cannot run an agent"; fi

# 3. the plane, link by link (refuses a superuser, a production project, or a network crossed in the clear)
echo
# A ROLE IS CHANGED ONLY WHEN ONE IS GIVEN. Without --role this passed --role generic and demoted a running verifier until its
# worker's next beat (final verification 2026-09-24): now the role the plane holds is kept.
if [ -n "$ROLE" ]; then
  export FACTORY_NODE_ROLE="$ROLE"
  plane_health() { node scripts/factory-runner/plane-health.mjs --role "$ROLE"; }
else
  plane_health() { node scripts/factory-runner/plane-health.mjs; }
fi
if ! plane_health; then
  echo
  echo "  bootstrap stopped at the failing row above; nothing else was changed."
  exit 1
fi

echo
echo "  node id  $(node scripts/factory-runner/node.mjs id)"
HELD="$(node scripts/factory-runner/node.mjs status --json 2>/dev/null | tail -1 | node -e "let s='';process.stdin.on('data',(d)=>{s+=d}).on('end',()=>{try{process.stdout.write(JSON.parse(s).role||'')}catch{}})")"
ROLE="${ROLE:-${HELD:-generic}}"
echo "  role     $ROLE (as the plane holds it for this node; the claim enforces it from the node record)"
echo
# The next step must work in THIS shell. node.mjs does not read the env file (the URL came from --env-file into this script's
# environment only), so after --env-file the command printed is the supervisor, which reads the file itself.
# On Windows the node runs under the scheduled task, never a terminal: a supervisor started by hand holds the checkout, and
# the installer then has to stop it first (it does). The path is printed in Windows form for PowerShell.
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) IS_WIN=1 ;; *) IS_WIN=0 ;; esac
if [ -n "$ENV_FILE" ] && [ "$IS_WIN" = 1 ]; then
  WIN_ENV="$(cygpath -w "$ENV_FILE" 2>/dev/null || echo "$ENV_FILE")"
  echo "BOOTSTRAPPED. To start claiming work (and after every reboot), from PowerShell in this checkout:"
  echo "  powershell -ExecutionPolicy Bypass -File scripts\\factory-runner\\install-autostart.ps1 -Role $ROLE -EnvFile \"$WIN_ENV\" -Start"
elif [ -n "$ENV_FILE" ]; then
  echo "BOOTSTRAPPED. To start claiming work:  node scripts/factory-runner/node-supervisor.mjs --runner-env \"$ENV_FILE\" --role $ROLE"
else
  echo "BOOTSTRAPPED. To start claiming work:  FACTORY_NODE_ROLE=$ROLE node scripts/factory-runner/node.mjs start"
fi
echo "Two-machine acceptance:              qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md §E"
