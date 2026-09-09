import { z } from "zod";

export type CsvCell = string | number | boolean | Date | null | undefined;

export interface ParsedCsvRecord {
  rowNumber: number;
  values: readonly string[];
}

export interface ParsedCsvDocument {
  headers: readonly string[];
  records: readonly ParsedCsvRecord[];
}

export interface CsvIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  rowNumber?: number;
  field?: keyof GuestCsvRow | "headers";
}

export interface GuestCsvRow {
  name: string;
  email: string | null;
  phone: string | null;
  partyName: string | null;
  maxPartySize: number;
  allowPlusOne: boolean;
  tags: readonly string[];
  notes: string | null;
}

export interface GuestCsvPreviewRow {
  rowNumber: number;
  values: Partial<GuestCsvRow>;
  valid: boolean;
  issues: readonly CsvIssue[];
}

export interface GuestCsvImportResult {
  rows: readonly GuestCsvRow[];
  preview: readonly GuestCsvPreviewRow[];
  issues: readonly CsvIssue[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canImport: boolean;
}

export interface GuestCsvOptions {
  maxBytes?: number;
  maxRows?: number;
  previewRows?: number;
}

export interface GuestCsvExportRow extends GuestCsvRow {
  response?: "YES" | "MAYBE" | "NO" | null;
  confirmedAttendees?: number | null;
  invitationSentAt?: Date | string | null;
  invitationLinkOpenedAt?: Date | string | null;
  respondedAt?: Date | string | null;
}

export interface CsvDownload {
  body: string;
  headers: Readonly<Record<string, string>>;
}

export class CsvSyntaxError extends Error {
  readonly rowNumber: number;
  readonly columnNumber: number;

  constructor(message: string, rowNumber: number, columnNumber: number) {
    super(`${message} at row ${rowNumber}, column ${columnNumber}.`);
    this.name = "CsvSyntaxError";
    this.rowNumber = rowNumber;
    this.columnNumber = columnNumber;
  }
}

const guestRowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(200, "Name must be 200 characters or fewer."),
  email: z
    .string()
    .trim()
    .email("Email is invalid.")
    .max(320, "Email must be 320 characters or fewer.")
    .nullable(),
  phone: z
    .string()
    .trim()
    .max(50, "Phone must be 50 characters or fewer.")
    .nullable(),
  partyName: z
    .string()
    .trim()
    .max(200, "Party name must be 200 characters or fewer.")
    .nullable(),
  maxPartySize: z
    .number()
    .int()
    .min(1, "Party size must be at least 1.")
    .max(50, "Party size cannot exceed 50."),
  allowPlusOne: z.boolean(),
  tags: z
    .array(z.string().trim().min(1).max(80))
    .max(50, "A guest can have at most 50 tags."),
  notes: z
    .string()
    .trim()
    .max(2_000, "Notes must be 2,000 characters or fewer.")
    .nullable(),
});

const HEADER_ALIASES = {
  name: ["name", "guest_name", "full_name", "primary_guest", "contact_name"],
  email: ["email", "email_address", "contact_email"],
  phone: ["phone", "phone_number", "mobile"],
  partyName: ["party_name", "household", "household_name", "group_name"],
  maxPartySize: [
    "max_party_size",
    "party_size",
    "allowed_party_size",
    "maximum_party_size",
  ],
  allowPlusOne: ["allow_plus_one", "plus_one", "plus_one_allowed", "allow_1"],
  tags: ["tags", "labels"],
  notes: ["notes", "note"],
} as const satisfies Record<keyof GuestCsvRow, readonly string[]>;

const FIELD_ORDER = Object.keys(HEADER_ALIASES) as (keyof GuestCsvRow)[];

