#!/usr/bin/env python3
"""Loopback-only PaddleOCR bridge for the OCR verifier benchmark.

The bridge deliberately accepts only the provider-neutral {model, images}
shape and returns normalized OCR lines. It never reads the source HEIC files;
the TypeScript evaluator supplies identical metadata-free JPEG derivatives to
every provider.
"""

import base64
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
from paddleocr import PaddleOCR


MAX_IMAGES = int(os.environ.get("PADDLEOCR_BRIDGE_MAX_IMAGES", "100"))
MAX_IMAGE_BYTES = int(os.environ.get("PADDLEOCR_BRIDGE_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))
OCR = PaddleOCR(
    lang=os.environ.get("PADDLEOCR_LANG", "en"),
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)


def fail(handler, status, code):
    payload = json.dumps({"error": {"code": code}}).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def point_box(points, width, height):
    if not isinstance(points, (list, tuple)) or len(points) < 2:
        return None
    try:
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
    except (TypeError, IndexError, ValueError):
        return None
    left, right = max(0.0, min(xs)), min(float(width), max(xs))
    top, bottom = max(0.0, min(ys)), min(float(height), max(ys))
    if right <= left or bottom <= top:
        return None
    return {
        "x": left / width,
        "y": top / height,
        "width": (right - left) / width,
        "height": (bottom - top) / height,
    }


def result_lines(result, width, height):
    """Adapt PaddleOCR 3.x Result objects and dicts to provider lines."""
    data = result.json if hasattr(result, "json") else result
    if callable(data):
        data = data()
    if isinstance(data, list):
        data = data[0] if data else {}
    # PaddleOCR 3.x serializes a Result as {"res": {...}}. Older releases
    # returned the inner mapping directly, so accept both shapes.
    while isinstance(data, dict) and isinstance(data.get("res"), dict):
        data = data["res"]
    if not isinstance(data, dict):
        return []
    texts = data.get("rec_texts", [])
    scores = data.get("rec_scores", [])
    polygons = data.get("dt_polys", data.get("rec_polys", []))
    lines = []
    for index, text in enumerate(texts):
        if not isinstance(text, str) or not text.strip():
            continue
        try:
            confidence = float(scores[index])
        except (IndexError, TypeError, ValueError):
            confidence = 0.0
        box = point_box(polygons[index] if index < len(polygons) else [], width, height)
        if box is not None:
            lines.append({"text": text, "confidence": max(0.0, min(1.0, confidence)), "box": box})
    return lines


class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        # Do not log paths, request bodies, image data, or OCR text.
        return

    def do_POST(self):
        if self.path != "/recognize":
            fail(self, 404, "not_found")
            return
        try:
            size = int(self.headers.get("content-length", "0"))
            if size <= 0 or size > MAX_IMAGES * MAX_IMAGE_BYTES * 2:
                fail(self, 413, "input_too_large")
                return
            payload = json.loads(self.rfile.read(size))
            images = payload.get("images") if isinstance(payload, dict) else None
            if not isinstance(images, list) or not 0 < len(images) <= MAX_IMAGES:
                fail(self, 400, "input_too_large")
                return
            results = []
            for item in images:
                if not isinstance(item, dict) or not isinstance(item.get("photoId"), str):
                    fail(self, 400, "invalid_request")
                    return
                encoded = item.get("imageBase64")
                if not isinstance(encoded, str) or len(encoded) > MAX_IMAGE_BYTES * 2:
                    fail(self, 413, "input_too_large")
                    return
                raw = base64.b64decode(encoded, validate=True)
                if not 0 < len(raw) <= MAX_IMAGE_BYTES:
                    fail(self, 413, "input_too_large")
                    return
                image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
                if image is None:
                    fail(self, 400, "unsupported_content")
                    return
                height, width = image.shape[:2]
                # PaddleOCR's 3.x Apple-silicon path is more stable when its
                # predictor receives a temporary JPEG path than a numpy view.
                # The file is removed immediately after prediction and never
                # contains source HEIC bytes or metadata.
                with tempfile.NamedTemporaryFile(suffix=".jpg") as temporary:
                    temporary.write(raw)
                    temporary.flush()
                    prediction = OCR.predict(temporary.name)
                prediction = prediction[0] if isinstance(prediction, (list, tuple)) else prediction
                results.append({"photoId": item["photoId"], "lines": result_lines(prediction, width, height)})
            body = json.dumps({"results": results}).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            fail(self, 502, "provider_unavailable")


if __name__ == "__main__":
    host = os.environ.get("PADDLEOCR_BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("PADDLEOCR_BRIDGE_PORT", "8765"))
    if host not in {"127.0.0.1", "localhost"}:
        print("PaddleOCR bridge must bind to loopback", file=sys.stderr)
        sys.exit(2)
    ThreadingHTTPServer((host, port), BridgeHandler).serve_forever()
