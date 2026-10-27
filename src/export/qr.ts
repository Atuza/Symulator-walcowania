import qrcode from "qrcode-generator";

/**
 * QR module matrix (true = dark) for a URL. Level L keeps the code coarse (fewer, larger modules),
 * which matters more for scanning from paper or a screen than damage tolerance does here.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "L");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
