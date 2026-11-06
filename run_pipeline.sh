#!/usr/bin/env bash
# Runs the full pipeline. Python runs isolated (-I) because it reads downloaded data;
# the repo root is added to sys.path explicitly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CSV="${1:?path to measures_v2.csv}"; shift || true
PY="${PYTHON:-python3}"
export OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 NUMBA_NUM_THREADS=2
nice -n 10 "$PY" -I -c "import sys; sys.path.insert(0, sys.argv[1]); from pipeline.run_all import main; main(sys.argv[2], refit='--refit' in sys.argv)" "$ROOT" "$CSV" "$@"
