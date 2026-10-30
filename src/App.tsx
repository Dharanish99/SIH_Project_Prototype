import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";

import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  FileCheck2,
  FileClock,
  FileSpreadsheet,
  Fingerprint,
  GitBranch,
  History,
  Layers3,
  LayoutDashboard,
  Link2,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  UploadCloud,
  UserRound,
  UsersRound,
  X,
  AlertCircle,
  Copy,
  Eye,
  FileText,
  Undo2,
} from "lucide-react";

import type { StudentRecord } from "../shared/contracts";

type Role = "operator" | "approver" | "student" | "regulator" | "verifier";

type View =
  | "overview"
  | "records"
  | "imports"
  | "reports"
  | "snapshots"
  | "student"
  | "verify"
  | "approach";

type Session = {
  role: Role;
  tenant: string;
  studentId: string;
  recipient: string;
  csrf: string;
};

type Issue = {
  id: string;
  recordId?: string;
  title: string;
  detail: string;
  severity: "review" | "pending";
  rule: string;
  action: string;
};

type Case = {
  id: string;
  recordId: string;
  studentName: string;
  from: string;
  to: string;
  status: string;
  reason: string;
  resolution?: string;
  expectedVersion: number;
  outcome?: string;
  created: string;
  resolvedAt?: string;
};

type Snapshot = {
  id: string;
  status: string;
  created: string;
  count?: number;
  note?: string;
  digest?: string;
  findings?: Issue[];
};

type Grant = {
  id: string;
  status: string;
  recipient: string;
  fields?: string[];
  purpose?: string;
  created: string;
  expires: string;
};

type State = {
  reviewDigest?: string;
  session: Session;
  institutions: { id: string; name: string; short: string; city: string }[];
  programmes: { id: string; name: string; capacity: number }[];
  policy: { id: string; title: string; source: string; cohort: string };
  records: StudentRecord[];
  issues: Issue[];
  cases: Case[];
  snapshots: Snapshot[];
  grants: Grant[];
  events: {
    seq: number;
    actor: string;
    action: string;
    detail: string;
    created: string;
    digest: string;
  }[];
  aggregates: {
    institution: string;
    records: number;
    review: number;
    snapshots: number;
  }[];
};

type Preview = {
  id: string;
  fingerprint: string;
  rows: {
    line: number;
    status: string;
    message: string;
    input: { studentId: string; name: string; programme: string };
  }[];
};

type Report = {
  generated: string;
  rulePack: string;
  records: number;
  review: number;
  pending: number;
  openCases: number;
  approvedSnapshots: number;
  audit: {
    valid: boolean;
    checked: number;
    head: string;
    brokenAt: number | null;
  };
  programmes: { id: string; name: string; capacity: number; count: number }[];
};

type Receipt = {
  id?: string;
  status: string;
  signature: string;
  issuer: string;
  claims: Record<string, string>;
  revision: number;
  snapshotId: string;
  purpose: string;
  aud: string;
  exp: number;
  assertion: string;
  disclaimer: string;
};

const roles: { id: Role; label: string; hint: string }[] = [
  {
    id: "operator",
    label: "Institution operator",
    hint: "Import and reconcile",
  },
  { id: "student", label: "Student · Meera", hint: "Inspect and challenge" },
  {
    id: "approver",
    label: "Institution approver",
    hint: "Freeze a reviewed snapshot",
  },
  {
    id: "verifier",
    label: "Authorised verifier",
    hint: "Retrieve permitted fields",
  },
  {
    id: "regulator",
    label: "Regulator analyst",
    hint: "View aggregate coverage",
  },
];

const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "records", label: "Records & evidence", icon: UsersRound },
  { id: "imports", label: "Import workspace", icon: UploadCloud },
  { id: "reports", label: "Reports & audit", icon: History },
  { id: "snapshots", label: "Submission snapshots", icon: FileCheck2 },
  { id: "student", label: "Student desk", icon: UserRound },
  { id: "verify", label: "Verification desk", icon: ShieldCheck },
  { id: "approach", label: "Our approach", icon: Network },
] as const;

const allowed = (role: Role, id: string) =>
  id === "approach" ||
  (role === "student"
    ? id === "student"
    : role === "verifier"
      ? id === "verify"
      : role === "regulator"
        ? id === "overview"
        : [
            "overview",
            "records",
            "reports",
            "snapshots",
            ...(role === "operator" ? ["imports"] : []),
          ].includes(id));

const home = (role: Role): View =>
  role === "student" ? "student" : role === "verifier" ? "verify" : "overview";

const time = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

const mask = (r: StudentRecord) =>
  !r.apaar
    ? "Not provided"
    : r.apaar.length !== 12
      ? "Format needs review"
      : `•••• •••• ${r.apaar.slice(-4)}`;

const programmeName = (p: string) =>
  p === "CSE"
    ? "Computer Science & Engineering"
    : "Electronics & Communication";

const cn = (...a: (string | false | undefined | null)[]) =>
  a.filter(Boolean).join(" ");

function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`pill ${tone}`}>
      <span className="pill-dot" />
      {children}
    </span>
  );
}

