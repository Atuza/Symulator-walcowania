import { inputsSchema, type Inputs } from "./inputs";

/*
 * Calculation link: the inputs travel in the URL fragment, which never reaches the server.
 *
 * Format 3:  #c=3;t=12,5;D=1500;s=k
 * Only fields that differ from LINK_DEFAULTS are written, with short keys, so printed QR codes stay
 * coarse enough to scan. The defaults are frozen here on purpose: changing the app's defaults must
 * not change what an already printed link means.
 *
 * Legacy (0.9):  #c=<base64url JSON>  with full field names, read for links already on paper.
 */

const PREFIX = "#c=";
const VERSION = "3";

const LINK_DEFAULTS: Inputs = {
  shape: "cylinder",
  mode: "fromDiameter",
  materialId: "s355j2",
  thickness: "10",
  dimension: "diameter",
  surface: "inner",
  value: "1000",
  length: "",
  width: "2000",
  dLarge: "1200",
  dSmall: "600",
  height: "800",
  flatEnds: false,
  flatLength: "",
  k: "",
  reActual: "",
  calibration: "",
  cylinderCalibration: false,
  cylinderCalibrationModel: "constant",
  customRe: "",
  customE: "",
  customDensity: "",
  sizeA: "",
  sizeB: "",
  sizeR: "",
  angle: "",
  freeSegs: "",
  offset: "",
  profileSegs: "",
  profileClosed: false,
};

// Version 1 remains frozen. Version 2 enables the new cylinder profile without enlarging every QR.
const LINK_V2_DEFAULTS: Inputs = { ...LINK_DEFAULTS, cylinderCalibration: true };
// Version 3 selects the thickness-scaled grade profile. Versions 1 and 2 keep their cut models.
const LINK_V3_DEFAULTS: Inputs = { ...LINK_V2_DEFAULTS, cylinderCalibrationModel: "thickness" };

const KEYS: Record<keyof Inputs, string> = {
  shape: "s",
  mode: "m",
  materialId: "mi",
  thickness: "t",
  dimension: "dm",
  surface: "sf",
  value: "v",
  length: "l",
  width: "w",
  dLarge: "D",
  dSmall: "d",
  height: "h",
  flatEnds: "f",
  flatLength: "fl",
  k: "k",
  reActual: "re",
  calibration: "c",
  cylinderCalibration: "lc",
  cylinderCalibrationModel: "lm",
  customRe: "cr",
  customE: "ce",
  customDensity: "cd",
  sizeA: "a",
  sizeB: "b",
  sizeR: "r",
  angle: "an",
  freeSegs: "fs",
  offset: "e",
  profileSegs: "ps",
  profileClosed: "pc",
};

// One-letter codes for enumerated values.
const CODES: Partial<Record<keyof Inputs, Record<string, string>>> = {
  shape: {
    cylinder: "c",
    cone: "k",
    eccentric: "ec",
    halfround: "hr",
    ushape: "u",
    obround: "ob",
    rect: "re",
    tank: "tk",
    bucket: "bk",
    ellipse: "el",
    free: "fr",
  },
  mode: { fromDiameter: "d", fromLength: "l" },
  dimension: { diameter: "d", radius: "r" },
  surface: { inner: "i", mid: "m", outer: "o" },
  cylinderCalibrationModel: { constant: "b", thickness: "t" },
};

const FIELD_BY_KEY = new Map(
  Object.entries(KEYS).map(([field, key]) => [key, field as keyof Inputs]),
);

/** Escapes only what would break the format; decimal commas stay readable. */
function escape(value: string): string {
  return encodeURIComponent(value).replace(/%2C/gi, ",");
}

export function encodeInputs(inputs: Inputs): string {
  const parts = [VERSION];
  for (const field of Object.keys(KEYS) as (keyof Inputs)[]) {
    const value = inputs[field];
    if (value === LINK_V3_DEFAULTS[field]) continue;
    const text =
      typeof value === "boolean" ? (value ? "1" : "0") : (CODES[field]?.[value] ?? value);
    parts.push(`${KEYS[field]}=${escape(text)}`);
  }
  return PREFIX + parts.join(";");
}

export function shareUrl(base: string, inputs: Inputs): string {
  return base.split("#")[0] + encodeInputs(inputs);
}

/** Inputs from a fragment (or a whole URL), or null when it is not a valid calculation link. */
export function decodeInputs(link: string): Inputs | null {
  const at = link.indexOf(PREFIX);
  if (at < 0 || link.length > 4000) return null;
  const payload = link.slice(at + PREFIX.length);
  try {
    const compact = /^(1|2|3)(;|$)/.test(payload);
    const raw = compact ? decodeCompact(payload) : decodeLegacy(payload);
    if (!raw) return null;
    const defaults =
      payload === VERSION || payload.startsWith(`${VERSION};`)
        ? LINK_V3_DEFAULTS
        : payload === "2" || payload.startsWith("2;")
          ? LINK_V2_DEFAULTS
          : LINK_DEFAULTS;
    const parsed = inputsSchema.safeParse({ ...defaults, ...raw });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function decodeCompact(payload: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const part of payload.split(";").slice(1)) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 1) return null;
    const field = FIELD_BY_KEY.get(part.slice(0, eq));
    if (!field) return null;
    const text = decodeURIComponent(part.slice(eq + 1));
    if (field === "flatEnds" || field === "profileClosed" || field === "cylinderCalibration")
      out[field] = text === "1";
    else {
      const codes = CODES[field];
      const decoded = codes ? Object.entries(codes).find(([, code]) => code === text)?.[0] : text;
      if (decoded === undefined) return null;
      out[field] = decoded;
    }
  }
  return out;
}

function decodeLegacy(payload: string): Record<string, unknown> | null {
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  const diff: unknown = JSON.parse(json);
  if (typeof diff !== "object" || diff === null || Array.isArray(diff)) return null;
  // 0.9 links were relative to the defaults of that version, where the allowance was already off.
  return diff as Record<string, unknown>;
}
