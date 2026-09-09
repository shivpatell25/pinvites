import { describe, expect, it } from "vitest";

import { toDraftAnswerValue } from "./rsvp-draft";

describe("toDraftAnswerValue", () => {
  it("restores a single-select answer as the scalar expected by radio inputs", () => {
    expect(
      toDraftAnswerValue({
        questionType: "SINGLE_SELECT",
        optionIds: ["option-a"],
        booleanValue: null,
        textValue: null,
      }),
    ).toBe("option-a");
  });

  it("keeps multi-select answers as arrays", () => {
    expect(
      toDraftAnswerValue({
        questionType: "MULTI_SELECT",
        optionIds: ["option-a", "option-b"],
        booleanValue: null,
        textValue: null,
      }),
    ).toEqual(["option-a", "option-b"]);
  });

  it("restores false boolean answers instead of treating them as empty", () => {
    expect(
      toDraftAnswerValue({
        questionType: "BOOLEAN",
        optionIds: [],
        booleanValue: false,
        textValue: null,
      }),
    ).toBe(false);
  });
});