export function parseCsvDocument(
  source: string,
  options: { maxBytes?: number; maxRows?: number } = {},
): ParsedCsvDocument {
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRows = options.maxRows ?? 10_000;
  if (new TextEncoder().encode(source).length > maxBytes) {
    throw new Error(`CSV exceeds the ${maxBytes.toLocaleString()} byte limit.`);
  }
  if (source.includes("\0")) throw new Error("CSV contains a null byte.");

  const records = tokenizeCsv(source.replace(/^\uFEFF/, ""), maxRows + 1);
  const nonEmptyRecords = records.filter((record) =>
    record.values.some((value) => value.trim() !== ""),
  );
  if (!nonEmptyRecords.length) throw new Error("CSV is empty.");

  const [headerRecord, ...dataRecords] = nonEmptyRecords;
  if (!headerRecord) throw new Error("CSV is missing a header row.");
  if (dataRecords.length > maxRows) {
    throw new Error(`CSV exceeds the ${maxRows.toLocaleString()} row limit.`);
  }

  const headers = headerRecord.values.map((header) => header.trim());
  if (headers.some((header) => !header))
    throw new Error("CSV headers cannot be blank.");

  return { headers, records: dataRecords };
}

export function parseGuestCsv(
  source: string,
  options: GuestCsvOptions = {},
): GuestCsvImportResult {
  const document = parseCsvDocument(source, {
    ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
    ...(options.maxRows !== undefined ? { maxRows: options.maxRows } : {}),
  });
  const previewLimit = options.previewRows ?? 25;
  if (
    !Number.isInteger(previewLimit) ||
    previewLimit < 1 ||
    previewLimit > 250
  ) {
    throw new Error("CSV previewRows must be an integer between 1 and 250.");
  }

  const mapping = mapHeaders(document.headers);
  const issues: CsvIssue[] = [...mapping.issues];
  const parsedRows: GuestCsvRow[] = [];
  const preview: GuestCsvPreviewRow[] = [];
  const seenEmails = new Map<string, number>();
  let invalidRows = 0;

  for (const record of document.records) {
    const rowIssues: CsvIssue[] = [];
    if (record.values.length > document.headers.length) {
      rowIssues.push({
        severity: "error",
        code: "TOO_MANY_COLUMNS",
        message: `Row has ${record.values.length} values but the header has ${document.headers.length}.`,
        rowNumber: record.rowNumber,
      });
    }

    const candidate = candidateFromRecord(record, mapping.indices, rowIssues);
    const validated = guestRowSchema.safeParse(candidate);
    if (!validated.success) {
      for (const issue of validated.error.issues) {
        const field = issue.path[0];
        rowIssues.push({
          severity: "error",
          code: "INVALID_VALUE",
          message: issue.message,
          rowNumber: record.rowNumber,
          ...(typeof field === "string" &&
          FIELD_ORDER.includes(field as keyof GuestCsvRow)
            ? { field: field as keyof GuestCsvRow }
            : {}),
        });
      }
    }

    if (validated.success && validated.data.email) {
      const priorRow = seenEmails.get(validated.data.email);
      if (priorRow !== undefined) {
        rowIssues.push({
          severity: "warning",
          code: "DUPLICATE_EMAIL",
          message: `Email also appears on row ${priorRow}. Review whether these guests belong to one party.`,
          rowNumber: record.rowNumber,
          field: "email",
        });
      } else {
        seenEmails.set(validated.data.email, record.rowNumber);
      }
    }

    const hasErrors = rowIssues.some((issue) => issue.severity === "error");
    if (hasErrors || !validated.success) {
      invalidRows += 1;
    } else {
      parsedRows.push(validated.data);
    }
    issues.push(...rowIssues);

    if (preview.length < previewLimit) {
      preview.push({
        rowNumber: record.rowNumber,
        values: validated.success ? validated.data : candidate,
        valid: !hasErrors && validated.success,
        issues: rowIssues,
      });
    }
  }

  const hasGlobalErrors = mapping.issues.some(
    (issue) => issue.severity === "error",
  );
  return {
    rows: hasGlobalErrors ? [] : parsedRows,
    preview,
    issues,
    totalRows: document.records.length,
    validRows: hasGlobalErrors ? 0 : parsedRows.length,
    invalidRows: hasGlobalErrors ? document.records.length : invalidRows,
    canImport: !hasGlobalErrors && invalidRows === 0 && parsedRows.length > 0,
  };
}

