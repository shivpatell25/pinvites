import "server-only";

import { z } from "zod";

import type { PublicWeather } from "@/components/public/types";
import { getServerEnvironment } from "@/lib/env";

const forecastSchema = z.object({
  hourly: z.object({
    time: z.array(z.number()),
    temperature_2m: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
    wind_speed_10m: z.array(z.number().nullable()),
  }),
});

type ForecastEvent = {
  startsAt: Date;
  endsAt: Date | null;
  latitude: { toString(): string } | null;
  longitude: { toString(): string } | null;
};

const TEN_DAYS = 10 * 24 * 60 * 60 * 1_000;

function weatherSummary(code: number | null) {
  if (code === null) return "Forecast available";
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms possible";
}

export async function getEventWeather(
  event: ForecastEvent,
  now = new Date(),
): Promise<PublicWeather | null> {
  if (!event.latitude || !event.longitude) return null;
  const untilStart = event.startsAt.getTime() - now.getTime();
  const practicalEnd =
    event.endsAt?.getTime() ?? event.startsAt.getTime() + 4 * 60 * 60 * 1_000;
  if (untilStart > TEN_DAYS || now.getTime() > practicalEnd) return null;

  try {
    const environment = getServerEnvironment();
    const url = new URL(environment.WEATHER_FORECAST_URL);
    url.searchParams.set("latitude", event.latitude.toString());
    url.searchParams.set("longitude", event.longitude.toString());
    url.searchParams.set(
      "hourly",
      "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    );
    url.searchParams.set("timeformat", "unixtime");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("forecast_days", "10");
    if (environment.WEATHER_API_KEY) {
      url.searchParams.set("apikey", environment.WEATHER_API_KEY);
    }

    const response = await fetch(url, {
      next: { revalidate: 30 * 60 },
      signal: AbortSignal.timeout(3_500),
    });
    if (!response.ok) return null;
    const parsed = forecastSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.hourly.time.length === 0) return null;

    const targetSeconds = Math.floor(event.startsAt.getTime() / 1_000);
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const [index, timestamp] of parsed.data.hourly.time.entries()) {
      const distance = Math.abs(timestamp - targetSeconds);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    const hourly = parsed.data.hourly;
    const temperature = hourly.temperature_2m[closestIndex];
    const timestamp = hourly.time[closestIndex];
    if (temperature === null || temperature === undefined || !timestamp) {
      return null;
    }
    const code = hourly.weather_code[closestIndex] ?? null;
    const windSpeed = hourly.wind_speed_10m[closestIndex];
    return {
      summary: weatherSummary(code),
      temperature: Math.round(temperature),
      precipitationProbability:
        hourly.precipitation_probability[closestIndex] ?? null,
      windSpeed:
        windSpeed === null || windSpeed === undefined
          ? null
          : Math.round(windSpeed),
      forecastAt: new Date(timestamp * 1_000).toISOString(),
    };
  } catch {
    // Weather is helpful context, never a reason to make an invite unavailable.
    return null;
  }
}
