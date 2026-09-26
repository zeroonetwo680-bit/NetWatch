/**
 * Single source of truth for human-friendly formatting (Arabic units).
 * PURE — unit-tested. Never duplicate this logic inside components.
 */

const BYTE_UNITS = [
  "بايت",
  "كيلوبايت",
  "ميجابايت",
  "جيجابايت",
  "تيرابايت",
  "بيتابايت",
] as const;

/** 1536 → "1.5 كيلوبايت", 0 → "0 بايت". Binary (1024) steps. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`;
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** exp;
  const text =
    exp === 0
      ? String(Math.round(value))
      : trimZeros(value.toFixed(fractionDigits));
  return `${text} ${BYTE_UNITS[exp]}`;
}

/** 18.42 → "18.4 ميجابت/ث". Decimal (10^6) rates. */
export function formatMbps(mbps: number, fractionDigits = 1): string {
  if (!Number.isFinite(mbps) || mbps <= 0) return "0 ميجابت/ث";
  const text =
    mbps >= 100
      ? String(Math.round(mbps))
      : trimZeros(mbps.toFixed(fractionDigits));
  return `${text} ميجابت/ث`;
}

/** Compact bytes for tight table cells: 1536 → "1.5 KB" style with Arabic unit. */
export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0";
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** exp;
  const unit = ["B", "KB", "MB", "GB", "TB", "PB"][exp];
  return `${exp === 0 ? Math.round(value) : trimZeros(value.toFixed(1))} ${unit}`;
}

/** "14:05" from a Date (24h, local). */
export function formatClockTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function trimZeros(fixed: string): string {
  return fixed.replace(/\.0+$/, "");
}
