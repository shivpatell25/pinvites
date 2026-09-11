import { describe, expect, it } from "vitest";

import { stepsFor } from "./RsvpSheet";
import type { PublicEvent, RsvpAccess } from "./types";

const event = {
  questions: [
    {
      id: "question-1",
    },
  ],
} as PublicEvent;

const invitationAccess = {
  kind: "INVITATION",
} as RsvpAccess;

const publicAccess = {
  kind: "PUBLIC",
} as RsvpAccess;

describe("RSVP step routing", () => {
  it("routes a decline directly to the farewell submission step", () => {
    expect(stepsFor(event, invitationAccess, "NO")).toEqual([
      "response",
      "decline",
    ]);
    expect(stepsFor(event, publicAccess, "NO")).toEqual([
      "response",
      "decline",
    ]);
  });

  it("preserves the full progressive flow for attending guests", () => {
    expect(stepsFor(event, publicAccess, "YES")).toEqual([
      "response",
      "contact",
      "party",
      "attendees",
      "questions",
      "note",
      "review",
    ]);
  });
});
