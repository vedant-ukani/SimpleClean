#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
ENV_DIR="$ROOT_DIR/.local-data/ocr-benchmark/paddle-venv"
PYTHON_BIN=${PYTHON_BIN:-python3}
mkdir -p "$ROOT_DIR/.local-data/ocr-benchmark"
"$PYTHON_BIN" -m venv "$ENV_DIR"
"$ENV_DIR/bin/python" -m pip install --upgrade pip
"$ENV_DIR/bin/python" -m pip install -r "$ROOT_DIR/tools/paddleocr-bridge/requirements.txt"
echo "PaddleOCR bridge environment ready under .local-data/ocr-benchmark/paddle-venv"
