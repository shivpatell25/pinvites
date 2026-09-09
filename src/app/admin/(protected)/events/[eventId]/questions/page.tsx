import {
  GitBranch,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Utensils,
} from "lucide-react";
import { notFound } from "next/navigation";

import {
  FieldShell,
  Input,
  Select,
  Textarea,
} from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { QuestionConditionOperator } from "@/generated/prisma/client";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

import {
  addMealOptionAction,
  addQuestionAction,
  addQuestionConditionAction,
  deleteQuestionConditionAction,
  toggleMealOptionAction,
  toggleQuestionAction,
} from "@/app/admin/events/[eventId]/questions/actions";

export default async function QuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      mealOptions: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      questions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          options: { orderBy: { sortOrder: "asc" } },
          conditions: {
            orderBy: { sortOrder: "asc" },
            include: {
              sourceQuestion: { select: { prompt: true } },
              option: { select: { label: true } },
            },
          },
        },
      },
    },
  });
  if (!event) notFound();
  return (
    <div className="grid gap-12 xl:grid-cols-[0.72fr_1.28fr]">
      <section>
        <div className="mb-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            Per attendee
          </p>
          <h2 className="editorial text-4xl">Meals</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Selections and dietary notes belong to each attendee, never the
            household RSVP.
          </p>
        </div>
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {event.mealOptions.map((meal) => (
            <div key={meal.id} className="flex items-center gap-3 py-4">
              <span className="grid size-9 place-items-center rounded-full bg-[var(--line)]">
                <Utensils size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{meal.name}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                  {meal.description ?? "No description"}
                </p>
              </div>
              <StatusBadge tone={meal.isActive ? "positive" : "neutral"}>
                {meal.isActive ? "Active" : "Hidden"}
              </StatusBadge>
              <form
                action={toggleMealOptionAction.bind(
                  null,
                  eventId,
                  meal.id,
                  !meal.isActive,
                )}
              >
                <button
                  className="grid size-9 place-items-center rounded-full hover:bg-[var(--line)]"
                  title={meal.isActive ? "Hide meal" : "Activate meal"}
                >
                  {meal.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                </button>
              </form>
            </div>
          ))}
        </div>
        {!event.mealOptions.length ? (
          <p className="border-y border-[var(--line)] py-8 text-center text-sm text-[var(--muted)]">
            No meal choices yet.
          </p>
        ) : null}
        <form
          action={addMealOptionAction.bind(null, eventId)}
          className="mt-6 grid gap-4"
        >
          <FieldShell label="Meal name" htmlFor="meal-name">
            <Input id="meal-name" name="name" required maxLength={120} />
          </FieldShell>
          <FieldShell label="Description" htmlFor="meal-description" optional>
            <Input id="meal-description" name="description" maxLength={300} />
          </FieldShell>
          <SubmitButton variant="secondary" className="justify-self-start">
            <Plus size={14} /> Add meal
          </SubmitButton>
        </form>
      </section>
      <section>
        <div className="mb-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            Progressive disclosure
          </p>
          <h2 className="editorial text-4xl">Custom questions</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Household or per-attendee questions can appear conditionally based
            on earlier answers.
          </p>
        </div>
        {query.error ? (
          <p
            className="mb-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
            role="alert"
          >
            {query.error}
          </p>
        ) : null}
        <div className="grid gap-4">
          {event.questions.map((question, index) => (
            <details
              key={question.id}
              className="border-t border-[var(--line-strong)] pt-4"
              open={false}
            >
              <summary className="flex cursor-pointer list-none items-start gap-4 pb-4">
                <span className="editorial text-3xl text-[var(--muted-2)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{question.prompt}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {question.scope === "ATTENDEE"
                      ? "Asked per attendee"
                      : "Asked once per household"}{" "}
                    · {question.type.toLowerCase().replaceAll("_", " ")}
                    {question.isRequired ? " · Required" : ""}
                  </p>
                </div>
                <StatusBadge tone={question.isActive ? "positive" : "neutral"}>
                  {question.isActive ? "Active" : "Hidden"}
                </StatusBadge>
              </summary>
              <div className="ml-0 border-l border-[var(--line)] pb-6 pl-5 sm:ml-12">
                {question.options.length ? (
                  <p className="mb-4 text-xs text-[var(--muted)]">
                    Options:{" "}
                    {question.options.map((option) => option.label).join(" · ")}
                  </p>
                ) : null}
                <div className="mb-5 flex gap-2">
                  <form
                    action={toggleQuestionAction.bind(
                      null,
                      eventId,
                      question.id,
                      !question.isActive,
                    )}
                  >
                    <button className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] px-3 text-xs font-semibold">
                      {question.isActive ? (
                        <PowerOff size={13} />
                      ) : (
                        <Power size={13} />
                      )}
                      {question.isActive ? "Hide" : "Activate"}
                    </button>
                  </form>
                </div>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  <GitBranch size={14} /> Conditions
                </h3>
                {question.conditions.map((condition) => (
                  <div
                    key={condition.id}
                    className="mb-2 flex items-center gap-3 bg-[var(--line)] px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1">
                      Show when “{condition.sourceQuestion.prompt}”{" "}
                      {condition.operator.toLowerCase().replaceAll("_", " ")}{" "}
                      {condition.option?.label ??
                        condition.textValue ??
                        (condition.booleanValue === null
                          ? ""
                          : condition.booleanValue
                            ? "Yes"
                            : "No")}
                    </span>
                    <form
                      action={deleteQuestionConditionAction.bind(
                        null,
                        eventId,
                        condition.id,
                      )}
                    >
                      <button
                        className="grid size-7 place-items-center"
                        title="Delete condition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </form>
                  </div>
                ))}
                {event.questions.length > 1 ? (
                  <form
                    action={addQuestionConditionAction.bind(
                      null,
                      eventId,
                      question.id,
                    )}
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <Select
                      name="sourceQuestionId"
                      aria-label="Source question"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        When this question…
                      </option>
                      {event.questions
                        .filter((candidate) => candidate.id !== question.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.prompt}
                          </option>
                        ))}
                    </Select>
                    <Select
                      name="operator"
                      aria-label="Condition operator"
                      defaultValue="EQUALS"
                    >
                      {Object.values(QuestionConditionOperator).map(
                        (operator) => (
                          <option key={operator} value={operator}>
                            {operator.toLowerCase().replaceAll("_", " ")}
                          </option>
                        ),
                      )}
                    </Select>
                    <Select
                      name="optionId"
                      aria-label="Choice option"
                      defaultValue=""
                    >
                      <option value="">No selected choice</option>
                      {event.questions
                        .filter(
                          (candidate) =>
                            candidate.id !== question.id &&
                            candidate.options.length > 0,
                        )
                        .map((candidate) => (
                          <optgroup key={candidate.id} label={candidate.prompt}>
                            {candidate.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </Select>
                    <Input
                      name="textValue"
                      placeholder="Text to compare"
                      aria-label="Comparison text"
                    />
                    <Select
                      name="booleanValue"
                      aria-label="Boolean comparison"
                      defaultValue=""
                    >
                      <option value="">No Yes/No value</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Select>
                    <SubmitButton
                      variant="secondary"
                      className="justify-self-start"
                    >
                      <Plus size={13} /> Add condition
                    </SubmitButton>
                  </form>
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    Add another question before creating a condition.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
        {!event.questions.length ? (
          <p className="border-y border-[var(--line)] py-10 text-center text-sm text-[var(--muted)]">
            No custom questions. The RSVP stays beautifully short.
          </p>
        ) : null}
        <details className="mt-8 border-y border-[var(--line)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-sm font-semibold">
            <Plus size={16} /> Add a question
          </summary>
          <form
            action={addQuestionAction.bind(null, eventId)}
            className="grid gap-5 pb-7 pt-2"
          >
            <FieldShell label="Question" htmlFor="prompt">
              <Input id="prompt" name="prompt" required maxLength={300} />
            </FieldShell>
            <FieldShell label="Help text" htmlFor="helpText" optional>
              <Input id="helpText" name="helpText" maxLength={500} />
            </FieldShell>
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldShell label="Answer type" htmlFor="type">
                <Select id="type" name="type">
                  <option value="SHORT_TEXT">Short text</option>
                  <option value="LONG_TEXT">Long text</option>
                  <option value="SINGLE_SELECT">One choice</option>
                  <option value="MULTI_SELECT">Multiple choices</option>
                  <option value="BOOLEAN">Yes / No</option>
                </Select>
              </FieldShell>
              <FieldShell label="Ask" htmlFor="scope">
                <Select id="scope" name="scope">
                  <option value="HOUSEHOLD">Once per household</option>
                  <option value="ATTENDEE">Each attendee</option>
                </Select>
              </FieldShell>
            </div>
            <FieldShell
              label="Choice options"
              htmlFor="options"
              optional
              hint="One per line; required only for choice questions."
            >
              <Textarea id="options" name="options" rows={4} />
            </FieldShell>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                name="isRequired"
                type="checkbox"
                className="size-5 accent-[var(--ink)]"
              />{" "}
              Required answer
            </label>
            <SubmitButton className="justify-self-start">
              Add question
            </SubmitButton>
          </form>
        </details>
      </section>
    </div>
  );
}
