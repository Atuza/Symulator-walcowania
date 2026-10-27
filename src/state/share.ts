import { defaultInputs, inputsSchema, type Inputs } from "./inputs";

/*
 * Calculation link: the inputs travel in the URL fragment, which never reaches the server.
 * Only fields that differ from the defaults are written, to keep QR codes small.
 */

const PREFIX = "#c=";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeInputs(inputs: Inputs): string {
  const diff: Partial<Record<keyof Inputs, unknown>> = {};
  for (const key of Object.keys(inputs) as (keyof Inputs)[]) {
    if (inputs[key] !== defaultInputs[key]) diff[key] = inputs[key];
  }
  return PREFIX + toBase64Url(JSON.stringify(diff));
}

export function shareUrl(base: string, inputs: Inputs): string {
  return base.split("#")[0] + encodeInputs(inputs);
}

/** Inputs from a fragment, or null when it is absent or not a valid calculation link. */
export function decodeInputs(hash: string): Inputs | null {
  if (!hash.startsWith(PREFIX) || hash.length > 4000) return null;
  try {
    const diff: unknown = JSON.parse(fromBase64Url(hash.slice(PREFIX.length)));
    if (typeof diff !== "object" || diff === null || Array.isArray(diff)) return null;
    const parsed = inputsSchema.safeParse({ ...defaultInputs, ...diff });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
