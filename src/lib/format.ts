export function formatDateTime(
  value: Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
    ...options,
  }).format(value);
}

export function formatDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: timezone,
  }).format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function dateTimeLocalValue(value: Date | null, timezone: string) {
  if (!value) return "";
  return formatInTimeZone(value, timezone, "yyyy-MM-dd'T'HH:mm");
}
import { formatInTimeZone } from "date-fns-tz";
