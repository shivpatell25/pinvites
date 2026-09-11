"use client";

import Image from "next/image";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  ExternalLink,
  LockKeyhole,
  MapPin,
  Share2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { PinvitesBrand } from "./PinvitesBrand";
import { RsvpSheet } from "./RsvpSheet";
import styles from "./public-invitation.module.css";
import type { PublicEvent, RsvpAccess, RsvpAction } from "./types";

type InvitationExperienceProps = {
  event: PublicEvent;
  access: RsvpAccess;
  submitAction: RsvpAction;
  startWithRsvpOpen?: boolean;
};

function dateParts(event: PublicEvent) {
  const date = new Date(event.startsAt);
  const dateFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const monthFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    month: "short",
  });
  const dayFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    day: "numeric",
  });

  return {
    longDate: dateFormat.format(date),
    time: event.isAllDay ? "All day" : timeFormat.format(date),
    month: monthFormat.format(date),
    day: dayFormat.format(date),
  };
}

function localCalendarDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}${part("month")}${part("day")}`;
}

function nextCalendarDate(value: string) {
  const date = new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)) + 1,
    ),
  );
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function deadlineLabel(deadline: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(deadline));
}

function googleCalendarUrl(event: PublicEvent) {
  if (event.isAllDay) {
    const startDate = localCalendarDate(event.startsAt, event.timezone);
    const candidateEnd = event.endsAt
      ? localCalendarDate(event.endsAt, event.timezone)
      : null;
    const endDate =
      candidateEnd && candidateEnd > startDate
        ? candidateEnd
        : nextCalendarDate(startDate);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${startDate}/${endDate}`,
      details: event.description ?? "",
      location: [event.venueName, event.venueAddress]
        .filter(Boolean)
        .join(", "),
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }
  const start = new Date(event.startsAt);
  const end = event.endsAt
    ? new Date(event.endsAt)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const compact = (value: Date) =>
    value
      .toISOString()
      .replaceAll("-", "")
      .replaceAll(":", "")
      .replace(".000", "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compact(start)}/${compact(end)}`,
    details: event.description ?? "",
    location: [event.venueName, event.venueAddress].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function artworkAccent(image: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let weight = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      if (alpha < 180) continue;
      const r = (pixels[index] ?? 0) / 255;
      const g = (pixels[index + 1] ?? 0) / 255;
      const b = (pixels[index + 2] ?? 0) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const luminance = (max + min) / 2;
      if (saturation < 0.2 || luminance < 0.12 || luminance > 0.9) continue;
      const pixelWeight = saturation * (1 - Math.abs(luminance - 0.52));
      red += r * pixelWeight;
      green += g * pixelWeight;
      blue += b * pixelWeight;
      weight += pixelWeight;
    }
    if (!weight) return null;
    return `rgb(${Math.round((red / weight) * 255)} ${Math.round((green / weight) * 255)} ${Math.round((blue / weight) * 255)})`;
  } catch {
    return null;
  }
}

function artworkEdgeGradient(image: HTMLImageElement) {
  try {
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const renderedWidth = image.clientWidth;
    const renderedHeight = image.clientHeight;
    if (!naturalWidth || !naturalHeight || !renderedWidth || !renderedHeight) {
      return null;
    }

    const coverScale = Math.max(
      renderedWidth / naturalWidth,
      renderedHeight / naturalHeight,
    );
    const sourceWidth = renderedWidth / coverScale;
    const sourceHeight = renderedHeight / coverScale;
    const sourceX = (naturalWidth - sourceWidth) / 2;
    const sourceY = (naturalHeight - sourceHeight) / 2;
    const bandHeight = Math.max(1, sourceHeight * 0.055);
    const sampleWidth = 12;
    const sampleHeight = 4;
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(
      image,
      sourceX,
      sourceY + sourceHeight - bandHeight,
      sourceWidth,
      bandHeight,
      0,
      0,
      sampleWidth,
      sampleHeight,
    );
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const columns = Array.from({ length: sampleWidth }, (_, x) => {
      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;
      for (let y = 0; y < sampleHeight; y += 1) {
        const index = (y * sampleWidth + x) * 4;
        if ((pixels[index + 3] ?? 0) < 128) continue;
        red += pixels[index] ?? 0;
        green += pixels[index + 1] ?? 0;
        blue += pixels[index + 2] ?? 0;
        samples += 1;
      }
      const divisor = Math.max(1, samples);
      const averageRed = red / divisor;
      const averageGreen = green / divisor;
      const averageBlue = blue / divisor;
      const maximumChannel = Math.max(averageRed, averageGreen, averageBlue);
      const minimumChannel = Math.min(averageRed, averageGreen, averageBlue);
      const luminance =
        averageRed * 0.2126 + averageGreen * 0.7152 + averageBlue * 0.0722;
      const saturation =
        maximumChannel === 0
          ? 0
          : (maximumChannel - minimumChannel) / maximumChannel;

      return {
        red: averageRed,
        green: averageGreen,
        blue: averageBlue,
        luminance,
        saturation,
      };
    });
    const orderedLuminance = columns
      .map((column) => column.luminance)
      .sort((a, b) => a - b);
    const medianLuminance =
      orderedLuminance[Math.floor(orderedLuminance.length / 2)] ?? 0;
    const highlightThreshold = Math.max(72, medianLuminance * 1.18);
    const isPaleHighlight = (index: number) => {
      const column = columns[index];
      return Boolean(
        column &&
        column.luminance > highlightThreshold &&
        column.saturation < 0.6,
      );
    };
    const stops = columns.map((column, x) => {
      let corrected = column;
      if (isPaleHighlight(x)) {
        let left = x - 1;
        let right = x + 1;
        while (left >= 0 && isPaleHighlight(left)) left -= 1;
        while (right < columns.length && isPaleHighlight(right)) right += 1;
        const leftColumn = columns[left];
        const rightColumn = columns[right];

        if (leftColumn && rightColumn) {
          const mix = (x - left) / (right - left);
          corrected = {
            ...column,
            red: leftColumn.red + (rightColumn.red - leftColumn.red) * mix,
            green:
              leftColumn.green + (rightColumn.green - leftColumn.green) * mix,
            blue: leftColumn.blue + (rightColumn.blue - leftColumn.blue) * mix,
          };
        } else {
          corrected = leftColumn ?? rightColumn ?? column;
        }
      }

      const position = Math.round((x / (sampleWidth - 1)) * 100);
      return `rgb(${Math.round(corrected.red)} ${Math.round(corrected.green)} ${Math.round(corrected.blue)}) ${position}%`;
    });

    return `linear-gradient(90deg, ${stops.join(", ")})`;
  } catch {
    return null;
  }
}