export function serializeCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  options: { includeUtf8Bom?: boolean; protectFormulas?: boolean } = {},
): string {
  if (!headers.length)
    throw new Error("CSV export requires at least one header.");
  if (headers.some((header) => /[\r\n]/.test(header))) {
    throw new Error("CSV headers must not contain line breaks.");
  }
  const protectFormulas = options.protectFormulas ?? true;
  const lines = [
    headers.map((header) => encodeCsvCell(header, protectFormulas)).join(","),
    ...rows.map((row) => {
      if (row.length !== headers.length) {
        throw new Error("Every CSV export row must match the header count.");
      }
      return row
        .map((value) => encodeCsvCell(csvCellText(value), protectFormulas))
        .join(",");
    }),
  ];
  return `${options.includeUtf8Bom ? "\uFEFF" : ""}${lines.join("\r\n")}\r\n`;
}

export function exportGuestCsv(rows: readonly GuestCsvExportRow[]): string {
  const headers = [
    "name",
    "email",
    "phone",
    "party_name",
    "max_party_size",
    "allow_plus_one",
    "tags",
    "notes",
    "response",
    "confirmed_attendees",
    "invitation_sent_at",
    "invitation_link_opened_at",
    "responded_at",
  ] as const;

  return serializeCsv(
    headers,
    rows.map((row) => [
      row.name,
      row.email,
      row.phone,
      row.partyName,
      row.maxPartySize,
      row.allowPlusOne,
      row.tags.join("; "),
      row.notes,
      row.response,
      row.confirmedAttendees,
      row.invitationSentAt,
      row.invitationLinkOpenedAt,
      row.respondedAt,
    ]),
    { includeUtf8Bom: true, protectFormulas: true },
  );
}

export function createGuestCsvDownload(
  rows: readonly GuestCsvExportRow[],
  filename = "guests.csv",
): CsvDownload {
  return {
    body: exportGuestCsv(rows),
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeCsvFilename(filename)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  };
}

function tokenizeCsv(source: string, maxRecords: number): ParsedCsvRecord[] {
  const records: ParsedCsvRecord[] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;
  let rowNumber = 1;
  let recordStart = 1;
  let columnNumber = 1;

  const finishRecord = () => {
    record.push(field);
    records.push({ rowNumber: recordStart, values: record });
    if (records.length > maxRecords)
      throw new Error(`CSV exceeds the ${maxRecords - 1} row limit.`);
    record = [];
    field = "";
    quoteClosed = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === undefined) break;

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
          columnNumber += 2;
          continue;
        }
        inQuotes = false;
        quoteClosed = true;
        columnNumber += 1;
        continue;
      }
      if (character === "\r" || character === "\n") {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        field += "\n";
        rowNumber += 1;
        columnNumber = 1;
        continue;
      }
      field += character;
      columnNumber += 1;
      if (field.length > 100_000)
        throw new CsvSyntaxError(
          "CSV field is too long",
          rowNumber,
          columnNumber,
        );
      continue;
    }

    if (quoteClosed) {
      if (character === " " || character === "\t") {
        columnNumber += 1;
        continue;
      }
      if (character !== "," && character !== "\r" && character !== "\n") {
        throw new CsvSyntaxError(
          "Unexpected character after a closing quote",
          rowNumber,
          columnNumber,
        );
      }
    }

    if (character === '"') {
      if (field !== "")
        throw new CsvSyntaxError(
          "Quote must begin at the start of a field",
          rowNumber,
          columnNumber,
        );
      inQuotes = true;
      columnNumber += 1;
    } else if (character === ",") {
      record.push(field);
      field = "";
      quoteClosed = false;
      columnNumber += 1;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      finishRecord();
      rowNumber += 1;
      recordStart = rowNumber;
      columnNumber = 1;
    } else {
      field += character;
      columnNumber += 1;
      if (field.length > 100_000)
        throw new CsvSyntaxError(
          "CSV field is too long",
          rowNumber,
          columnNumber,
        );
    }
  }

  if (inQuotes)
    throw new CsvSyntaxError("Unclosed quoted field", rowNumber, columnNumber);
  if (
    field !== "" ||
    record.length > 0 ||
    (source.length > 0 && !/[\r\n]$/.test(source))
  )
    finishRecord();
  return records;
}

