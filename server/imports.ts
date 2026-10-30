import { parse } from "csv-parse/sync";
import { z } from "zod";
import { LIMITS } from "./config.ts";
import { HttpError } from "./http.ts";
import type {
  StudentRecord,
  PreviewRow,
  ImportRow,
} from "../shared/contracts.ts";

export const CSV_COLUMNS = [
  "student_id",
  "name",
  "programme",
  "apaar",
  "status",
  "expected_version",
];
const rowSchema = z.object({
  studentId: z.string().regex(/^[A-Za-z0-9-]{3,40}$/),
  name: z
    .string()
    .min(2)
    .max(100)
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s)),
  programme: z.enum(["CSE", "ECE"]),
  apaar: z
    .string()
    .max(30)
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s)),
  status: z.enum(["Active", "Withdrawn"]),
  expectedVersion: z.number().int().min(0),
});
export function previewCsv(
  csv: string,
  existing: StudentRecord[],
): PreviewRow[] {
  if (Buffer.byteLength(csv, "utf8") > LIMITS.csvBytes)
    throw new HttpError(
      413,
      "CSV exceeds the 512 KB prototype limit.",
      "CSV_TOO_LARGE",
    );
  let input: Record<string, string>[];
  try {
    input = parse(csv, {
      columns: (headers: string[]) => {
        if (
          headers.length !== CSV_COLUMNS.length ||
          new Set(headers).size !== headers.length ||
          !CSV_COLUMNS.every((c) => headers.includes(c))
        )
          throw new Error("HEADER_MISMATCH");
        return headers;
      },
      skip_empty_lines: true,
      bom: true,
      trim: true,
      max_record_size: 20_000,
      to: LIMITS.rows + 1,
    });
  } catch {
    throw new HttpError(
      400,
      `Use one copy of each header: ${CSV_COLUMNS.join(", ")}. Check row commas and quotes.`,
      "INVALID_CSV",
    );
  }
  if (!input.length || input.length > LIMITS.rows)
    throw new HttpError(
      400,
      `Use 1–${LIMITS.rows} rows in this prototype.`,
      "CSV_ROW_LIMIT",
    );
  const seen = new Set<string>(),
    byStudent = new Map(existing.map((r) => [r.studentId, r]));
  return input.map((v, index) => {
    const raw = {
      studentId: v.student_id,
      name: v.name,
      programme: v.programme,
      apaar: v.apaar ?? "",
      status: v.status,
      expectedVersion: Number(v.expected_version || 0),
    };
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success)
      return {
        line: index + 2,
        status: "error",
        message:
          "Check student ID, name, programme, status and expected version. Control characters are not accepted.",
        input: raw as ImportRow,
      };
    const row = parsed.data;
    if (seen.has(row.studentId))
      return {
        line: index + 2,
        status: "error",
        message: "Repeated student ID inside this CSV. Keep one intended row.",
        input: row,
      };
    seen.add(row.studentId);
    const previous = byStudent.get(row.studentId);
    const same =
      previous &&
      (["name", "programme", "apaar", "status"] as const).every(
        (k) => previous[k] === row[k],
      );
    const conflict = previous
      ? !same && previous.version !== row.expectedVersion
      : row.expectedVersion !== 0;
    return {
      line: index + 2,
      status: conflict
        ? "error"
        : same
          ? "unchanged"
          : previous
            ? "update"
            : "new",
      message: conflict
        ? previous
          ? "Expected version does not match. Export the current record before editing."
          : "New records must use expected_version 0."
        : same
          ? "Already matches the current record."
          : previous
            ? "A new revision will preserve the previous values."
            : "New local record; provider evidence remains pending.",
      input: row,
      currentVersion: previous?.version ?? 0,
    };
  });
}
/** Quote every field, and neutralise spreadsheet formulas in user-supplied text. */
export const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
    '"'
  );
};
export function snapshotCsv(rows: StudentRecord[], status: string) {
  const result = [
    [
      "student_id",
      "name",
      "programme",
      "status",
      "source_revision",
      "snapshot_status",
    ],
    ...rows.map((r) => [
      r.studentId,
      r.name,
      r.programme,
      r.status,
      r.version,
      status,
    ]),
  ];
  return (
    "\ufeff" +
    result.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
