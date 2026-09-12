export type EventTiming = {
  phase: "UPCOMING" | "SOON" | "LIVE" | "ENDED";
  label: string;
  isEventDay: boolean;
  millisecondsUntilStart: number;
};

const MINUTE = 60 * 1_000;
const HOUR = 60 * MINUTE;

function dayKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function countdown(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / MINUTE));
  if (totalMinutes >= 48 * 60) {
    return `${Math.ceil(totalMinutes / (24 * 60))} days`;
  }
  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.ceil((totalMinutes % (24 * 60)) / 60);
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${totalMinutes} min`;
}

export function getEventTiming(
  event: {
    startsAt: string;
    endsAt: string | null;
    timezone: string;
  },
  now = new Date(),
): EventTiming {
  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt
    ? new Date(event.endsAt)
    : new Date(startsAt.getTime() + 3 * HOUR);
  const millisecondsUntilStart = startsAt.getTime() - now.getTime();
  const isEventDay =
    dayKey(startsAt, event.timezone) === dayKey(now, event.timezone);

  if (now.getTime() >= endsAt.getTime()) {
    return {
      phase: "ENDED",
      label: "Event ended",
      isEventDay,
      millisecondsUntilStart,
    };
  }
  if (now.getTime() >= startsAt.getTime()) {
    return {
      phase: "LIVE",
      label: "Happening now",
      isEventDay: true,
      millisecondsUntilStart,
    };
  }
  if (millisecondsUntilStart <= 20 * MINUTE) {
    return {
      phase: "SOON",
      label: "Starting soon",
      isEventDay,
      millisecondsUntilStart,
    };
  }
  return {
    phase: "UPCOMING",
    label: `Starts in ${countdown(millisecondsUntilStart)}`,
    isEventDay,
    millisecondsUntilStart,
  };
}