function Artwork({
  event,
  onAccent,
  onEdge,
}: {
  event: PublicEvent;
  onAccent: (accent: string) => void;
  onEdge: (gradient: string) => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!event.artworkUrl || failed) {
    return <div className={styles.heroFallback} aria-hidden="true" />;
  }

  return (
    <Image
      src={event.artworkUrl}
      alt={`Artwork for ${event.title}`}
      fill
      sizes="(min-width: 980px) 56vw, 100vw"
      className={styles.heroArtwork}
      priority
      unoptimized
      onLoad={(image) => {
        const accent = artworkAccent(image.currentTarget);
        const edge = artworkEdgeGradient(image.currentTarget);
        if (accent) onAccent(accent);
        if (edge) onEdge(edge);
      }}
      onError={() => setFailed(true)}
    />
  );
}

function ArtworkExtension() {
  return (
    <div className={styles.heroColorExtension} aria-hidden="true">
      <div className={styles.heroColorExtensionCanvas} />
    </div>
  );
}

function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const shareData = { title, url: new URL(url, window.location.origin).href };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={share}
      aria-label={copied ? "Invitation link copied" : "Share invitation"}
      title={copied ? "Copied" : "Share"}
    >
      <Share2 size={24} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

export function InvitationExperience({
  event,
  access,
  submitAction,
  startWithRsvpOpen = false,
}: InvitationExperienceProps) {
  const [rsvpOpen, setRsvpOpen] = useState(startWithRsvpOpen);
  const [artworkAccent, setArtworkAccent] = useState<string | null>(null);
  const [artworkEdge, setArtworkEdge] = useState<string | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const date = useMemo(() => dateParts(event), [event]);
  const existing = access.initialRsvp?.response;
  const mapUrl =
    event.venueUrl ??
    (event.venueAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueAddress)}`
      : null);
  const greeting = access.householdName
    ? `${access.householdName}, you’re invited.`
    : "You’re invited.";

  const accent = artworkAccent ?? event.primaryColor ?? "#0a84ff";

  return (
    <div
      className={styles.shell}
      style={
        {
          "--event-accent": accent,
          "--event-accent-soft": `color-mix(in srgb, ${accent} 16%, transparent)`,
          "--hero-edge-gradient":
            artworkEdge ??
            `linear-gradient(90deg, color-mix(in srgb, ${accent} 36%, #09090b), #09090b 52%, color-mix(in srgb, ${accent} 24%, #09090b))`,
        } as CSSProperties
      }
    >
      <a className={styles.skipLink} href="#invitation-details">
        Skip to invitation details
      </a>

      <div
        className={styles.scrollRegion}
        onScroll={(scrollEvent) => {
          setHasScrolled(scrollEvent.currentTarget.scrollTop > 8);
        }}
      >
        <header className={styles.hero} aria-labelledby="event-title">
          <Artwork
            event={event}
            onAccent={setArtworkAccent}
            onEdge={setArtworkEdge}
          />
          <div className={styles.heroScrim} aria-hidden="true" />
          <ArtworkExtension />
          <div className={styles.heroBar}>
            {event.isPublic ? (
              <ShareButton
                title={event.title}
                url={`/e/${encodeURIComponent(event.slug)}`}
              />
            ) : (
              <span className={styles.heroControlSpacer} aria-hidden="true" />
            )}
            <span className={styles.heroMark}>
              <PinvitesBrand
                compact
                className={styles.heroMarkImage}
                priority
              />
            </span>
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.host}>Hosted by {event.hostName}</p>
            <h1 className={styles.title} id="event-title">
              {event.title}
            </h1>
            {event.subtitle ? (
              <p className={styles.subtitle}>{event.subtitle}</p>
            ) : null}
            <p className={styles.heroDate}>{date.longDate}</p>
          </div>
        </header>

        <main className={styles.main} id="invitation-details">
          <div className={styles.content}>
            <PinvitesBrand reversed className={styles.contentBrand} priority />
            <section
              className={styles.personalGreeting}
              aria-labelledby="greeting-title"
            >
              <p className={styles.eyebrow}>A personal invitation</p>
              <h2 className={styles.greeting} id="greeting-title">
                {greeting}
              </h2>
              {event.description ? (
                <p className={styles.intro}>{event.description}</p>
              ) : null}
            </section>

            <dl className={styles.facts} aria-label="Event details">
              <div className={styles.fact}>
                <div className={styles.factDate} aria-hidden="true">
                  <span className={styles.factMonth}>{date.month}</span>
                  <span className={styles.factDay}>{date.day}</span>
                </div>
                <div>
                  <dt>Date &amp; time</dt>
                  <dd>
                    <span className={styles.factTitle}>{date.longDate}</span>
                    {date.time}
                  </dd>
                </div>
                <span className={styles.rowActions}>
                  <a
                    className={`${styles.rowAction} ${styles.focusable}`}
                    href={event.calendarUrl}
                    aria-label="Download calendar file"
                    title="Apple Calendar / ICS"
                  >
                    <CalendarDays
                      size={21}
                      strokeWidth={1.7}
                      aria-hidden="true"
                    />
                  </a>
                  <a
                    className={`${styles.rowAction} ${styles.focusable}`}
                    href={googleCalendarUrl(event)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Add event to Google Calendar"
                    title="Google Calendar"
                  >
                    <ExternalLink
                      size={18}
                      strokeWidth={1.7}
                      aria-hidden="true"
                    />
                  </a>
                </span>
              </div>

              {event.venueName || event.venueAddress ? (
                <div className={styles.fact}>
                  <div className={styles.factIcon} aria-hidden="true">
                    <MapPin size={21} strokeWidth={1.7} />
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      {event.venueName ? (
                        <span className={styles.factTitle}>
                          {event.venueName}
                        </span>
                      ) : null}
                      {event.venueAddress}
                    </dd>
                  </div>
                  {mapUrl ? (
                    <a
                      className={`${styles.rowAction} ${styles.focusable}`}
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open location in Maps"
                    >
                      <ExternalLink
                        size={20}
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                    </a>
                  ) : null}
                </div>
              ) : null}
            </dl>

            {event.details ? (
              <section
                className={styles.editorialDetails}
                aria-labelledby="details-title"
              >
                <p className={styles.eyebrow}>Good to know</p>
                <h2 className={styles.sectionTitle} id="details-title">
                  A few details for the day.
                </h2>
                <p className={styles.detailsText}>{event.details}</p>
              </section>
            ) : null}

            {event.rsvpDeadline ? (
              <p className={styles.deadline}>
                <Clock3 size={17} strokeWidth={1.8} aria-hidden="true" />
                Please reply by{" "}
                {deadlineLabel(event.rsvpDeadline, event.timezone)}.
              </p>
            ) : null}

            <p className={styles.privacyNote}>
              <LockKeyhole size={16} strokeWidth={1.8} aria-hidden="true" />
              Your response is private and only visible to the host.
            </p>
          </div>
        </main>
      </div>

      <div
        className={`${styles.scrollCue} ${hasScrolled ? styles.scrollCueHidden : ""}`}
        aria-hidden="true"
      >
        <ChevronDown strokeWidth={1.8} />
        <ChevronDown strokeWidth={1.8} />
      </div>

      <div className={styles.stickyBar} role="region" aria-label="RSVP actions">
        <div className={styles.stickyInner}>
          {event.status === "PUBLISHED" && access.canRespond ? (
            <>
              <div className={styles.statusCopy}>
                <span className={styles.statusLabel}>
                  {existing ? "Your reply" : "Will you join us?"}
                </span>
                <span className={styles.statusValue}>
                  {existing
                    ? existing === "YES"
                      ? "Going"
                      : existing === "MAYBE"
                        ? "Maybe"
                        : "Unable to attend"
                    : `Up to ${access.partySizeLimit} ${access.partySizeLimit === 1 ? "guest" : "guests"}`}
                </span>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setRsvpOpen(true)}
              >
                {existing ? "Update RSVP" : "RSVP"}
              </button>
            </>
          ) : (
            <div className={styles.closedBanner}>
              {event.status === "CLOSED"
                ? "This event is no longer accepting responses."
                : "Your response is already recorded. Use your private management link to make changes."}
            </div>
          )}
        </div>
      </div>

      <RsvpSheet
        event={event}
        access={access}
        action={submitAction}
        open={rsvpOpen}
        onClose={() => setRsvpOpen(false)}
      />
    </div>
  );
}
