"use client";

import jsQrModule, { type Options, type QRCode } from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";

import { tokenFromPrintedQrValue } from "../../../lib/qr-client";

type DecodeQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: Options,
) => QRCode | null;
const decodeQr = (
  "default" in jsQrModule ? jsQrModule.default : jsQrModule
) as DecodeQr;

type CameraStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "invalid"
  | "unsupported"
  | "permission"
  | "no_camera"
  | "busy_camera"
  | "error";

const cameraMessage: Record<CameraStatus, string> = {
  idle: "Point your camera at a printed Machine label after starting the scanner.",
  starting: "Starting the camera…",
  scanning: "Scanning for a Machine QR label. Hold the label steady inside the preview.",
  invalid:
    "That QR code is not a Laundrorama Machine label. Keep scanning or enter the printed fallback code.",
  unsupported:
    "This browser cannot access the camera here. Open this same localhost or HTTPS page in Chrome or Safari, or enter the fallback code.",
  permission:
    "Camera access was denied. Allow camera access in your browser settings, then try again, or enter the fallback code.",
  no_camera:
    "No camera is available. Connect a camera or enter the printed fallback code.",
  busy_camera:
    "The camera is busy or cannot be read. Close another camera app, then try again, or enter the fallback code.",
  error: "The camera could not scan this label. Try again or enter the fallback code.",
};

function isConstraintFailure(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    ["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(error.name)
  );
}

function cameraFailure(error: unknown): CameraStatus {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "permission";
    if (error.name === "SecurityError" || error.name === "NotSupportedError")
      return "unsupported";
    if (error.name === "NotFoundError" || isConstraintFailure(error))
      return "no_camera";
    if (["NotReadableError", "AbortError"].includes(error.name))
      return "busy_camera";
  }
  return "error";
}

export function QrCameraScanner({
  online,
  busy,
  onToken,
}: Readonly<{
  online: boolean;
  busy: boolean;
  onToken: (token: string) => void;
}>) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const stop = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = false;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        setStatus("idle");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [stop]);

  useEffect(() => {
    if (!online || busy) {
      stop();
      setStatus("idle");
    }
  }, [online, busy, stop]);

  async function start() {
    if (!online || busy || startingRef.current || streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    startingRef.current = true;
    const generation = ++generationRef.current;
    setStatus("starting");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (error) {
        if (!isConstraintFailure(error) || generation !== generationRef.current)
          throw error;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }
      if (generation !== generationRef.current || document.hidden) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (generation !== generationRef.current) return;
      setStatus("scanning");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Camera frame decoding is unavailable");

      const sample = () => {
        if (generation !== generationRef.current) return;
        try {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            const scale = Math.min(
              1,
              1280 / Math.max(video.videoWidth, video.videoHeight),
            );
            canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const decoded = decodeQr(frame.data, frame.width, frame.height, {
              inversionAttempts: "dontInvert",
            });
            if (decoded) {
              const token = tokenFromPrintedQrValue(
                decoded.data,
                window.location.origin,
              );
              if (token) {
                stop();
                setStatus("idle");
                onToken(token);
                return;
              }
              if (statusRef.current !== "invalid") setStatus("invalid");
            }
          }
          timerRef.current = setTimeout(sample, 100);
        } catch {
          stop();
          setStatus("error");
        }
      };
      timerRef.current = setTimeout(sample, 100);
    } catch (error) {
      if (generation === generationRef.current) {
        stop();
        setStatus(cameraFailure(error));
      }
    } finally {
      if (generation === generationRef.current) startingRef.current = false;
    }
  }

  const active = status === "starting" || status === "scanning" || status === "invalid";
  return (
    <div className="qr-camera-scanner">
      <div className="qr-camera-actions">
        {active ? (
          <button className="secondary-button" type="button" onClick={() => { stop(); setStatus("idle"); }}>
            Stop camera
          </button>
        ) : (
          <button disabled={!online || busy} type="button" onClick={() => void start()}>
            Scan QR code
          </button>
        )}
      </div>
      <p className={["unsupported", "permission", "no_camera", "busy_camera", "error"].includes(status) ? "form-error" : "scan-status"} role="status" aria-live="polite">
        {online ? cameraMessage[status] : "Reconnect before scanning a private Machine label."}
      </p>
      <div className={`qr-camera-preview${active ? " qr-camera-preview--active" : ""}`}>
        <video aria-label="Live camera preview for Machine QR labels" autoPlay muted playsInline ref={videoRef} />
      </div>
    </div>
  );
}
