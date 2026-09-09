export type DraftQuestionType =
  "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_SELECT" | "MULTI_SELECT" | "BOOLEAN";

export function toDraftAnswerValue({
  questionType,
  optionIds,
  booleanValue,
  textValue,
}: {
  questionType: DraftQuestionType | undefined;
  optionIds: readonly string[];
  booleanValue: boolean | null;
  textValue: string | null;
}): string | string[] | boolean {
  if (questionType === "SINGLE_SELECT") return optionIds[0] ?? "";
  if (optionIds.length > 0) return [...optionIds];
  return booleanValue ?? textValue ?? "";
}