function Empty({
  icon: Icon = FileClock,
  title,
  children,
}: {
  icon?: typeof FileClock;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function App() {
  const [data, setData] = useState<State | null>(null),
    [view, setView] = useState<View>("overview"),
    [busy, setBusy] = useState(false),
    [fatal, setFatal] = useState(""),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [selected, setSelected] = useState<StudentRecord | null>(null),
    [revisions, setRevisions] = useState<
      {
        version: number;
        reason: string;
        created: string;
        data: StudentRecord;
      }[]
    >([]),
    [mobileNav, setMobileNav] = useState(false),
    [guide, setGuide] = useState<number | null>(null),
    [provider, setProvider] = useState("linked");

  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [csv, setCsv] = useState(""),
    [fileName, setFileName] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [importReceipt, setImportReceipt] = useState<{
      message: string;
      changed: number;
      replayed: boolean;
      id: string;
    } | null>(null);

  const [correctionTo, setCorrectionTo] = useState("ECE"),
    [correctionReason, setCorrectionReason] = useState(
      "My fictional admission letter lists Electronics & Communication. Please reconcile the programme in the source export.",
    ),
    [resolution, setResolution] = useState(
      "Checked the fictional admission letter. ECE is the correct programme; the previous source revision is retained.",
    );

  const [approvalNote, setApprovalNote] = useState(
      "Reviewed the fictional record set. Pending academic linkage and source findings remain explicitly disclosed for follow-up.",
    ),
    [acknowledged, setAcknowledged] = useState(false),
    [shareFields, setShareFields] = useState(["name", "programme"]),
    [purpose, setPurpose] = useState("Internship eligibility check"),
    [verifyId, setVerifyId] = useState(""),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [verificationError, setVerificationError] = useState("");

  const [accessGate, setAccessGate] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const resetDialogRef = useRef<HTMLDialogElement>(null);
  const csrf = useRef(""),
    dialog = useRef<HTMLDialogElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function api<T = Record<string, unknown>>(
    url: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`/api${url}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrf.current,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(value.error || "The request could not be completed."),
        { status: response.status, code: value.code },
      );
    return value;
  }

  const notify = (text: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  };

  async function refresh() {
    const value = await api<State>("/state");
    csrf.current = value.session.csrf;
    setData({
      ...value,
      grants: value.grants ?? [],
      aggregates: value.aggregates ?? [],
    });
    return value;
  }

  async function switchRole(
    role: Role,
    tenant = data?.session.tenant ?? "aster",
    recipient = "Northstar Skills",
  ) {
    if (role === "student" || role === "verifier") tenant = "aster";
    setBusy(true);
    try {
      const s = await api<{ session: Session }>("/demo/session", {
        role,
        tenant,
        recipient,
      });
      csrf.current = s.session.csrf;
      setReceipt(null);
      setVerificationError("");
      setSelected(null);
      setPreview(null);
      setImportReceipt(null);
      setVerifyId("");
      const state = await refresh();
      setView(home(state.session.role));
      setMobileNav(false);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true);
    try {
      await action();
      await refresh();
      if (message) notify(message);
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        setAcknowledged(false);
        await refresh().catch(() => undefined);
      }
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setAcknowledged(false);
  }, [data?.reviewDigest]);

  useEffect(() => {
    if (
      view !== "reports" ||
      !data ||
      !["operator", "approver"].includes(data.session.role)
    )
      return;
    let active = true;
    setReport(null);
    setReportError("");
    api<Report>("/reports/summary")
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((error) => {
        if (active) setReportError(error.message);
      });
    return () => {
      active = false;
    };
  }, [view, data]);

  function go(id: View) {
    setView(id);
    setMobileNav(false);
    setSearch("");
    setFilter("all");
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let s;
        try {
          s = await api<{ session: Session }>("/session");
        } catch {
          const capabilities = await api<{ accessCodeRequired: boolean }>(
            "/capabilities",
          );
          if (capabilities.accessCodeRequired) {
            if (active) setAccessGate(true);
            return;
          }
          s = await api<{ session: Session }>("/demo/session", {
            role: "operator",
            tenant: "aster",
          });
        }
        csrf.current = s.session.csrf;
        if (active) {
          const value = await refresh();
          setView(home(value.session.role));
        }
      } catch (e) {
        if (active) setFatal((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  useEffect(() => {
    if (resetOpen) resetDialogRef.current?.showModal();
    else resetDialogRef.current?.close();
  }, [resetOpen]);

  useEffect(() => {
    if (selected) {
      dialog.current?.showModal();
      setProvider(selected.provider);
      api<{ revisions: typeof revisions }>(
        `/records/${encodeURIComponent(selected.id)}/revisions`,
      )
        .then((r) => setRevisions(r.revisions))
        .catch((e) => notify(e.message, true));
    } else dialog.current?.close();
  }, [selected?.id, selected?.version]);

  useEffect(() => {
    if (!data?.grants.length || verifyId) return;
    if (data.session.role === "verifier") setVerifyId(data.grants[0].id);
  }, [data?.grants, verifyId]);

  async function checkReceipt(id = verifyId, quiet = false) {
    if (!id) return;
    try {
      const value = await api<Receipt>("/verify", { id });
      setReceipt(value);
      setVerificationError("");
      if (!quiet)
        notify("Current permission, source revision and signature checked.");
    } catch (e) {
      setReceipt(null);
      setVerificationError((e as Error).message);
    }
  }

  useEffect(() => {
    if (view !== "verify" || !receipt || !verifyId) return;
    const timer = setInterval(() => {
      void checkReceipt(verifyId, true);
    }, 5000);
    return () => clearInterval(timer);
  }, [view, verifyId, receipt?.assertion]);

  const readFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 512000) {
      notify("Use a CSV smaller than 512 KB for this prototype.", true);
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    setPreview(null);
    setImportReceipt(null);
  };

  const demoFile = async () => {
    const text = await fetch("/samples/student-import.csv").then((r) =>
      r.text(),
    );
    setCsv(text);
    setFileName("student-import.csv");
    setPreview(null);
    setImportReceipt(null);
  };

  const previewImport = () =>
    run(async () => {
      setPreview(await api<Preview>("/imports/preview", { csv }));
      setImportReceipt(null);
    });

  const commitImport = () =>
    run(async () => {
      if (preview)
        setImportReceipt(
          await api<{
            message: string;
            changed: number;
            replayed: boolean;
            id: string;
          }>("/imports/" + preview.id + "/commit", {}),
        );
    }, "Batch processed. The current workspace has been refreshed.");

  const openRecord = (r: StudentRecord) => {
    setRevisions([]);
    setSelected(r);
  };

  const makeCorrection = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        api(
          cases[0]?.status === "open"
            ? `/cases/${cases[0].id}/reopen`
            : "/cases",
          {
            programme: correctionTo,
            reason: correctionReason,
            expectedVersion: data!.records[0].version,
          },
        ),
      "Correction requested. The original institution claim is preserved.",
    );
  };

  const resolve = (c: Case, decision = "accept") =>
    run(
      async () => {
        await api(`/cases/${c.id}/resolve`, { decision, reason: resolution });
        setSelected(null);
      },
      decision === "accept"
        ? "Correction recorded. Counts updated; the earlier revision is preserved."
        : "Reasoned response recorded for the student.",
    );

  const approve = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/snapshots", {
        note: approvalNote,
        reviewDigest: data?.reviewDigest,
      });
      setAcknowledged(false);
    }, "Exact row versions frozen in a locally approved snapshot.");
  };

  const createGrant = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => api("/grants", { fields: shareFields, purpose }),
      "Limited sharing authorised for 15 minutes.",
    );
  };

  const exportSnapshot = async (id: string) => {
    try {
      const payload = await api(`/snapshots/${id}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "setutrace-synthetic-snapshot.json";
      a.click();
      URL.revokeObjectURL(url);
      notify("Snapshot manifest downloaded.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  const steps = [
    {
      role: "operator" as Role,
      view: "overview" as View,
      title: "Start with an unexplained count",
      text: "CSE shows 7 reported records against 6 fictional seats. Open Meera’s evidence: her provider fixture is linked, but the programme claim is still wrong.",
    },
    {
      role: "student" as Role,
      view: "student" as View,
      title: "Let the student challenge the record",
      text: "Submit Meera’s ECE correction. The request creates a case; it does not silently rewrite the institution’s claim.",
    },
    {
      role: "operator" as Role,
      view: "records" as View,
      title: "Correct the source, preserve the history",
      text: "Open Meera’s record and accept the programme correction with a reason. CSE returns to 6; the previous revision remains visible.",
    },
    {
      role: "approver" as Role,
      view: "snapshots" as View,
      title: "Freeze an explainable submission",
      text: "Acknowledge the remaining findings and approve the local snapshot. Export its manifest to see exactly what was counted.",
    },
    {
      role: "student" as Role,
      view: "student" as View,
      title: "Share only what is needed",
      text: "Create a 15-minute permission for Northstar Skills. Choose the fields; the APAAR number is not offered to the verifier.",
    },
    {
      role: "verifier" as Role,
      view: "verify" as View,
      title: "Verify the current, permitted assertion",
      text: "Check the receipt. Then return to the Student desk, revoke permission and check it again: no student fields are returned.",
    },
  ];

  async function guideTo(index: number) {
    setGuide(index);
    await switchRole(steps[index].role, "aster");
    setView(steps[index].view);
  }

  if (accessGate)
    return (
      <main className="startup">
        <ShieldCheck size={44} />
        <h1>SetuTrace judge workspace</h1>
        <p>
          Explore how a student's correction changes reporting and later
          verification. All records and identities are fictional.
        </p>
        <form
          className="panel"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setAccessError("");
            try {
              const result = await api<{ session: Session }>("/demo/session", {
                role: "operator",
                tenant: "aster",
                accessCode,
              });
              csrf.current = result.session.csrf;
              await refresh();
              setAccessGate(false);
              setAccessCode("");
            } catch (error) {
              setAccessError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field-label">
            Judge access code
            <input
              type="password"
              autoComplete="off"
              required
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Enter demo <ArrowRight size={16} />
          </button>
          {accessError && <p role="alert">{accessError}</p>}
        </form>
        <p className="small muted">
          The owner shares this code privately. The hosted demo uses a shared
          fictional dataset; reset affects other viewers.
        </p>
      </main>
    );

  if (fatal)
    return (
      <div className="startup">
        <ShieldQuestion size={44} />
        <h1>The local workspace is unavailable</h1>
        <p>{fatal}</p>
        <p>
          Start the API with <code>npm start</code>, then reload this page.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );

  if (!data)
    return (
      <div className="startup">
        <div className="brand-mark">
          S<span />
        </div>
        <h1>Opening SetuTrace</h1>
        <p>Preparing your local evidence workspace…</p>
        <LoaderCircle className="spin" />
      </div>
    );

  const { session, records, issues, cases, snapshots, events } = data;

  const institution = data.institutions.find((t) => t.id === session.tenant)!;

  const review = issues.filter((i) => i.severity === "review"),
    pending = records.filter((r) => r.provider !== "linked"),
    active = records.filter((r) => r.status === "Active");

  const currentSnapshot = snapshots.find((s) => s.status === "approved"),
    meera = records.find((r) => r.studentId === "AIT-26-007");

  const visible = records.filter(
    (r) =>
      (r.name + " " + r.studentId)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "review"
          ? issues.some((i) => i.recordId === r.id && i.severity === "review")
          : r.programme === filter)),
  );

  const selectedCase = selected
    ? cases.find((c) => c.recordId === selected.id && c.status === "open")
    : undefined;

  const latestCase = cases[0];

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={cn("sidebar", mobileNav && "mobile-open")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go(home(session.role));
          }}
        >
          <div className="brand-mark">
            S<span />
          </div>
          <div>
            SetuTrace<small>EVERY RECORD HAS A STORY</small>
          </div>
        </a>

        <div className="workspace-label">DEMO WORKSPACE</div>
        <div className="workspace-card">
          <div className="workspace-avatar">{institution.short}</div>
          <div>
            {["operator", "approver"].includes(session.role) ? (
              <select
                aria-label="Demo institution"
                value={session.tenant}
                disabled={busy}
                onChange={(e) => void switchRole(session.role, e.target.value)}
              >
                <option value="aster">Aster Institute</option>
                <option value="river">Riverbend College</option>
              </select>
            ) : (
              <strong>
                {session.tenant === "aster"
                  ? "Aster Institute"
                  : "Riverbend College"}
              </strong>
            )}
            <span>2026–27 cohort</span>
          </div>
          <Building2 size={15} />
        </div>

        <nav aria-label="Main navigation" id="main-navigation">
          {nav
            .filter((n) => allowed(session.role, n.id))
            .map((n) => (
              <button
                key={n.id}
                className={cn("nav-item", view === n.id && "active")}
                onClick={() => go(n.id)}
                aria-current={view === n.id ? "page" : undefined}
              >
                <n.icon size={19} />
                <span>{n.label}</span>
                {n.id === "records" &&
                  cases.some((c) => c.status === "open") && (
                    <b>{cases.filter((c) => c.status === "open").length}</b>
                  )}
              </button>
            ))}
        </nav>

        <div className="sidebar-story">
          <span className="little-icon">
            <GitBranch size={20} />
          </span>
          <h3>
            Better evidence.
            <br />
            Fairer decisions.
          </h3>
          <p>
            Follow one record from an unexplained count to a correctable,
            permitted assertion.
          </p>
          <button onClick={() => void guideTo(0)}>
            <Play size={14} fill="currentColor" /> 3-minute walkthrough{" "}
            <ArrowUpRight size={15} />
          </button>
        </div>

        <div className="sidebar-bottom">
          <span className="live-dot" />
          Local data saved in SQLite<small>Fictional records · local API</small>
          {session.role === "operator" && (
            <button
              className="reset-link"
              disabled={busy}
              onClick={() => setResetOpen(true)}
            >
              <Undo2 size={13} />
              Reset demo data
            </button>
          )}
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="main-navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={21} />
            </button>
            <span className="crumb">
              {session.role === "student"
                ? "Student workspace"
                : session.role === "verifier"
                  ? "Recipient workspace"
                  : session.role === "regulator"
                    ? "Regulator workspace"
                    : "Institution workspace"}
            </span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await refresh();
                }, "Workspace refreshed.")
              }
            >
              <RefreshCw size={17} />
            </button>
            <div className="persona">
              <span>DEMO PERSONA</span>
              <select
                aria-label="Demo persona"
                value={session.role}
                disabled={busy}
                onChange={(e) => void switchRole(e.target.value as Role)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="user-avatar">
              {session.role === "student"
                ? "MI"
                : session.role === "verifier"
                  ? session.recipient === "Meridian Careers"
                    ? "MC"
                    : "NS"
                  : "AD"}
            </div>
          </div>
        </header>

        <div className="demo-banner">
          <span>
            <span className="demo-chip">SYNTHETIC DEMO</span>
            <span>
              Real local workflows. Simulated sign-in, identity responses and
              policy approvals.
            </span>
          </span>
          <button onClick={() => go("approach")}>
            What this demonstrates <ArrowUpRight size={13} />
          </button>
        </div>

        <main id="main-content" className="content">
          {view === "overview" && session.role !== "regulator" && (
            <>
              <section className="overview-hero">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-line" />
                    ACADEMIC EVIDENCE WORKSPACE
                  </div>
                  <h1>
                    Know what changed.
                    <br />
                    <span>Explain every record.</span>
                  </h1>
                  <p>
                    A clear path from institution data to accountable reporting.
                    <br className="desktop-break" /> Keep the evidence, the
                    decision and the next action together.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => (meera ? openRecord(meera) : go("records"))}
                  >
                    Review a student record <ArrowRight size={17} />
                  </button>
                  <span className="hero-caption">
                    <LockKeyhole size={13} />
                    Your institution’s records. Purposeful access.
                  </span>
                </div>
                <div
                  className="hero-art"
                  aria-label="Evidence layers: source, context and review"
                >
                  <div className="art-grid" />
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <div className="art-file back">
                    <div className="art-file-header">
                      <Fingerprint size={19} />
                      <span>ACCOUNT EVIDENCE</span>
                    </div>
                    <div className="art-line" />
                    <div className="art-line short" />
                    <span className="art-tag">
                      Fixture linked <Check size={12} />
                    </span>
                  </div>
                  <div className="art-file front">
                    <div className="art-file-header">
                      <FileCheck2 size={20} />
                      <span>INSTITUTION RECORD</span>
                    </div>
                    <strong>
                      One student.
                      <br />
                      Distinct evidence.
                    </strong>
                    <div className="art-mini">
                      <span>Source claim</span>
                      <span>Review context</span>
                    </div>
                    <div className="art-status">
                      <span className="live-dot" /> Every correction leaves a
                      trail
                    </div>
                  </div>
                  <div className="floating-check">
                    <GitBranch size={23} />
                  </div>
                  <span className="art-note">
                    Linking a person isn’t approving an admission.
                  </span>
                </div>
              </section>

              <section
                className="panel lifecycle-strip"
                aria-label="Correction propagation"
              >
                <span className="overline">
                  ONE CORRECTION. EVERY DEPENDENT OUTPUT.
                </span>
                <p>
                  A source correction changes the count, supersedes earlier
                  approval and makes older verification unavailable until a
                  fresh approval and permission.
                </p>
                <div className="lifecycle-nodes">
                  <b>
                    Source: {meera?.programme ?? "—"} · v{meera?.version ?? "—"}
                  </b>
                  <ArrowRight size={16} />
                  <b>
                    CSE:{" "}
                    {
                      records.filter(
                        (r) => r.programme === "CSE" && r.status === "Active",
                      ).length
                    }
                    /6
                  </b>
                  <ArrowRight size={16} />
                  <b>
                    {snapshots.filter((s) => s.status === "superseded").length}{" "}
                    superseded snapshots
                  </b>
                  <ArrowRight size={16} />
                  <b>
                    {currentSnapshot
                      ? "Current approval available"
                      : "Fresh approval required"}
                  </b>
                </div>
                <p className="small muted">
                  Meera's letter mismatch is a seeded scenario. The prototype
                  demonstrates its correction workflow; it does not
                  automatically read admission documents.
                </p>
              </section>
              <div className="stats-grid">
                <Stat
                  icon={UsersRound}
                  label="Reported records"
                  value={records.length}
                  detail={`${active.length} active · 2026–27 cohort`}
                />
                <Stat
                  icon={AlertCircle}
                  label="Needs review"
                  value={review.length}
                  detail="Explainable findings, not verdicts"
                  tone="amber"
                />
                <Stat
                  icon={Link2}
                  label="Awaiting linkage"
                  value={pending.length}
                  detail="Local records remain included"
                />
                <Stat
                  icon={Layers3}
                  label="Approved snapshots"
                  value={
                    snapshots.filter((s) => s.status === "approved").length
                  }
                  detail={
                    currentSnapshot
                      ? "Exact source revisions frozen"
                      : "Ready for institution review"
                  }
                />
              </div>

              <div className="dashboard-grid">
                <section className="panel intake-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="overline">SCOPE MATTERS</span>
                      <h2>Intake, with the context attached</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("approach")}
                    >
                      View rule context <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <p className="muted small">
                    Active records compared with a fictional programme-specific
                    approval.
                  </p>
                  {data.programmes.map((p) => {
                    const count = active.filter(
                        (r) => r.programme === p.id,
                      ).length,
                      excess = count > p.capacity;
                    return (
                      <div className="intake-row" key={p.id}>
                        <div className="intake-label">
                          <div>
                            <span className="programme-code">{p.id}</span>
                            <strong>{p.name}</strong>
                          </div>
                          <span>
                            <b>{count}</b> / {p.capacity} seats
                          </span>
                        </div>
                        <div className={cn("progress-track", excess && "over")}>
                          <span
                            style={{
                              width: `${Math.min((count / p.capacity) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <div className="intake-foot">
                          <span>
                            {excess
                              ? `${count - p.capacity} record above the configured count · reconcile before drawing conclusions`
                              : `Within configured count · other checks still apply`}
                          </span>
                          {excess ? (
                            <Pill tone="amber">Review count</Pill>
                          ) : (
                            <Pill tone="teal">Within count</Pill>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="context-note">
                    <BookOpen size={16} />
                    <span>
                      <b>{data.policy.id}</b> · {data.policy.source}
                    </span>
                  </div>
                </section>

                <section className="panel next-panel">
                  <span className="overline">A CLEAR NEXT STEP</span>
                  <div className="next-icon">
                    <MessageSquareText size={27} />
                  </div>
                  <h2>
                    {meera?.programmeReview
                      ? "A linked identity can still have a wrong record."
                      : meera
                        ? "The correction is now part of the story."
                        : "A separate institution. A separate view."}
                  </h2>
                  <p>
                    {meera?.programmeReview
                      ? "Meera’s identity fixture is linked. Her programme still differs from the fictional source letter. Give her a correction route."
                      : meera
                        ? "Review the source history, then let a separate approver freeze the exact record set."
                        : "Riverbend’s fictional records stay separate from the Aster workspace. Review only this institution’s source set."}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() =>
                      meera?.programmeReview
                        ? void switchRole("student")
                        : go("snapshots")
                    }
                  >
                    {meera?.programmeReview
                      ? "Open student demo"
                      : "Review snapshots"}
                    <ArrowRight size={16} />
                  </button>
                  <div className="next-footer">
                    <span className="number-dot">01</span>
                    <span>Evidence first. Action with a reason.</span>
                  </div>
                </section>
              </div>

              <div className="lower-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="overline">EXCEPTIONS, EXPLAINED</span>
                      <h2>
                        Attention queue{" "}
                        <span className="count-bubble">{issues.length}</span>
                      </h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        go("records");
                        setFilter("review");
                      }}
                    >
                      Open records <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="issue-list">
                    {issues.slice(0, 4).map((i) => (
                      <button
                        className="issue-item"
                        key={i.id}
                        onClick={() => {
                          const r = records.find((r) => r.id === i.recordId);
                          r ? openRecord(r) : go("records");
                        }}
                      >
                        <span
                          className={cn(
                            "issue-icon",
                            i.severity === "review" ? "amber" : "neutral",
                          )}
                        >
                          {i.severity === "review" ? (
                            <AlertCircle size={17} />
                          ) : (
                            <Clock3 size={17} />
                          )}
                        </span>
                        <span>
                          <strong>{i.title}</strong>
                          <small>
                            {i.rule} ·{" "}
                            {i.severity === "review"
                              ? "Human review"
                              : "Evidence pending"}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="overline">
                        THE TRAIL IS PART OF THE RECORD
                      </span>
                      <h2>Recent activity</h2>
                    </div>
                    <History size={18} className="muted" />
                  </div>
                  <Activity events={events.slice(0, 4)} />
                </section>
              </div>
            </>
          )}

          {view === "overview" && session.role === "regulator" && (
            <>
              <SectionTitle
                eyebrow="SCOPED REGULATOR DEMO"
                title="See coverage. Keep the context."
                subtitle="Aggregate reporting across two fictional institutions. No student-level or cross-institution matching data is exposed."
              />
              <div className="stats-grid three">
                <Stat
                  label="Fictional institutions"
                  value={data.aggregates.length}
                  detail="Explicit demo regulator scope"
                  icon={Building2}
                />
                <Stat
                  label="Reported records"
                  value={data.aggregates.reduce((n, t) => n + t.records, 0)}
                  detail="Counts from the local database"
                  icon={UsersRound}
                />
                <Stat
                  label="Open review findings"
                  value={data.aggregates.reduce((n, t) => n + t.review, 0)}
                  detail="Findings need context and review"
                  icon={AlertCircle}
                  tone="amber"
                />
              </div>
              <section className="panel">
                <h2>Institution reporting overview</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Institution</th>
                        <th>Reported records</th>
                        <th>Review findings</th>
                        <th>Current snapshots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.aggregates.map((t) => (
                        <tr key={t.institution}>
                          <td>
                            <b>{t.institution}</b>
                            <small className="cell-sub">
                              Synthetic institution
                            </small>
                          </td>
                          <td>{t.records}</td>
                          <td>{t.review}</td>
                          <td>{t.snapshots}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="context-note">
                  <ShieldCheck size={17} />
                  Real regulator access and restricted matching need a
                  documented mandate. Matching is outside this initial
                  prototype.
                </div>
              </section>
            </>
          )}

          {view === "records" && (
            <>
              <SectionTitle
                eyebrow="THE INSTITUTION’S CLAIMS"
                title="Records & evidence"
                subtitle="Inspect the source, academic linkage, policy context and revision history separately."
                action={
                  session.role === "operator" ? (
                    <button
                      className="button primary"
                      onClick={() => go("imports")}
                    >
                      <Plus size={16} />
                      Import records
                    </button>
                  ) : undefined
                }
              />
              <section className="panel records-panel">
                <div className="table-toolbar">
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search a name or student ID"
                      aria-label="Search records"
                    />
                  </label>
                  <div className="filter-control">
                    <ListFilter size={16} />
                    <select
                      aria-label="Filter records"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All records</option>
                      <option value="review">Needs review</option>
                      <option value="CSE">Computer Science</option>
                      <option value="ECE">Electronics</option>
                    </select>
                  </div>
                  <span className="muted small">
                    {visible.length} of {records.length} records
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student / local ID</th>
                        <th>Programme</th>
                        <th>Academic linkage</th>
                        <th>Source status</th>
                        <th>Revision</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="student-link"
                              onClick={() => openRecord(r)}
                            >
                              <span className="table-avatar">
                                {r.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </span>
                              <span>
                                <b>{r.name}</b>
                                <small>{r.studentId}</small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <b className="programme-text">{r.programme}</b>
                            <small className="cell-sub">
                              2026–27 · regular entry
                            </small>
                          </td>
                          <td>
                            <Pill
                              tone={
                                r.provider === "linked"
                                  ? "teal"
                                  : r.provider === "unavailable"
                                    ? "amber"
                                    : "neutral"
                              }
                            >
                              {r.provider === "linked"
                                ? "Fixture linked"
                                : r.provider === "unavailable"
                                  ? "Fixture unavailable"
                                  : r.provider === "denied"
                                    ? "Permission denied"
                                    : "Pending linkage"}
                            </Pill>
                            <small className="cell-sub mono">{mask(r)}</small>
                          </td>
                          <td>
                            {issues.some(
                              (i) =>
                                i.recordId === r.id && i.severity === "review",
                            ) ? (
                              <Pill tone="amber">Needs review</Pill>
                            ) : (
                              <Pill>Institution reported</Pill>
                            )}
                          </td>
                          <td>
                            <span className="revision">v{r.version}</span>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              onClick={() => openRecord(r)}
                              aria-label={`View ${r.name}`}
                            >
                              <ArrowUpRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!visible.length && (
                    <Empty title="No matching records">
                      Try a different name, student ID or programme filter.
                    </Empty>
                  )}
                </div>
                <div className="table-footer">
                  <LockKeyhole size={14} />
                  <span>
                    {institution.name} only · provider responses are fictional
                    fixtures
                  </span>
                  <span>
                    {cases.filter((c) => c.status === "open").length} correction{" "}
                    {cases.filter((c) => c.status === "open").length === 1
                      ? "case"
                      : "cases"}{" "}
                    open
                  </span>
                </div>
              </section>
              <div className="explanation-strip">
                <Fingerprint size={23} />
                <div>
                  <h3>A linked identifier is one piece of evidence.</h3>
                  <p>
                    It does not establish programme eligibility, seat approval
                    or an award. Each conclusion keeps its own source and scope.
                  </p>
                </div>
                <button className="text-button" onClick={() => go("approach")}>
                  See our approach <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}

          {view === "imports" && (
            <>
              <SectionTitle
                eyebrow="REUSE THE EXISTING EXPORT"
                title="Import workspace"
                subtitle="Preview first. Commit with a receipt. Replay without duplicating records."
                action={
                  <a
                    className="button secondary"
                    href="/samples/student-import.csv"
                    download
                  >
                    <ArrowDownToLine size={16} />
                    Sample CSV
                  </a>
                }
              />
              <div className="workflow-steps">
                {["Choose source", "Preview differences", "Commit locally"].map(
                  (s, i) => (
                    <div
                      key={s}
                      className={cn(
                        (i === 0 ||
                          (i === 1 && preview) ||
                          (i === 2 && importReceipt)) &&
                          "done",
                      )}
                    >
                      <span>
                        {(i === 0 && csv) ||
                        (i === 1 && preview) ||
                        (i === 2 && importReceipt) ? (
                          <Check size={14} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {s}
                      {i < 2 && <ChevronRight size={15} />}
                    </div>
                  ),
                )}
              </div>
              <section className="panel">
                <div className="import-grid">
                  <div
                    className="dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void readFile(e.dataTransfer.files[0]);
                    }}
                  >
                    <div className="upload-icon">
                      <FileSpreadsheet size={29} />
                    </div>
                    <h2>{fileName || "Bring your existing CSV"}</h2>
                    <p>
                      Drop a fictional export here, or choose a file.
                      <br />
                      CSV · up to 200 rows / 512 KB
                    </p>
                    <input
                      ref={fileInput}
                      className="sr-only"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => void readFile(e.target.files?.[0])}
                      aria-label="Choose CSV file"
                    />
                    <button
                      className="button secondary"
                      onClick={() => fileInput.current?.click()}
                    >
                      Choose CSV <UploadCloud size={16} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void demoFile()}
                    >
                      Use demo source instead <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="import-explainer">
                    <span className="overline">WHAT THE DEMO FILE DOES</span>
                    <h3>
                      One new record.
                      <br />
                      One source correction.
                      <br />
                      One safe no-op.
                    </h3>
                    <p>
                      The sample keeps Aarav unchanged, corrects Rehan’s input
                      format and adds a fictional ECE record. No account is
                      checked with a government service.
                    </p>
                    <div className="context-note">
                      <GitBranch size={17} />
                      <span>
                        Changed rows need their expected version. Stale exports
                        cannot overwrite newer corrections.
                      </span>
                    </div>
                  </div>
                </div>
                <details className="csv-details" open={!!csv}>
                  <summary>Inspect or paste the CSV</summary>
                  <label className="sr-only" htmlFor="csv">
                    CSV source
                  </label>
                  <textarea
                    id="csv"
                    className="code-input"
                    value={csv}
                    onChange={(e) => {
                      setCsv(e.target.value);
                      setPreview(null);
                      setImportReceipt(null);
                    }}
                    placeholder="student_id,name,programme,apaar,status,expected_version"
                    spellCheck={false}
                  />
                </details>
                <div className="panel-actions">
                  <span className="muted small">
                    Mapping: student-csv-v1 · strings preserve identifier values
                  </span>
                  <button
                    className="button primary"
                    disabled={!csv.trim() || busy}
                    onClick={() => void previewImport()}
                  >
                    Preview differences <ArrowRight size={16} />
                  </button>
                </div>
              </section>
              {preview && (
                <section className="panel slide-in">
                  <div className="panel-heading">
                    <div>
                      <span className="overline">
                        {importReceipt
                          ? "COMMITTED SOURCE BATCH"
                          : "NOT YET COMMITTED"}
                      </span>
                      <h2>
                        {importReceipt
                          ? "Original source differences"
                          : "Preview the exact changes"}
                      </h2>
                    </div>
                    <Pill>{preview.rows.length} source rows</Pill>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Source row</th>
                          <th>Student</th>
                          <th>Outcome</th>
                          <th>Explanation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r) => (
                          <tr key={r.line}>
                            <td className="mono">{r.line}</td>
                            <td>
                              <b>{r.input.name}</b>
                              <small className="cell-sub">
                                {r.input.studentId} · {r.input.programme}
                              </small>
                            </td>
                            <td>
                              <Pill
                                tone={
                                  r.status === "error"
                                    ? "red"
                                    : r.status === "new"
                                      ? "teal"
                                      : r.status === "update"
                                        ? "amber"
                                        : "neutral"
                                }
                              >
                                {r.status}
                              </Pill>
                            </td>
                            <td className="small">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="panel-actions">
                    <span className="small muted mono">
                      Batch {preview.id.slice(0, 8)} ·{" "}
                      {preview.fingerprint.slice(0, 12)}
                    </span>
                    <button
                      className="button primary"
                      disabled={
                        busy || preview.rows.some((r) => r.status === "error")
                      }
                      onClick={() => void commitImport()}
                    >
                      {importReceipt
                        ? "Replay batch safely"
                        : "Commit this batch"}{" "}
                      <CheckCheck size={16} />
                    </button>
                  </div>
                </section>
              )}
              {importReceipt && (
                <section className="receipt-callout slide-in">
                  <CheckCircle2 size={27} />
                  <div>
                    <span className="overline">
                      UNIFORM LOCAL BATCH RECEIPT
                    </span>
                    <h3>
                      {importReceipt.replayed
                        ? "Safe replay. No effects repeated."
                        : `${importReceipt.changed} record changes committed.`}
                    </h3>
                    <p>{importReceipt.message}</p>
                    <small className="mono">Receipt {importReceipt.id}</small>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => go("records")}
                  >
                    See records <ArrowRight size={16} />
                  </button>
                </section>
              )}
            </>
          )}

          {view === "student" && (
            <>
              <SectionTitle
                eyebrow="YOUR RECORD. YOUR CORRECTION ROUTE."
                title={`Hello, ${records[0].name.split(" ")[0]}.`}
                subtitle="See what your institution reports about you, challenge an error and control optional sharing."
              />
              <div className="student-layout">
                <div>
                  <section className="panel student-card">
                    <div className="profile-heading">
                      <div className="profile-avatar">
                        {records[0].name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div>
                        <span className="overline">
                          INSTITUTION-REPORTED RECORD
                        </span>
                        <h2>{records[0].name}</h2>
                        <span className="muted">
                          {records[0].studentId} · {institution.name}
                        </span>
                      </div>
                      <span className="revision">v{records[0].version}</span>
                    </div>
                    <dl className="record-fields">
                      <div>
                        <dt>Reported programme</dt>
                        <dd>
                          {programmeName(records[0].programme)}{" "}
                          <b>{records[0].programme}</b>
                        </dd>
                      </div>
                      <div>
                        <dt>Academic linkage</dt>
                        <dd>
                          <Pill
                            tone={
                              records[0].provider === "linked"
                                ? "teal"
                                : "neutral"
                            }
                          >
                            {records[0].provider === "linked"
                              ? "Fixture linked"
                              : "Pending evidence"}
                          </Pill>
                          <span className="small muted mono">
                            {mask(records[0])}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Local admission state</dt>
                        <dd>{records[0].status} · 2026–27</dd>
                      </div>
                      <div>
                        <dt>Source revision</dt>
                        <dd>
                          Version {records[0].version}{" "}
                          <span className="small muted">
                            {records[0].source}
                          </span>
                        </dd>
                      </div>
                    </dl>
                    <div className="context-note">
                      <ShieldCheck size={17} />
                      <span>
                        This demo sign-in is separate from APAAR. A missing or
                        disputed ID must not block your correction route.
                      </span>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <span className="overline">
                          ACCOUNTABLE CORRECTIONS
                        </span>
                        <h2>
                          {latestCase?.status === "resolved"
                            ? "Your correction is recorded"
                            : "Does the programme look wrong?"}
                        </h2>
                      </div>
                      <MessageSquareText size={21} className="teal-text" />
                    </div>
                    {latestCase && (
                      <div
                        className={cn(
                          "case-status",
                          latestCase.status === "resolved" ? "success" : "",
                        )}
                      >
                        <Pill
                          tone={
                            latestCase.status === "resolved" ? "teal" : "amber"
                          }
                        >
                          {latestCase.status === "open"
                            ? "Under institution review"
                            : latestCase.outcome || latestCase.status}
                        </Pill>
                        <p>
                          <b>
                            Programme: {latestCase.from} → {latestCase.to}
                          </b>
                        </p>
                        <p>{latestCase.resolution || latestCase.reason}</p>
                        <small>
                          Case {latestCase.id.slice(0, 8)} ·{" "}
                          {time(latestCase.resolvedAt || latestCase.created)}
                        </small>
                      </div>
                    )}
                    {(latestCase?.status !== "open" ||
                      latestCase.expectedVersion !== records[0].version) && (
                      <form onSubmit={makeCorrection}>
                        {latestCase?.status === "open" && (
                          <div className="notice warning">
                            The source changed after this request. Renew it
                            against version {records[0].version}; the earlier
                            request stays in history.
                          </div>
                        )}
                        <p className="muted">
                          In this fictional scenario, your admission letter says
                          ECE. Request a correction; the institution owns its
                          source record.
                        </p>
                        <label className="field-label">
                          Programme on your source letter
                          <select
                            value={correctionTo}
                            onChange={(e) => setCorrectionTo(e.target.value)}
                          >
                            <option value="ECE">
                              ECE · Electronics & Communication
                            </option>
                            <option value="CSE">
                              CSE · Computer Science & Engineering
                            </option>
                          </select>
                        </label>
                        <label className="field-label">
                          Explain the mismatch
                          <textarea
                            value={correctionReason}
                            onChange={(e) =>
                              setCorrectionReason(e.target.value)
                            }
                            required
                            minLength={12}
                          />
                        </label>
                        <button className="button primary" disabled={busy}>
                          {latestCase?.status === "open"
                            ? "Renew correction request"
                            : "Request programme correction"}{" "}
                          <ArrowRight size={16} />
                        </button>
                      </form>
                    )}
                    {cases.length > 1 && (
                      <details>
                        <summary>
                          Earlier correction requests ({cases.length - 1})
                        </summary>
                        {cases.slice(1).map((c) => (
                          <p className="small" key={c.id}>
                            <b>
                              {c.from} → {c.to} · {c.outcome || c.status}
                            </b>
                            <br />
                            {c.resolution || c.reason}
                          </p>
                        ))}
                      </details>
                    )}
                    {latestCase?.status === "open" && (
                      <p className="muted small">
                        Your original claim remains visible. The institution
                        will accept a source amendment or return a reasoned
                        response. No admission decision is made automatically.
                      </p>
                    )}
                  </section>
                </div>
                <div>
                  <section className="panel sharing-panel">
                    <span className="overline">YOU CHOOSE THE DISCLOSURE</span>
                    <div className="sharing-icon">
                      <LockKeyhole size={27} />
                    </div>
                    <h2>A smaller, purposeful share.</h2>
                    <p className="muted">
                      Authorise <b>Northstar Skills</b>, a fictional verifier,
                      to retrieve selected fields for 15 minutes.
                    </p>
                    <form onSubmit={createGrant}>
                      <div className="share-options">
                        {["name", "programme", "status"].map((f) => (
                          <label key={f}>
                            <input
                              type="checkbox"
                              checked={shareFields.includes(f)}
                              onChange={(e) =>
                                setShareFields(
                                  e.target.checked
                                    ? [...shareFields, f]
                                    : shareFields.filter((x) => x !== f),
                                )
                              }
                            />
                            <span>
                              {f === "name"
                                ? "Student name"
                                : f === "programme"
                                  ? "Reported programme"
                                  : "Local admission state"}
                            </span>
                          </label>
                        ))}
                      </div>
                      <label className="field-label">
                        Purpose
                        <input
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                          minLength={8}
                          required
                        />
                      </label>
                      <div className="context-note">
                        <Eye size={16} />
                        <span>
                          APAAR and student ID are excluded from this verifier’s
                          fields.
                        </span>
                      </div>
                      <button
                        className="button primary full"
                        disabled={
                          busy || !shareFields.length || !currentSnapshot
                        }
                      >
                        Create limited permission <ArrowRight size={16} />
                      </button>
                      {!currentSnapshot && (
                        <p className="small amber-text">
                          A separate institution approver must approve a current
                          snapshot first.
                        </p>
                      )}
                    </form>
                  </section>
                  {data.grants.map((g) => (
                    <section className="panel grant-card" key={g.id}>
                      <div className="panel-heading">
                        <h3>Northstar Skills</h3>
                        <Pill tone={g.status === "active" ? "teal" : "neutral"}>
                          {g.status}
                        </Pill>
                      </div>
                      <p className="small muted">
                        {g.fields?.join(", ")} · {g.purpose}
                      </p>
                      <small className="mono">{g.id.slice(0, 18)}…</small>
                      <p className="small">Expires {time(g.expires)}</p>
                      {g.status === "active" && (
                        <div className="button-row">
                          <button
                            className="button secondary small-button"
                            onClick={() =>
                              void run(
                                () => api(`/grants/${g.id}/revoke`, {}),
                                "Sharing withdrawn. Future retrieval is blocked.",
                              )
                            }
                            disabled={busy}
                          >
                            Withdraw permission
                          </button>
                          <button
                            className="text-button"
                            onClick={() => void switchRole("verifier")}
                          >
                            Verifier demo <ArrowUpRight size={14} />
                          </button>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}

          {view === "snapshots" && (
            <>
              <SectionTitle
                eyebrow="THE COUNT SHOULD BE REPRODUCIBLE"
                title="Submission snapshots"
                subtitle="Freeze exact row revisions, the rule pack and unresolved findings. Local approval stays distinct from government acknowledgement."
              />
              <div className="snapshot-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="overline">CURRENT SOURCE SET</span>
                      <h2>
                        {records.length} records, with the context retained
                      </h2>
                    </div>
                    <Layers3 size={24} className="teal-text" />
                  </div>
                  <div className="snapshot-summary">
                    <div>
                      <b>{active.length}</b>
                      <span>active records</span>
                    </div>
                    <div>
                      <b>{issues.length}</b>
                      <span>disclosed findings</span>
                    </div>
                    <div>
                      <b>{cases.filter((c) => c.status === "open").length}</b>
                      <span>open corrections</span>
                    </div>
                  </div>
                  <div className="snapshot-rows">
                    {records.map((r) => (
                      <div key={r.id}>
                        <span>
                          {r.name}
                          <small>{r.studentId}</small>
                        </span>
                        <b>{r.programme}</b>
                        <span className="revision">v{r.version}</span>
                      </div>
                    ))}
                  </div>
                  <div className="context-note">
                    <BookOpen size={16} />
                    <span>
                      {data.policy.id} · fictional approval scope. Missing
                      linkage is preserved, not silently excluded.
                    </span>
                  </div>
                </section>
                <div>
                  <section className="panel approval-panel">
                    <span className="overline">
                      SEPARATE REVIEW. EXPLICIT APPROVAL.
                    </span>
                    <h2>Make the submission explainable.</h2>
                    <p className="muted">
                      A snapshot locks which records were counted, with their
                      original evidence and unresolved findings.
                    </p>
                    {session.role === "approver" ? (
                      <form onSubmit={approve}>
                        <label className="field-label">
                          Approver note
                          <textarea
                            value={approvalNote}
                            onChange={(e) => setApprovalNote(e.target.value)}
                            minLength={12}
                            required
                          />
                        </label>
                        <label className="acknowledge">
                          <input
                            type="checkbox"
                            checked={acknowledged}
                            onChange={(e) => setAcknowledged(e.target.checked)}
                          />
                          <span>
                            I reviewed the current set and acknowledge its{" "}
                            {issues.length} disclosed findings. This is a local
                            institution approval.
                          </span>
                        </label>
                        <button
                          className="button primary full"
                          disabled={busy || !acknowledged}
                        >
                          Approve local snapshot <BadgeCheck size={17} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="context-note">
                          <LockKeyhole size={17} />
                          <span>
                            The operator can prepare records. A separate
                            approver role freezes the snapshot.
                          </span>
                        </div>
                        <button
                          className="button secondary full"
                          onClick={() => void switchRole("approver")}
                        >
                          Open approver demo <ArrowUpRight size={16} />
                        </button>
                      </>
                    )}
                  </section>
                  <section className="panel snapshot-history">
                    <div className="panel-heading">
                      <h2>Approval history</h2>
                      <History size={18} />
                    </div>
                    {!snapshots.length ? (
                      <Empty title="No approved snapshot yet">
                        The first approval will appear here with a record digest
                        and its source versions.
                      </Empty>
                    ) : (
                      snapshots.map((s) => (
                        <div className="snapshot-item" key={s.id}>
                          <div className="panel-heading">
                            <b>Snapshot {s.id.slice(0, 8)}</b>
                            <Pill
                              tone={
                                s.status === "approved" ? "teal" : "neutral"
                              }
                            >
                              {s.status === "approved"
                                ? "Approved locally"
                                : "Superseded"}
                            </Pill>
                          </div>
                          <p className="small muted">
                            {s.count} records · {time(s.created)}
                          </p>
                          <p className="small">{s.note}</p>
                          <code>SHA-256 {s.digest?.slice(0, 24)}…</code>
                          <button
                            className="text-button"
                            onClick={() => void exportSnapshot(s.id)}
                          >
                            Download frozen manifest{" "}
                            <ArrowDownToLine size={14} />
                          </button>
                          <a
                            className="text-button"
                            href={`/api/snapshots/${s.id}/report.csv`}
                            download
                          >
                            Download minimal CSV <ArrowDownToLine size={14} />
                          </a>
                        </div>
                      ))
                    )}
                  </section>
                </div>
              </div>
            </>
          )}

          {view === "verify" && (
            <>
              <SectionTitle
                eyebrow="PURPOSEFUL, CURRENT VERIFICATION"
                title="Verify the assertion. Keep the limits."
                subtitle={`${session.recipient} can retrieve only fields explicitly shared for its purpose and current source revision.`}
              />
              <div className="verification-grid">
                <section className="panel">
                  <div className="recipient-card">
                    <div className="recipient-logo">
                      <Building2 size={27} />
                    </div>
                    <div>
                      <span className="overline">
                        FICTIONAL RECIPIENT SESSION
                      </span>
                      <h2>{session.recipient}</h2>
                      <p>Recipient identity is simulated in this local demo.</p>
                    </div>
                    <Pill tone="teal">Recipient-bound</Pill>
                  </div>
                  <label className="field-label">
                    Simulated recipient
                    <select
                      value={session.recipient}
                      disabled={busy}
                      onChange={(event) =>
                        void switchRole("verifier", "aster", event.target.value)
                      }
                    >
                      <option>Northstar Skills</option>
                      <option>Meridian Careers</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Student permission reference
                    <input
                      value={verifyId}
                      onChange={(e) => {
                        setVerifyId(e.target.value);
                        setReceipt(null);
                        setVerificationError("");
                      }}
                      placeholder="Paste or choose a permission reference"
                    />
                  </label>
                  {data.grants.length > 0 && (
                    <div className="known-grants">
                      {data.grants.map((g) => (
                        <button
                          className={cn(
                            "permission-option",
                            verifyId === g.id && "selected",
                          )}
                          key={g.id}
                          onClick={() => {
                            setVerifyId(g.id);
                            setReceipt(null);
                            setVerificationError("");
                          }}
                        >
                          <Link2 size={16} />
                          <span>
                            {g.id.slice(0, 20)}…
                            <small>Expires {time(g.expires)}</small>
                          </span>
                          <Pill
                            tone={g.status === "active" ? "teal" : "neutral"}
                          >
                            {g.status}
                          </Pill>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="button primary"
                    disabled={busy || !verifyId}
                    onClick={() => void run(() => checkReceipt())}
                  >
                    Check current permission <ShieldCheck size={17} />
                  </button>
                  {!data.grants.length && (
                    <div className="context-note">
                      <CircleHelp size={17} />
                      <span>
                        No student has shared a record with this demo recipient
                        yet. Create a permission from the Student desk after an
                        approver snapshot.
                      </span>
                    </div>
                  )}
                </section>
                <section className="panel verifier-principles">
                  <span className="overline">FOUR INDEPENDENT CHECKS</span>
                  {[
                    {
                      icon: UsersRound,
                      title: "Intended recipient",
                      text: "A reference alone grants no access.",
                    },
                    {
                      icon: LockKeyhole,
                      title: "Current permission",
                      text: "Purpose, fields and expiry still apply.",
                    },
                    {
                      icon: GitBranch,
                      title: "Current source revision",
                      text: "A correction supersedes older assertions.",
                    },
                    {
                      icon: ShieldCheck,
                      title: "Signature integrity",
                      text: "A local signature does not make a claim true.",
                    },
                  ].map((x) => (
                    <div key={x.title}>
                      <x.icon size={20} />
                      <span>
                        <b>{x.title}</b>
                        <p>{x.text}</p>
                      </span>
                    </div>
                  ))}
                </section>
              </div>
              {verificationError && (
                <section className="denied-receipt slide-in" role="alert">
                  <ShieldQuestion size={32} />
                  <div>
                    <h2>Student fields withheld</h2>
                    <p>{verificationError}</p>
                  </div>
                </section>
              )}
              {receipt && (
                <section className="panel verified-receipt slide-in">
                  <div className="panel-heading">
                    <div className="verified-title">
                      <span className="verified-icon">
                        <ShieldCheck size={27} />
                      </span>
                      <div>
                        <span className="overline">
                          CURRENT PERMITTED ASSERTION
                        </span>
                        <h2>Only the agreed fields.</h2>
                      </div>
                    </div>
                    <Pill tone="teal">Signature checked</Pill>
                  </div>
                  <div className="receipt-fields">
                    {Object.entries(receipt.claims).map(([k, v]) => (
                      <div key={k}>
                        <span>
                          {k === "programme"
                            ? "Reported programme"
                            : k === "name"
                              ? "Student name"
                              : "Local admission state"}
                        </span>
                        <b>
                          {v === "ECE" || v === "CSE" ? programmeName(v) : v}
                        </b>
                      </div>
                    ))}
                  </div>
                  <div className="receipt-meta">
                    <span>
                      Source revision <b>v{receipt.revision}</b>
                    </span>
                    <span>
                      Purpose <b>{receipt.purpose}</b>
                    </span>
                    <span>
                      Expires{" "}
                      <b>{time(new Date(receipt.exp * 1000).toISOString())}</b>
                    </span>
                  </div>
                  <div className="context-note">
                    <AlertCircle size={17} />
                    <span>
                      {receipt.disclaimer} Access is rechecked every 5 seconds
                      while this receipt is open.
                    </span>
                  </div>
                  <details className="signed-json">
                    <summary>Inspect the signed demo assertion</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          issuer: receipt.issuer,
                          audience: receipt.aud,
                          claims: receipt.claims,
                          revision: receipt.revision,
                          snapshotId: receipt.snapshotId,
                          signature: receipt.signature,
                          assertion: receipt.assertion,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </section>
              )}
            </>
          )}

          {view === "reports" && (
            <>
              <SectionTitle
                eyebrow="REPRODUCIBLE REPORTING"
                title="Every count has a source."
                subtitle="Live tenant-scoped counts, frozen exports and a check of the retained audit trail. All data and policy thresholds are fictional."
              />
              {reportError && (
                <div className="notice warning" role="alert">
                  {reportError}
                </div>
              )}
              {!report && !reportError && (
                <Empty title="Checking the local evidence trail">
                  Loading the server-generated report.
                </Empty>
              )}
              {report && (
                <>
                  <div className="stats-grid">
                    <Stat
                      icon={UsersRound}
                      label="Source records"
                      value={report.records}
                      detail="Current institution only"
                    />
                    <Stat
                      icon={ShieldQuestion}
                      label="Findings to review"
                      value={report.review}
                      detail={`${report.pending} pending evidence findings`}
                    />
                    <Stat
                      icon={MessageSquareText}
                      label="Open correction cases"
                      value={report.openCases}
                      detail="A case is not a rejected admission"
                    />
                    <Stat
                      icon={FileCheck2}
                      label="Current approved snapshot"
                      value={report.approvedSnapshots}
                      detail="Exact rows and versions retained"
                    />
                  </div>
                  <div className="report-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Programme reconciliation</h2>
                        <Pill tone="neutral">{report.rulePack}</Pill>
                      </div>
                      <p className="small muted">
                        Active rows against configured demo capacities. A
                        finding starts human review; it does not decide
                        admission legality.
                      </p>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Programme</th>
                              <th>Active rows</th>
                              <th>Demo seats</th>
                              <th>Finding</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.programmes.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <b>{p.id}</b>
                                </td>
                                <td>{p.count}</td>
                                <td>{p.capacity}</td>
                                <td>
                                  <Pill
                                    tone={
                                      p.count > p.capacity ? "amber" : "teal"
                                    }
                                  >
                                    {p.count > p.capacity
                                      ? "Review capacity"
                                      : "Within demo capacity"}
                                  </Pill>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="small muted">
                        Generated {time(report.generated)}. CSV exports on the
                        snapshot page contain frozen versions and approval
                        status, without APAAR identifiers.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => go("snapshots")}
                      >
                        Open frozen exports <ArrowRight size={16} />
                      </button>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Retained audit integrity</h2>
                        <ShieldCheck size={20} />
                      </div>
                      <Pill tone={report.audit.valid ? "teal" : "amber"}>
                        {report.audit.valid
                          ? "Chain consistent"
                          : "Integrity check failed"}
                      </Pill>
                      <h3>{report.audit.checked} events checked</h3>
                      <p className="small">
                        The server recomputes each event hash and its
                        previous-event link for this institution.
                      </p>
                      <code className="audit-digest">
                        SHA-256 {report.audit.head || "No events"}
                      </code>
                      <p className="small muted">
                        This detects inconsistent retained events. An
                        administrator controlling the whole database can rewrite
                        the chain; external anchoring remains pilot work.
                      </p>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api("/audit/verify");
                          }, "Server audit check passed for the retained tenant events.")
                        }
                      >
                        <RefreshCw size={16} /> Run integrity check
                      </button>
                    </section>
                  </div>
                  <section className="panel report-events">
                    <div className="panel-heading">
                      <h2>Recent institution events</h2>
                      <Pill tone="neutral">Scoped by API session</Pill>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Actor</th>
                            <th>Action / evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.slice(0, 12).map((event) => (
                            <tr key={event.seq}>
                              <td>{time(event.created)}</td>
                              <td>{event.actor}</td>
                              <td>
                                <b>{event.action}</b>
                                <br />
                                <span className="small muted">
                                  {event.detail}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {view === "approach" && (
            <>
              <SectionTitle
                eyebrow="THE IDEA, MADE TANGIBLE"
                title="An evidence trail. A fairer next step."
                subtitle="SetuTrace connects source records, reasoned review and controlled disclosure beside the systems institutions already use."
              />
              <section className="panel approach-hero">
                <div>
                  <span className="overline">THE PRODUCT HYPOTHESIS</span>
                  <h2>
                    Don’t make people prove
                    <br />
                    the same facts twice.
                  </h2>
                  <p>
                    Reuse an export. Explain an exception. Give the source owner
                    a correction to make. Carry that correction forward into
                    reporting and verification.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => void guideTo(0)}
                  >
                    <Play size={15} />
                    Walk through one record <ArrowRight size={16} />
                  </button>
                </div>
                <div className="approach-chain">
                  {[
                    {
                      icon: FileSpreadsheet,
                      label: "Existing ERP export",
                      sub: "The operational source stays in place",
                    },
                    {
                      icon: GitBranch,
                      label: "SetuTrace evidence trail",
                      sub: "Versions, cases and scoped findings",
                    },
                    {
                      icon: FileCheck2,
                      label: "Approved local snapshot",
                      sub: "Exact rows and unresolved context",
                    },
                    {
                      icon: LockKeyhole,
                      label: "Permitted assertion",
                      sub: "Current, minimal and recipient-bound",
                    },
                  ].map((s, i) => (
                    <div key={s.label}>
                      <span className="chain-node">
                        <s.icon size={20} />
                      </span>
                      <span>
                        <b>{s.label}</b>
                        <small>{s.sub}</small>
                      </span>
                      {i < 3 && <span className="chain-line" />}
                    </div>
                  ))}
                </div>
              </section>
              <div className="evidence-four">
                {[
                  {
                    icon: Building2,
                    n: "01",
                    title: "Institution claim",
                    text: "What the college reports, and which source revision supports it.",
                  },
                  {
                    icon: Fingerprint,
                    n: "02",
                    title: "Account evidence",
                    text: "What an authorised, account-linked provider response can establish.",
                  },
                  {
                    icon: BookOpen,
                    n: "03",
                    title: "Policy context",
                    text: "Which institution, programme, year, approval and exceptions apply.",
                  },
                  {
                    icon: MessageSquareText,
                    n: "04",
                    title: "Accountable review",
                    text: "Who amended or upheld the claim, with a reason and correction route.",
                  },
                ].map((s) => (
                  <section className="panel evidence-card" key={s.n}>
                    <div>
                      <s.icon size={23} />
                      <span>{s.n}</span>
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </section>
                ))}
              </div>
              <div className="lower-grid">
                <section className="panel">
                  <span className="overline">WORKING IN THIS PROTOTYPE</span>
                  <h2>A small, complete journey</h2>
                  <ul className="check-list">
                    {[
                      "Durable SQLite records and immutable source revisions",
                      "CSV preview, transactional commit and safe replay",
                      "Student correction with a reasoned institution response",
                      "Separate approver role and exportable snapshot manifest",
                      "Ed25519-signed assertion with limited fields and withdrawal",
                      "API checks for role, tenant, record revision and grant status",
                    ].map((x) => (
                      <li key={x}>
                        <CheckCircle2 size={17} />
                        {x}
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="panel">
                  <span className="overline">
                    THE BOUNDARIES ARE PART OF THE DEMO
                  </span>
                  <h2>What a real pilot still needs</h2>
                  <ul className="boundary-list">
                    <li>
                      <b>Real sign-in and organisational authority</b>
                      <span>
                        The persona selector simulates authentication, even
                        though action permissions are enforced by the API.
                      </span>
                    </li>
                    <li>
                      <b>Authorised provider access</b>
                      <span>
                        No DigiLocker or APAAR endpoint is called. The
                        documented route is account-linked, not arbitrary bulk
                        lookup.
                      </span>
                    </li>
                    <li>
                      <b>Current, approved policy packs</b>
                      <span>
                        All seat numbers and approvals here are fictional. No
                        nationwide quota or automatic rejection is used.
                      </span>
                    </li>
                    <li>
                      <b>Field and security validation</b>
                      <span>
                        Local tests do not establish adoption, legal compliance
                        or production security.
                      </span>
                    </li>
                  </ul>
                </section>
              </div>
              <section className="panel source-panel">
                <div>
                  <span className="overline">BUILT ON THE TEAM’S RESEARCH</span>
                  <h2>Research → scoped implementation</h2>
                  <p>
                    Local stack: React / TypeScript / Vite · Node / Express ·
                    SQLite. A later permitted pilot can move persistence to
                    PostgreSQL and sign-in to institutional OIDC.
                  </p>
                </div>
                <a
                  className="button secondary"
                  href="https://github.com/Dharanish99/SIH_APAAR_Student_Verification/blob/main/docs/solution-report.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the research <ArrowUpRight size={16} />
                </a>
              </section>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            SetuTrace <span className="footer-dot">·</span> Make the record
            explainable.
          </span>
          <span>
            <Database size={13} />
            Local prototype <span className="footer-dot">·</span> Synthetic data
            only
          </span>
        </footer>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="evidence-title"
        className="evidence-dialog"
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setSelected(null);
        }}
      >
        {selected && (
          <>
            <div className="dialog-header">
              <div>
                <span className="overline">RECORD EVIDENCE</span>
                <h2 id="evidence-title">{selected.name}</h2>
                <p>
                  {selected.studentId} · source revision v{selected.version}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close record evidence"
                onClick={() => setSelected(null)}
              >
                <X size={21} />
              </button>
            </div>
            <div className="dialog-body">
              <div className="evidence-grid">
                <div>
                  <Building2 size={19} />
                  <span>Institution claim</span>
                  <strong>
                    {selected.programme} · {selected.status}
                  </strong>
                  <small>{selected.source}</small>
                </div>
                <div>
                  <Fingerprint size={19} />
                  <span>Account evidence</span>
                  <strong>
                    {selected.provider === "linked"
                      ? "Fixture linked"
                      : selected.provider.replace("_", " ")}
                  </strong>
                  <small>Simulated response; not an admission verdict</small>
                </div>
                <div>
                  <BookOpen size={19} />
                  <span>Policy context</span>
                  <strong>DEMO-2026.1</strong>
                  <small>Fictional CSE / ECE intake scope</small>
                </div>
                <div>
                  <GitBranch size={19} />
                  <span>Current revision</span>
                  <strong>Version {selected.version}</strong>
                  <small>Previous source values are retained</small>
                </div>
              </div>
              {selected.programmeReview && (
                <div className="source-conflict">
                  <AlertCircle size={20} />
                  <div>
                    <b>A linked account, an unresolved programme.</b>
                    <p>
                      The fictional admission letter says ECE. The current
                      export reports CSE. Record the source correction with a
                      reason; don’t equate linkage with correctness.
                    </p>
                  </div>
                </div>
              )}
              {selectedCase && session.role === "operator" && (
                <section className="case-resolution">
                  <div className="panel-heading">
                    <h3>Student correction request</h3>
                    <Pill tone="amber">Open case</Pill>
                  </div>
                  <p>
                    <b>
                      {selectedCase.from} → {selectedCase.to}
                    </b>{" "}
                    · {selectedCase.reason}
                  </p>
                  <label className="field-label">
                    Institution review reason
                    <textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      minLength={12}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="button primary"
                      disabled={busy || resolution.trim().length < 12}
                      onClick={() => void resolve(selectedCase)}
                    >
                      Accept source correction <Check size={16} />
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || resolution.trim().length < 12}
                      onClick={() => void resolve(selectedCase, "decline")}
                    >
                      Return reasoned refusal
                    </button>
                  </div>
                </section>
              )}
              {selected.programmeReview &&
                !selectedCase &&
                session.role === "operator" && (
                  <div className="button-row">
                    <button
                      className="button secondary"
                      onClick={() => {
                        setSelected(null);
                        void switchRole("student");
                      }}
                    >
                      Open student correction demo <ArrowUpRight size={15} />
                    </button>
                  </div>
                )}
              <section className="history-section">
                <div className="panel-heading">
                  <h3>Source revision trail</h3>
                  <History size={17} />
                </div>
                {revisions.map((r) => (
                  <div className="history-item" key={r.version}>
                    <span className="revision">v{r.version}</span>
                    <div>
                      <b>
                        {r.data.programme} · {r.data.status}
                      </b>
                      <p>{r.reason}</p>
                      <small>{time(r.created)}</small>
                    </div>
                  </div>
                ))}
                {!revisions.length && (
                  <p className="muted small">Loading the revision trail…</p>
                )}
              </section>
              {session.role === "operator" && (
                <details className="fixture-details">
                  <summary>Provider response simulator</summary>
                  <p className="small muted">
                    Apply a local account-response fixture. No government call
                    is made. Changing evidence also supersedes previous
                    approvals.
                  </p>
                  <label className="field-label">
                    Fixture outcome
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      <option value="linked">Linked account response</option>
                      <option value="unavailable">Provider unavailable</option>
                      <option value="denied">Permission denied</option>
                      <option value="not_linked">Account not linked</option>
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(
                          `/records/${encodeURIComponent(selected.id)}/provider-fixture`,
                          {
                            response: provider,
                            expectedVersion: selected.version,
                          },
                        );
                        setSelected(null);
                      }, "Synthetic account evidence updated; prior snapshots superseded.")
                    }
                  >
                    Apply simulated response
                  </button>
                </details>
              )}
            </div>
            <div className="dialog-footer">
              <LockKeyhole size={14} />
              Institution-scoped evidence · no public identifier lookup
            </div>
          </>
        )}
      </dialog>

      <dialog
        ref={resetDialogRef}
        className="reset-dialog"
        aria-labelledby="reset-title"
        onCancel={() => setResetOpen(false)}
      >
        <div className="reset-icon">
          <Undo2 size={26} />
        </div>
        <span className="overline">REPLAY THE FICTIONAL SCENARIO</span>
        <h2 id="reset-title">Start with a clean demo?</h2>
        <p>
          This restores nine Aster and three Riverbend records. Local imports,
          correction cases, snapshots and sharing permissions in this synthetic
          workspace will be removed.
        </p>
        <p className="small muted">
          Only this prototype’s fictional data is affected.
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => setResetOpen(false)}
          >
            Keep current demo
          </button>
          <button
            className="button primary"
            onClick={() => {
              setResetOpen(false);
              void run(async () => {
                await api("/demo/reset", {});
                setPreview(null);
                setImportReceipt(null);
                setReceipt(null);
                setVerifyId("");
                setGuide(null);
                setView("overview");
              }, "Fictional workspace restored to the starting scenario.");
            }}
          >
            Reset fictional workspace <Undo2 size={15} />
          </button>
        </div>
      </dialog>
      {guide !== null && (
        <aside className="guide-panel" aria-label="Guided demonstration">
          <div className="guide-top">
            <span>
              <Play size={13} />
              THE 3-MINUTE STORY{" "}
              <b>
                {guide + 1} / {steps.length}
              </b>
            </span>
            <button
              className="icon-button"
              aria-label="Close walkthrough"
              onClick={() => setGuide(null)}
            >
              <X size={17} />
            </button>
          </div>
          <h3>{steps[guide].title}</h3>
          <p>{steps[guide].text}</p>
          <small className="muted">
            Complete this action before Next. Step dots allow free exploration.
          </small>
          <div className="guide-actions">
            <span>
              {steps.map((_, i) => (
                <button
                  key={i}
                  className={i === guide ? "current" : ""}
                  onClick={() => void guideTo(i)}
                  aria-label={`Walkthrough step ${i + 1}`}
                />
              ))}
            </span>
            {guide < steps.length - 1 ? (
              <button
                className="text-button"
                disabled={
                  busy ||
                  (guide === 1 && !cases.length) ||
                  (guide === 2 && !!meera?.programmeReview) ||
                  (guide === 3 && !currentSnapshot) ||
                  (guide === 4 &&
                    !data.grants.some((g) => g.status === "active"))
                }
                onClick={() => void guideTo(guide + 1)}
              >
                Next step <ArrowRight size={15} />
              </button>
            ) : (
              <button className="text-button" onClick={() => setGuide(null)}>
                Finish <Check size={15} />
              </button>
            )}
          </div>
        </aside>
      )}

      {toast && (
        <div
          className={cn("toast", toast.error && "error")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {busy && (
        <div className="working-indicator" role="status">
          <LoaderCircle size={14} className="spin" />
          Saving local action…
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  tone = "teal",
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <span className={cn("stat-icon", tone)}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <p>{detail}</p>
    </section>
  );
}

function Activity({ events }: { events: State["events"] }) {
  return (
    <div className="activity-list">
      {events.map((e, i) => (
        <div className="activity-item" key={e.seq}>
          <span className={cn("activity-dot", i === 0 && "latest")} />
          <div>
            <strong>{e.action}</strong>
            <p>{e.detail}</p>
            <small>
              {e.actor} · {time(e.created)}
            </small>
          </div>
        </div>
      ))}
      {!events.length && (
        <p className="muted small">
          Local activity will appear here as you complete the workflow.
        </p>
      )}
    </div>
  );
}

export default App;
