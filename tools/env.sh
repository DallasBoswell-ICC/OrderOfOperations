# shared setup for the tools scripts (sourced, not run)
R=$(cd "$(dirname "$0")/.." && pwd)
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}
export NODE_PATH=${NODE_PATH:-/opt/npm-tools/node_modules}
