/**
 * PURE usage math — no I/O, no React. Unit-tested in
 * tests/usage-calculator.test.ts. The poller is the only production caller.
 */

/** Normalize any MAC representation to uppercase colon-separated form. */
export function normalizeMac(input: string): string {
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return input.trim().toUpperCase();
  return (hex.match(/.{2}/g) ?? []).join(":");
}

/**
 * Delta between two cumulative counter readings.
 * Returns null when there is no previous reading or when the counter
 * went backwards (router reboot / queue reset) — callers MUST skip such
 * samples so negatives never reach the database.
 */
export function computeDelta(
  currentTotal: number,
  previousTotal: number | null | undefined,
): number | null {
  if (previousTotal === null || previousTotal === undefined) return null;
  if (!Number.isFinite(currentTotal) || !Number.isFinite(previousTotal)) {
    return null;
  }
  const delta = currentTotal - previousTotal;
  if (delta < 0) return null; // counter reset
  return delta;
}

/** Bits per second from a byte delta over a time window. */
export function bpsFromDelta(bytesDelta: number, seconds: number): number {
  if (!Number.isFinite(bytesDelta) || !Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return (bytesDelta * 8) / seconds;
}

/** Network convention: 1 Mbps = 10^6 bit/s. */
export function bpsToMbps(bps: number): number {
  return bps / 1_000_000;
}

export function mbpsToBps(mbps: number): number {
  return mbps * 1_000_000;
}

/** Local-time "YYYY-MM-DD" key for usage_daily. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local-time {year, month(1-12)} key for usage_monthly. */
export function monthKey(date: Date): { year: number; month: number } {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Sum of an array of {download, upload} byte pairs. */
export function sumUsage(
  rows: { downloadBytes: number; uploadBytes: number }[],
): { downloadBytes: number; uploadBytes: number } {
  let downloadBytes = 0;
  let uploadBytes = 0;
  for (const row of rows) {
    downloadBytes += row.downloadBytes ?? 0;
    uploadBytes += row.uploadBytes ?? 0;
  }
  return { downloadBytes, uploadBytes };
}
