import { t } from "../i18n";
import { decodeInputs } from "../state/share";
import type { Inputs } from "../state/inputs";
import { openDialog } from "./dialog";
import { h } from "./dom";

/*
 * Reads the QR code printed on a report with the device camera.
 * Uses the browser's BarcodeDetector where it exists (Chromium on Android) and a JS decoder
 * elsewhere (Safari on iPhone/iPad). Frames never leave the device.
 */

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): Detector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

type Decode = (frame: HTMLCanvasElement) => Promise<string | null>;

async function createDecoder(): Promise<Decode> {
  const native = window.BarcodeDetector;
  if (native) {
    try {
      if ((await native.getSupportedFormats()).includes("qr_code")) {
        const detector = new native({ formats: ["qr_code"] });
        return async (frame) => (await detector.detect(frame))[0]?.rawValue ?? null;
      }
    } catch {
      // Fall through to the JS decoder.
    }
  }
  const { default: jsQR } = await import("jsqr");
  return async (frame) => {
    const ctx = frame.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, frame.width, frame.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

export function openScanner(root: HTMLElement, onInputs: (inputs: Inputs) => void): void {
  const video = h("video", { class: "scan-video", playsinline: true, muted: true, autoplay: true });
  // iOS only autoplays inline, muted video; the property matters, not just the attribute.
  video.muted = true;
  const status = h("p", { class: "scan-status", role: "status" }, t("scan.starting"));
  const body = h(
    "div",
    { class: "dialog-body" },
    h(
      "div",
      { class: "scan-frame" },
      video,
      h("span", { class: "scan-target", "aria-hidden": "true" }),
    ),
    status,
  );
  const dialog = openDialog(root, t("scan.title"), body);
  dialog.classList.add("dialog-scan");

  let stream: MediaStream | null = null;
  let timer = 0;
  let closed = false;
  const stop = () => {
    closed = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
  };
  dialog.addEventListener("close", stop);

  const fail = (key: "scan.noCamera" | "scan.denied" | "scan.insecure") => {
    status.textContent = t(key);
    status.dataset.tone = "error";
  };

  void (async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      return fail("scan.insecure");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e) {
      return fail(
        e instanceof DOMException && e.name === "NotAllowedError" ? "scan.denied" : "scan.noCamera",
      );
    }
    if (closed) return stop();
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    status.textContent = t("scan.aim");

    const decode = await createDecoder();
    const canvas = document.createElement("canvas");
    const tick = async () => {
      if (closed) return;
      const w = video.videoWidth,
        hgt = video.videoHeight;
      if (w && hgt) {
        // Decode a downscaled centre crop: faster, and the code is aimed at the centre anyway.
        const side = Math.min(w, hgt);
        const size = Math.min(side, 720);
        canvas.width = canvas.height = size;
        canvas
          .getContext("2d", { willReadFrequently: true })
          ?.drawImage(video, (w - side) / 2, (hgt - side) / 2, side, side, 0, 0, size, size);
        const text = await decode(canvas).catch(() => null);
        if (text) {
          const inputs = decodeInputs(text);
          if (inputs) {
            dialog.close();
            onInputs(inputs);
            return;
          }
          status.textContent = t("scan.foreign");
          status.dataset.tone = "error";
        }
      }
      timer = window.setTimeout(() => void tick(), 180);
    };
    void tick();
  })();
}
