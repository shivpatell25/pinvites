import { describe, expect, it } from "vitest";

import { dateTimeLocalValue } from "./format";

describe("dateTimeLocalValue", () => {
  it("uses the event timezone rather than the server process timezone", () => {
    const instant = new Date("2026-09-02T01:30:00.000Z");

    expect(dateTimeLocalValue(instant, "America/Denver")).toBe(
      "2026-09-01T19:30",
    );
    expect(dateTimeLocalValue(instant, "Asia/Tokyo")).toBe("2026-09-02T10:30");
  });
});
