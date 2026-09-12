export type RsvpResponseValue = "YES" | "MAYBE" | "NO";

export type QuestionKind =
  "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "BOOLEAN";

export type PublicQuestionOption = {
  id: string;
  label: string;
};

export type PublicQuestionCondition = {
  sourceQuestionId: string;
  operator:
    | "EQUALS"
    | "NOT_EQUALS"
    | "CONTAINS"
    | "NOT_CONTAINS"
    | "IS_ANSWERED"
    | "IS_NOT_ANSWERED";
  optionId: string | null;
  textValue: string | null;
  booleanValue: boolean | null;
};

export type PublicQuestion = {
  id: string;
  prompt: string;
  description: string | null;
  kind: QuestionKind;
  scope: "HOUSEHOLD" | "ATTENDEE";
  required: boolean;
  visibleForResponses: RsvpResponseValue[];
  options: PublicQuestionOption[];
  conditions: PublicQuestionCondition[];
};

export type PublicMealOption = {
  id: string;
  name: string;
  description: string | null;
};

export type PublicEventUpdate = {
  id: string;
  message: string;
  isImportant: boolean;
  postedAt: string;
};

export type PublicWeather = {
  summary: string;
  temperature: number;
  precipitationProbability: number | null;
  windSpeed: number | null;
  forecastAt: string;
};

export type PublicEvent = {
  id: string;
  slug: string;
  isPublic: boolean;
  title: string;
  subtitle: string | null;
  hostName: string;
  description: string | null;
  details: string | null;
  artworkUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  isAllDay: boolean;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  venueUrl: string | null;
  dressCode: string | null;
  whatToBring: string | null;
  arrivalInstructions: string | null;
  primaryColor: string | null;
  rsvpDeadline: string | null;
  calendarUrl: string;
  status: "PUBLISHED" | "CLOSED";
  allowMaybe: boolean;
  partySizeLimit: number;
  updates: PublicEventUpdate[];
  weather: PublicWeather | null;
  questions: PublicQuestion[];
  mealOptions: PublicMealOption[];
};

export type PublicHouseholdMember = {
  guestId: string | null;
  fullName: string;
};

export type AttendeeDraft = {
  key: string;
  guestId: string | null;
  fullName: string;
  mealOptionId: string;
  dietaryRestrictions: string;
};

export type AnswerDraft = {
  questionId: string;
  subjectKey: string;
  value: string | string[] | boolean;
};

export type RsvpDraft = {
  response: RsvpResponseValue | null;
  contactName: string;
  contactEmail: string;
  attendees: AttendeeDraft[];
  answers: AnswerDraft[];
  message: string;
  revision: number | null;
};

export type RsvpAccess = {
  kind: "PUBLIC" | "INVITATION" | "MANAGEMENT";
  token: string | null;
  householdName: string | null;
  partySizeLimit: number;
  canRespond: boolean;
  members: PublicHouseholdMember[];
  currentResponse: RsvpResponseValue | null;
  initialRsvp: RsvpDraft | null;
};

export type RsvpActionState = {
  status: "IDLE" | "ERROR" | "SUCCESS";
  message: string | null;
  manageUrl: string | null;
  submittedResponse: RsvpResponseValue | null;
};

export type RsvpAction = (
  previousState: RsvpActionState,
  formData: FormData,
) => Promise<RsvpActionState>;

export const initialRsvpActionState: RsvpActionState = {
  status: "IDLE",
  message: null,
  manageUrl: null,
  submittedResponse: null,
};
