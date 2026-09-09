import { describe, expect, it } from "vitest";

import { exportGuestCsv, parseGuestCsv } from "./csv";

describe("guest CSV", () => {
  it("parses quoted RFC 4180 fields and validates normalized values", () => {
    const result = parseGuestCsv(
      'name,email,party_name,max_party_size,allow_plus_one,tags,notes\r\n"Ada, Jr.",ADA@EXAMPLE.COM,Lovelace,3,yes,"family; vip","Line one\nLine two"\r\n',
    );

    expect(result.canImport).toBe(true);
    expect(result.rows).toEqual([
      {
        name: "Ada, Jr.",
        email: "ada@example.com",
        phone: null,
        partyName: "Lovelace",
        maxPartySize: 3,
        allowPlusOne: true,
        tags: ["family", "vip"],
        notes: "Line one\nLine two",
      },
    ]);
  });

  it("prevents import when a row is invalid", () => {
    const result = parseGuestCsv(
      "name,email,max_party_size\nGuest,not-an-email,0\n",
    );

    expect(result.canImport).toBe(false);
    expect(result.invalidRows).toBe(1);
    expect(
      result.issues.filter((issue) => issue.severity === "error").length,
    ).toBeGreaterThan(0);
  });

  it("formula-protects exported cells and labels link-open data accurately", () => {
    const csv = exportGuestCsv([
      {
        name: "=CMD()",
        email: "guest@example.com",
        phone: "+1 555 0100",
        partyName: null,
        maxPartySize: 1,
        allowPlusOne: false,
        tags: [],
        notes: null,
        response: "YES",
        confirmedAttendees: 1,
        invitationLinkOpenedAt: "2026-01-02T03:04:05.000Z",
      },
    ]);

    expect(csv).toContain("invitation_link_opened_at");
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain("'+1 555 0100");
  });
});
