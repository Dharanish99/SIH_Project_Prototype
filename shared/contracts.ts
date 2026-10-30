export type StudentRecord = {
  id: string;
  studentId: string;
  tenant: string;
  name: string;
  programme: "CSE" | "ECE";
  apaar: string;
  status: "Active" | "Withdrawn";
  provider: "linked" | "unavailable" | "not_linked" | "denied";
  version: number;
  programmeReview: boolean;
  source: string;
};
export type ImportRow = {
  studentId: string;
  name: string;
  programme: "CSE" | "ECE";
  apaar: string;
  status: "Active" | "Withdrawn";
  expectedVersion: number;
};
export type PreviewRow = {
  line: number;
  status: "error" | "unchanged" | "update" | "new";
  message: string;
  input: ImportRow;
  currentVersion?: number;
};
export type ImportPreview = {
  id: string;
  fingerprint: string;
  rows: PreviewRow[];
  created: string;
  mapping: string;
};
