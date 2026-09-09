"use client";

import {
  Check,
  CheckCircle2,
  ChevronLeft,
  HelpCircle,
  Minus,
  Plus,
  X,
  XCircle,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import styles from "./public-invitation.module.css";
import {
  initialRsvpActionState,
  type AnswerDraft,
  type AttendeeDraft,
  type PublicEvent,
  type PublicQuestion,
  type RsvpAccess,
  type RsvpAction,
  type RsvpDraft,
  type RsvpResponseValue,
} from "./types";

type RsvpSheetProps = {
  event: PublicEvent;
  access: RsvpAccess;
  action: RsvpAction;
  open: boolean;
  onClose: () => void;
};

type StepId =
  | "response"
  | "contact"
  | "party"
  | "attendees"
  | "questions"
  | "note"
  | "review";

function newKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function emptyAttendee(member?: {
  guestId: string | null;
  fullName: string;
}): AttendeeDraft {
  return {
    key: member?.guestId ?? newKey(),
    guestId: member?.guestId ?? null,
    fullName: member?.fullName ?? "",
    mealOptionId: "",
    dietaryRestrictions: "",
  };
}

function createInitialDraft(access: RsvpAccess): RsvpDraft {
  if (access.initialRsvp) return access.initialRsvp;

  return {
    response: null,
    contactName: access.householdName ?? access.members[0]?.fullName ?? "",
    contactEmail: "",
    attendees:
      access.members.length > 0
        ? access.members
            .slice(0, access.partySizeLimit)
            .map((member) => emptyAttendee(member))
        : [emptyAttendee()],
    answers: [],
    message: "",
    revision: null,
  };
}

function getAnswer(
  answers: AnswerDraft[],
  questionId: string,
  subjectKey: string,
) {
  return answers.find(
    (answer) =>
      answer.questionId === questionId && answer.subjectKey === subjectKey,
  )?.value;
}

function isPresentAnswer(value: AnswerDraft["value"] | undefined) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "boolean";
}

function conditionMatches(
  condition: PublicQuestion["conditions"][number],
  answers: AnswerDraft[],
  subjectKey: string,
) {
  const value =
    getAnswer(answers, condition.sourceQuestionId, subjectKey) ??
    getAnswer(answers, condition.sourceQuestionId, "household");
  if (condition.operator === "IS_ANSWERED") return isPresentAnswer(value);
  if (condition.operator === "IS_NOT_ANSWERED") return !isPresentAnswer(value);
  const expected =
    condition.optionId ?? condition.textValue ?? condition.booleanValue;
  const contains = Array.isArray(value)
    ? typeof expected === "string" && value.includes(expected)
    : typeof value === "string" && typeof expected === "string"
      ? value.toLocaleLowerCase().includes(expected.toLocaleLowerCase())
      : value === expected;
  const equals = Array.isArray(value)
    ? typeof expected === "string" && value.includes(expected)
    : value === expected;
  if (condition.operator === "EQUALS") return equals;
  if (condition.operator === "NOT_EQUALS") return !equals;
  if (condition.operator === "CONTAINS") return contains;
  return !contains;
}

function questionVisible(
  question: PublicQuestion,
  answers: AnswerDraft[],
  subjectKey: string,
  response: RsvpResponseValue | null,
) {
  if (!response || !question.visibleForResponses.includes(response))
    return false;
  return question.conditions.every((condition) =>
    conditionMatches(condition, answers, subjectKey),
  );
}

function stepsFor(
  event: PublicEvent,
  access: RsvpAccess,
  response: RsvpResponseValue | null,
): StepId[] {
  const attending = response === "YES" || response === "MAYBE";
  const steps: StepId[] = ["response"];
  if (access.kind === "PUBLIC") steps.push("contact");
  if (attending) steps.push("party", "attendees");
  if (event.questions.length > 0) steps.push("questions");
  steps.push("note", "review");
  return steps;
}

