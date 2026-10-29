/** Invert one geometric driver near its current branch, without accepting invalid solver samples. */
export function invertMeasure(
  current: number,
  target: number,
  measure: (driver: number) => number | null,
  options: { min?: number; max?: number; guess?: number } = {},
): number | null {
  if (!Number.isFinite(target) || target < 0) return null;
  const min = options.min ?? 1e-9,
    max = options.max ?? Number.MAX_VALUE;
  const tolerance = Math.max(1e-6, Math.abs(target) * 1e-10);
  const samples = new Map<number, number | null>();
  const at = (x: number) => {
    if (!Number.isFinite(x) || x < min || x > max) return null;
    if (!samples.has(x)) {
      const y = measure(x);
      samples.set(x, y !== null && Number.isFinite(y) ? y - target : null);
    }
    return samples.get(x)!;
  };
  const f0 = at(current);
  if (f0 === null) return null;
  if (Math.abs(f0) <= tolerance) return current;
  let x = current,
    f = f0;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  let next = options.guess ?? current * (target / (f0 + target));
  // A local secant usually solves edge-length and scale edits in a few evaluations.
  for (let n = 0; n < 8; n++) {
    if (!Number.isFinite(next) || Math.abs(next - x) < Math.max(1e-12, Math.abs(x) * 1e-13))
      next =
        x +
        (x + Math.max(1e-4, Math.abs(x) * 0.001) <= max ? 1 : -1) *
          Math.max(1e-4, Math.abs(x) * 0.001);
    next = clamp(next);
    const y = at(next);
    if (y === null) break;
    if (Math.abs(y) <= tolerance) return next;
    const derivative = (y - f) / (next - x);
    const proposal = derivative && Number.isFinite(derivative) ? next - y / derivative : NaN;
    x = next;
    f = y;
    next = proposal;
  }
  for (let n = 0; n < 20; n++) {
    const sorted = [...samples].sort((a, b) => a[0] - b[0]);
    const brackets = sorted
      .slice(1)
      .flatMap(([b, fb], i) => {
        const [a, fa] = sorted[i]!;
        return fa !== null && fb !== null && fa * fb <= 0 ? [{ a, b, fa, fb }] : [];
      })
      .sort(
        (a, b) =>
          Math.abs(Math.log(Math.sqrt(a.a * a.b) / current)) -
          Math.abs(Math.log(Math.sqrt(b.a * b.b) / current)),
      );
    if (brackets.length) {
      let { a, b, fa, fb } = brackets[0]!;
      for (let j = 0; j < 45; j++) {
        const secant = a - (fa * (b - a)) / (fb - fa);
        const mid =
          Number.isFinite(secant) && secant > a + (b - a) * 0.1 && secant < b - (b - a) * 0.1
            ? secant
            : (a + b) / 2;
        const fm = at(mid);
        if (fm === null) return null;
        if (Math.abs(fm) <= tolerance) return mid;
        if (fa * fm <= 0) {
          b = mid;
          fb = fm;
        } else {
          a = mid;
          fa = fm;
        }
      }
      return null;
    }
    const factor = 1.35 ** (n + 1);
    at(clamp(current / factor));
    at(clamp(current * factor));
  }
  return null;
}