function mapHeaders(headers: readonly string[]): {
  indices: Readonly<Partial<Record<keyof GuestCsvRow, number>>>;
  issues: readonly CsvIssue[];
} {
  const indices: Partial<Record<keyof GuestCsvRow, number>> = {};
  const issues: CsvIssue[] = [];

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const field = FIELD_ORDER.find((candidate) =>
      HEADER_ALIASES[candidate].includes(normalized as never),
    );
    if (!field) {
      issues.push({
        severity: "warning",
        code: "UNKNOWN_HEADER",
        message: `Column “${header}” is not recognized and will be ignored.`,
        field: "headers",
      });
      return;
    }
    if (indices[field] !== undefined) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_HEADER",
        message: `More than one column maps to “${canonicalHeader(field)}”.`,
        field: "headers",
      });
      return;
    }
    indices[field] = index;
  });

  if (indices.name === undefined) {
    issues.push({
      severity: "error",
      code: "MISSING_NAME_HEADER",
      message: "A name column is required.",
      field: "headers",
    });
  }
  return { indices, issues };
}

function candidateFromRecord(
  record: ParsedCsvRecord,
  indices: Readonly<Partial<Record<keyof GuestCsvRow, number>>>,
  issues: CsvIssue[],
): Partial<GuestCsvRow> {
  const value = (field: keyof GuestCsvRow): string => {
    const index = indices[field];
    return index === undefined ? "" : (record.values[index] ?? "").trim();
  };
  const rawPartySize = value("maxPartySize");
  const maxPartySize = rawPartySize === "" ? 1 : Number(rawPartySize);
  const rawPlusOne = value("allowPlusOne");
  const plusOne = parseCsvBoolean(rawPlusOne);
  if (!plusOne.valid) {
    issues.push({
      severity: "error",
      code: "INVALID_BOOLEAN",
      message: "Plus-one must be yes/no, true/false, or 1/0.",
      rowNumber: record.rowNumber,
      field: "allowPlusOne",
    });
  }

  const email = value("email").toLowerCase();
  const tags = value("tags")
    .split(/[;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    name: value("name"),
    email: email || null,
    phone: value("phone") || null,
    partyName: value("partyName") || null,
    maxPartySize,
    allowPlusOne: plusOne.value,
    tags: [...new Set(tags)],
    notes: value("notes") || null,
  };
}

function parseCsvBoolean(value: string): { valid: boolean; value: boolean } {
  if (value === "") return { valid: true, value: false };
  const normalized = value.toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized))
    return { valid: true, value: true };
  if (["no", "n", "false", "0"].includes(normalized))
    return { valid: true, value: false };
  return { valid: false, value: false };
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canonicalHeader(field: keyof GuestCsvRow): string {
  return HEADER_ALIASES[field][0];
}

function csvCellText(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw new Error("CSV export contains an invalid Date.");
    return value.toISOString();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function encodeCsvCell(value: string, protectFormulas: boolean): string {
  const safeValue =
    protectFormulas && /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safeValue) || /^\s|\s$/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

function safeCsvFilename(value: string): string {
  const withoutExtension = value.replace(/\.csv$/i, "");
  const safe = withoutExtension
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "guests"}.csv`;
}
