# Local PaddleOCR bridge

This bridge is an explicit, loopback-only compatibility service for the
`IntakeOcrVerifier` port. It accepts the evaluator's bounded request shape and
returns normalized OCR lines. It does not read the source corpus directly.

From the repository root:

```sh
tools/paddleocr-bridge/setup.sh
.local-data/ocr-benchmark/paddle-venv/bin/python tools/paddleocr-bridge/server.py
```

The service listens on `127.0.0.1:8765/recognize` by default. Override the
port with `PADDLEOCR_BRIDGE_PORT`, but keep `PADDLEOCR_BRIDGE_HOST` on
`127.0.0.1` or `localhost`. Model downloads and the virtual environment stay
under ignored `.local-data/ocr-benchmark/` paths.

The bridge sends the evaluator-provided JPEG bytes directly to PaddleOCR. For
the current 92-image comparison, configure the evaluator with
`INTAKE_RECOGNITION_MAX_PIXELS=1000000`; Google Vision must use that same
setting so both providers receive identical derivatives.