function responseLabel(response: RsvpResponseValue | null) {
  if (response === "YES") return "Joyfully attending";
  if (response === "MAYBE") return "Maybe attending";
  if (response === "NO") return "Unable to attend";
  return "Not selected";
}

function questionAnswered(
  question: PublicQuestion,
  value: AnswerDraft["value"] | undefined,
) {
  if (!question.required) return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "boolean";
}

export function RsvpSheet({
  event,
  access,
  action,
  open,
  onClose,
}: RsvpSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<RsvpDraft>(() =>
    createInitialDraft(access),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [actionState, formAction, pending] = useActionState(
    action,
    initialRsvpActionState,
  );
  const steps = useMemo(
    () => stepsFor(event, access, draft.response),
    [access, draft.response, event],
  );
  const activeStepIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[activeStepIndex] ?? "response";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [actionState.status, open]);

  function setResponse(response: RsvpResponseValue) {
    setDraft((current) => {
      const attendees =
        response === "NO"
          ? current.attendees
          : current.attendees.length > 0
            ? current.attendees
            : [emptyAttendee(access.members[0])];
      const attendeeQuestionIds = new Set(
        event.questions
          .filter((question) => question.scope === "ATTENDEE")
          .map((question) => question.id),
      );
      return {
        ...current,
        response,
        attendees,
        answers:
          response === "NO"
            ? current.answers.filter(
                (answer) => !attendeeQuestionIds.has(answer.questionId),
              )
            : current.answers,
      };
    });
    setStepIndex((current) =>
      Math.min(current, stepsFor(event, access, response).length - 1),
    );
    setLocalError(null);
  }

  function resizeParty(size: number) {
    const safeSize = Math.max(1, Math.min(access.partySizeLimit, size));
    setDraft((current) => {
      if (safeSize === current.attendees.length) return current;
      if (safeSize < current.attendees.length) {
        const attendees = current.attendees.slice(0, safeSize);
        const retainedKeys = new Set(attendees.map((attendee) => attendee.key));
        return {
          ...current,
          attendees,
          answers: current.answers.filter(
            (answer) =>
              answer.subjectKey === "household" ||
              retainedKeys.has(answer.subjectKey),
          ),
        };
      }
      const attendees = [...current.attendees];
      while (attendees.length < safeSize) {
        attendees.push(emptyAttendee(access.members[attendees.length]));
      }
      return { ...current, attendees };
    });
  }

  function updateAttendee(index: number, patch: Partial<AttendeeDraft>) {
    setDraft((current) => ({
      ...current,
      attendees: current.attendees.map((attendee, attendeeIndex) =>
        attendeeIndex === index ? { ...attendee, ...patch } : attendee,
      ),
    }));
  }

  function setAnswer(
    questionId: string,
    subjectKey: string,
    value: AnswerDraft["value"],
  ) {
    setDraft((current) => ({
      ...current,
      answers: [
        ...current.answers.filter(
          (answer) =>
            answer.questionId !== questionId ||
            answer.subjectKey !== subjectKey,
        ),
        { questionId, subjectKey, value },
      ],
    }));
  }

  function validateCurrentStep() {
    if (step === "response" && !draft.response)
      return "Choose a response to continue.";
    if (step === "contact") {
      if (!draft.contactName.trim()) return "Enter your name to continue.";
      if (!/^\S+@\S+\.\S+$/.test(draft.contactEmail))
        return "Enter a valid email address.";
    }
    if (
      step === "attendees" &&
      draft.attendees.some((attendee) => !attendee.fullName.trim())
    ) {
      return "Add a name for each person in your party.";
    }
    if (step === "questions") {
      for (const question of event.questions) {
        const subjectKeys =
          question.scope === "ATTENDEE"
            ? draft.attendees.map((attendee) => attendee.key)
            : ["household"];
        for (const subjectKey of subjectKeys) {
          if (
            questionVisible(
              question,
              draft.answers,
              subjectKey,
              draft.response,
            ) &&
            !questionAnswered(
              question,
              getAnswer(draft.answers, question.id, subjectKey),
            )
          ) {
            return `Please answer “${question.prompt}”.`;
          }
        }
      }
    }
    return null;
  }

  function next() {
    const error = validateCurrentStep();
    if (error) {
      setLocalError(error);
      return;
    }
    setLocalError(null);
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    dialogRef.current
      ?.querySelector<HTMLDivElement>(`.${styles.sheetScroller}`)
      ?.scrollTo(0, 0);
  }

  function back() {
    setLocalError(null);
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function close() {
    if (pending) return;
    dialogRef.current?.close();
    onClose();
  }

  if (actionState.status === "SUCCESS") {
    return (
      <dialog
        ref={dialogRef}
        className={styles.sheet}
        onClose={onClose}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className={styles.success} aria-live="polite">
          <div>
            <div className={styles.successMark} aria-hidden="true">
              <Check size={36} strokeWidth={1.8} />
            </div>
            <h2 className={styles.successTitle}>
              {actionState.submittedResponse === "NO"
                ? "Thank you for letting us know."
                : "Your reply is in."}
            </h2>
            <p className={styles.successText}>{actionState.message}</p>
            {actionState.manageUrl ? (
              <a className={styles.manageLink} href={actionState.manageUrl}>
                View or change your RSVP
              </a>
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={close}
              >
                Done
              </button>
            )}
          </div>
        </div>
      </dialog>
    );
  }

  const serverError =
    actionState.status === "ERROR" ? actionState.message : null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-labelledby="rsvp-step-title"
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <form action={formAction} className={styles.sheetForm}>
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="accessKind" value={access.kind} />
        <input type="hidden" name="accessToken" value={access.token ?? ""} />
        <input type="hidden" name="payload" value={JSON.stringify(draft)} />
        <input
          className={styles.visuallyHidden}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <div className={styles.sheetHeader}>
          {activeStepIndex > 0 ? (
            <button
              type="button"
              className={styles.sheetIconButton}
              onClick={back}
              aria-label="Go back"
            >
              <ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}
          <div
            className={styles.sheetProgress}
            aria-label={`Step ${activeStepIndex + 1} of ${steps.length}`}
          >
            {steps.map((stepName, index) => (
              <span
                key={stepName}
                className={`${styles.progressDot} ${index === activeStepIndex ? styles.progressDotActive : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.sheetIconButton}
            onClick={close}
            aria-label="Close RSVP"
          >
            <X size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.sheetScroller}>
          <div className={styles.sheetBody} key={step}>
            {step === "response" ? (
              <ResponseStep
                event={event}
                value={draft.response}
                onChange={setResponse}
              />
            ) : null}
            {step === "contact" ? (
              <ContactStep draft={draft} onChange={setDraft} />
            ) : null}
            {step === "party" ? (
              <PartyStep
                count={draft.attendees.length}
                max={access.partySizeLimit}
                onChange={resizeParty}
              />
            ) : null}
            {step === "attendees" ? (
              <AttendeesStep
                event={event}
                attendees={draft.attendees}
                onChange={updateAttendee}
              />
            ) : null}
            {step === "questions" ? (
              <QuestionsStep
                questions={event.questions}
                answers={draft.answers}
                attendees={draft.attendees}
                response={draft.response}
                onChange={setAnswer}
              />
            ) : null}
            {step === "note" ? (
              <NoteStep
                value={draft.message}
                onChange={(message) =>
                  setDraft((current) => ({ ...current, message }))
                }
              />
            ) : null}
            {step === "review" ? (
              <ReviewStep draft={draft} event={event} />
            ) : null}

            {localError || serverError ? (
              <div className={styles.errorBanner} role="alert">
                {localError ?? serverError}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.sheetFooter}>
          {step === "review" ? (
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={pending}
            >
              {pending
                ? "Sending…"
                : access.initialRsvp
                  ? "Save changes"
                  : "Send RSVP"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={next}
            >
              Continue
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

function ResponseStep({
  event,
  value,
  onChange,
}: {
  event: PublicEvent;
  value: RsvpResponseValue | null;
  onChange: (response: RsvpResponseValue) => void;
}) {
  const responses: Array<{
    value: RsvpResponseValue;
    title: string;
    description: string;
    icon: typeof CheckCircle2;
  }> = [
    {
      value: "YES",
      title: "Yes",
      description: "I’ll be there",
      icon: CheckCircle2,
    },
    ...(event.allowMaybe
      ? [
          {
            value: "MAYBE" as const,
            title: "Maybe",
            description: "I’m not certain yet",
            icon: HelpCircle,
          },
        ]
      : []),
    { value: "NO", title: "No", description: "I can’t make it", icon: XCircle },
  ];

  return (
    <>
      <p className={styles.stepKicker}>Your reply</p>
      <h2 className={styles.stepTitle} id="rsvp-step-title">
        Will you join us?
      </h2>
      <p className={styles.stepHint}>
        Choose what feels right. You can update your answer later using your
        private link.
      </p>
      <div
        className={styles.responseGrid}
        role="radiogroup"
        aria-label="RSVP response"
      >
        {responses.map((response) => {
          const Icon = response.icon;
          const selected = value === response.value;
          return (
            <button
              key={response.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${styles.responseOption} ${selected ? styles.responseOptionSelected : ""}`}
              onClick={() => onChange(response.value)}
            >
              <span className={styles.responseIcon} aria-hidden="true">
                <Icon size={24} strokeWidth={1.6} />
              </span>
              <span>
                <span className={styles.responseName}>{response.title}</span>
                <span className={styles.responseDescription}>
                  {response.description}
                </span>
              </span>
              <span className={styles.selectedCheck} aria-hidden="true">
                <Check size={13} strokeWidth={2.4} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ContactStep({
  draft,
  onChange,
}: {
  draft: RsvpDraft;
  onChange: (draft: RsvpDraft) => void;
}) {
  return (
    <>
      <p className={styles.stepKicker}>About you</p>
      <h2 className={styles.stepTitle} id="rsvp-step-title">
        Who’s replying?
      </h2>
      <p className={styles.stepHint}>
        We’ll use this only for your RSVP and the private link that lets you
        make changes.
      </p>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <span className={styles.label}>Your name</span>
          <input
            className={styles.input}
            value={draft.contactName}
            autoComplete="name"
            enterKeyHint="next"
            maxLength={120}
            onChange={(event) =>
              onChange({ ...draft, contactName: event.target.value })
            }
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Email address</span>
          <input
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="done"
            maxLength={254}
            value={draft.contactEmail}
            onChange={(event) =>
              onChange({ ...draft, contactEmail: event.target.value })
            }
          />
        </label>
      </div>
    </>
  );
}

function PartyStep({
  count,
  max,
  onChange,
}: {
  count: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <>
      <p className={styles.stepKicker}>Your party</p>
      <h2 className={styles.stepTitle} id="rsvp-step-title">
        How many are coming?
      </h2>
      <p className={styles.stepHint}>
        Your invitation allows up to {max} {max === 1 ? "person" : "people"},
        including you.
      </p>
      <div className={styles.counter} aria-label="Number attending">
        <button
          type="button"
          className={styles.counterButton}
          onClick={() => onChange(count - 1)}
          disabled={count <= 1}
          aria-label="Remove one person"
        >
          <Minus size={22} aria-hidden="true" />
        </button>
        <output className={styles.counterValue} aria-live="polite">
          {count}
        </output>
        <button
          type="button"
          className={styles.counterButton}
          onClick={() => onChange(count + 1)}
          disabled={count >= max}
          aria-label="Add one person"
        >
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

function AttendeesStep({
  event,
  attendees,
  onChange,
}: {
  event: PublicEvent;
  attendees: AttendeeDraft[];
  onChange: (index: number, patch: Partial<AttendeeDraft>) => void;
}) {
  return (
    <>
      <p className={styles.stepKicker}>Guest details</p>
      <h2 className={styles.stepTitle} id="rsvp-step-title">
        Tell us who’s coming.
      </h2>
      <p className={styles.stepHint}>
        Meals and dietary notes belong to each person, so the host can plan
        accurately.
      </p>
      <div className={styles.attendeeList}>
        {attendees.map((attendee, index) => (
          <fieldset className={styles.attendee} key={attendee.key}>
            <legend className={styles.attendeeLegend}>Guest {index + 1}</legend>
            <div className={styles.fieldGroup}>
              <label className={styles.field}>
                <span className={styles.label}>Full name</span>
                <input
                  className={styles.input}
                  value={attendee.fullName}
                  autoComplete={index === 0 ? "name" : "off"}
                  maxLength={120}
                  onChange={(event) =>
                    onChange(index, { fullName: event.target.value })
                  }
                />
              </label>
              {event.mealOptions.length > 0 ? (
                <label className={styles.field}>
                  <span className={styles.label}>
                    Meal choice{" "}
                    <span className={styles.labelOptional}>— optional</span>
                  </span>
                  <select
                    className={styles.select}
                    value={attendee.mealOptionId}
                    onChange={(event) =>
                      onChange(index, { mealOptionId: event.target.value })
                    }
                  >
                    <option value="">Choose a meal</option>
                    {event.mealOptions.map((meal) => (
                      <option value={meal.id} key={meal.id}>
                        {meal.name}
                        {meal.description ? ` — ${meal.description}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={styles.field}>
                <span className={styles.label}>
                  Dietary needs{" "}
                  <span className={styles.labelOptional}>— optional</span>
                </span>
                <input
                  className={styles.input}
                  value={attendee.dietaryRestrictions}
                  maxLength={500}
                  placeholder="Allergies or dietary requirements"
                  onChange={(event) =>
                    onChange(index, { dietaryRestrictions: event.target.value })
                  }
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>
    </>
  );
}

function QuestionsStep({
  questions,
  answers,
  attendees,
  response,
  onChange,
}: {
  questions: PublicQuestion[];
  answers: AnswerDraft[];
  attendees: AttendeeDraft[];
  response: RsvpResponseValue | null;
  onChange: (
    questionId: string,
    subjectKey: string,
    value: AnswerDraft["value"],
  ) => void;
}) {
  const questionInstances = questions.flatMap((question) => {
    const subjects =
      question.scope === "ATTENDEE"
        ? response === "NO"
          ? []
          : attendees.map((attendee) => ({
              key: attendee.key,
              label: attendee.fullName,
            }))
        : [{ key: "household", label: "" }];
    return subjects
      .filter((subject) =>
        questionVisible(question, answers, subject.key, response),
      )
      .map((subject) => ({ question, subject }));
  });

  return (
    <>
      <p className={styles.stepKicker}>From the host</p>
      <h2 className={styles.stepTitle} id="rsvp-step-title">
        A couple of things.
      </h2>
      <p className={styles.stepHint}>
        A little information helps make the event feel effortless for everyone.
      </p>
      <div>
        {questionInstances.map(({ question, subject }) => {
          const answer = getAnswer(answers, question.id, subject.key);
          const fieldId = `question-${question.id}-${subject.key}`;
          return (
            <div className={styles.question} key={fieldId}>
              <label className={styles.questionPrompt} htmlFor={fieldId}>
                {question.prompt}
                {subject.label ? ` — ${subject.label}` : ""}
                {question.required ? " *" : ""}
              </label>
              {question.description ? (
                <span className={styles.questionDescription}>
                  {question.description}
                </span>
              ) : null}
              {question.kind === "SHORT_TEXT" ||
              question.kind === "LONG_TEXT" ? (
                question.kind === "LONG_TEXT" ? (
                  <textarea
                    id={fieldId}
                    className={styles.textarea}
                    value={typeof answer === "string" ? answer : ""}
                    maxLength={2000}
                    onChange={(event) =>
                      onChange(question.id, subject.key, event.target.value)
                    }
                  />
                ) : (
                  <input
                    id={fieldId}
                    className={styles.input}
                    value={typeof answer === "string" ? answer : ""}
                    maxLength={500}
                    onChange={(event) =>
                      onChange(question.id, subject.key, event.target.value)
                    }
                  />
                )
              ) : null}
              {question.kind === "SINGLE_CHOICE" ? (
                <div className={styles.choiceList} id={fieldId}>
                  {question.options.map((option) => (
                    <label className={styles.choice} key={option.id}>
                      <input
                        type="radio"
                        name={fieldId}
                        checked={answer === option.id}
                        onChange={() =>
                          onChange(question.id, subject.key, option.id)
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {question.kind === "MULTIPLE_CHOICE" ? (
                <div className={styles.choiceList} id={fieldId}>
                  {question.options.map((option) => {
                    const values = Array.isArray(answer) ? answer : [];
                    return (
                      <label className={styles.choice} key={option.id}>
                        <input
                          type="checkbox"
                          checked={values.includes(option.id)}
                          onChange={(event) =>
                            onChange(
                              question.id,
                              subject.key,
                              event.target.checked
                                ? [...values, option.id]
                                : values.filter((value) => value !== option.id),
                            )
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {question.kind === "BOOLEAN" ? (
                <div className={styles.choiceList} id={fieldId}>
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((option) => (
                    <label className={styles.choice} key={option.label}>
                      <input
                        type="radio"
                        name={fieldId}
                        checked={answer === option.value}
                        onChange={() =>
                          onChange(question.id, subject.key, option.value)
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function NoteStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <p className={styles.stepKicker}>One last thing</p>
      <h2 className={styles.stepTitle} id="rsvp-step-title">
        Leave a note for the host.
      </h2>
      <p className={styles.stepHint}>
        Entirely optional—share a thought, a question, or just a little
        excitement.
      </p>
      <label className={styles.field}>
        <span className={styles.visuallyHidden}>Message to the host</span>
        <textarea
          className={styles.textarea}
          value={value}
          maxLength={2000}
          placeholder="Write a message…"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </>
  );
}

function ReviewStep({
  draft,
  event,
}: {
  draft: RsvpDraft;
  event: PublicEvent;
}) {
  const mealById = new Map(
    event.mealOptions.map((meal) => [meal.id, meal.name]),
  );
  return (
    <>
      <p className={styles.stepKicker}>Ready to send</p>
      <h2 className={styles.stepTitle} id="rsvp-step-title">
        One quick look.
      </h2>
      <p className={styles.stepHint}>
        Make sure everything feels right. Your response can still be changed
        later.
      </p>
      <dl className={styles.reviewList}>
        <div className={styles.reviewRow}>
          <dt>Response</dt>
          <dd>{responseLabel(draft.response)}</dd>
        </div>
        {draft.response !== "NO" ? (
          <div className={styles.reviewRow}>
            <dt>Party</dt>
            <dd>
              {draft.attendees
                .map(
                  (attendee) =>
                    `${attendee.fullName}${attendee.mealOptionId ? ` · ${mealById.get(attendee.mealOptionId) ?? "Meal selected"}` : ""}`,
                )
                .join("; ")}
            </dd>
          </div>
        ) : null}
        {draft.message ? (
          <div className={styles.reviewRow}>
            <dt>Message</dt>
            <dd>{draft.message}</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}
