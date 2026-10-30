# SetuTrace prototype

### Every record has a story. Make it explainable.

**SIH26263 · Student records, accountable corrections and controlled verification**

Submission prototype · React / TypeScript / Node 24 / SQLite · Synthetic data only

![SetuTrace institution dashboard](docs/screenshots/submission-overview.png)

**[Three-minute demo](docs/DEMO_SCRIPT.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[Tests and limitations](docs/VALIDATION.md)** · **[Team research repository](https://github.com/Dharanish99/SIH_Project_Research)**

## The problem we chose to solve

A linked academic identity can still have a wrong enrolment record. Institutions need defensible counts, students need a correction route, and verifiers need a current answer with permission. Repeated uploads and unexplained mismatch flags do not resolve the underlying source error.

SetuTrace works beside an institution's existing ERP: **import → explain → correct → approve → share**. It connects each count and disclosure to a specific source revision, preserves the reason for a correction, and withholds claims when permission or source evidence is no longer current.

This is a synthetic demonstration aligned with SIH problem code SIH26263 as interpreted by the team. Consult the separate research repository for the supplied brief, source trail and outstanding official verification.

## Run locally

Use Node 24.x and npm. The demo requires no cloud account, Docker, Python or API key.

```sh
git clone https://github.com/Dharanish99/SIH_Project_Prototype.git
cd SIH_Project_Prototype
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4871**. On Windows, `START_DEMO.cmd` installs missing dependencies, builds and starts the app. Stop with Ctrl+C. For development use `npm run dev` and open **http://127.0.0.1:5178**.

Optional settings are in [.env.example](.env.example). Local sign-in is simulated. A fresh checkout creates its fictional database and signing key under `data/`, which is ignored by Git. Hosted demo deployment boundaries are described in [deployment](docs/DEPLOYMENT.md).

## What the judge can explore

| Journey | Working implementation |
|---|---|
| Import an ERP export | Preview CSV changes, commit atomically, detect stale versions and replay without duplicate effects |
| Explain a finding | See capacity arithmetic and source disagreements; findings trigger review, never automatic rejection |
| Correct the source | Student opens a case; institution records a decision and reason; both revisions remain |
| Approve a report | Separate approver freezes exact rows, versions, findings and digest |
| Share selected fields | Student grants a named verifier limited fields for a stated purpose and short expiry |
| Verify current evidence | Server checks recipient, live permission, expiry, source revision, snapshot and Ed25519 signature |
| Withdraw access | Revocation blocks later retrieval; a source change supersedes approval |

**Demo story:** Meera appears in CSE although her fictional admission letter says ECE. A reasoned correction changes CSE from **7/6 to 6/6**, preserves the earlier revision and carries the corrected programme into a reviewed snapshot and limited verifier assertion.

## Project structure

- `src/`, `server/`, `shared/`, `tests/`: application, API and tests.
- `public/samples/`: fictional CSV fixture.
- `docs/`: architecture, presenter notes, validation and screenshots.
- `api/`, `deployment/`, `vercel.json`, `render.yaml`: hosting adapters and deployment configuration.

Project research, policy analysis, source provenance, requirements and research mind maps live in the separate [SIH_Project_Research repository](https://github.com/Dharanish99/SIH_Project_Research).

## Stack and current limits

React, TypeScript, Vite, Node 24, Express, SQLite and Ed25519. `npm run check` runs the build and 23 HTTP/database and proxy behavior tests.

All records and identity providers are fictional. There is no APAAR/government API integration, official certificate issuance, production identity, compliance certification or measured field impact. Signatures establish integrity of the synthetic assertion, not the truth or legal status of an academic claim. See [validation](docs/VALIDATION.md) and [security boundaries](SECURITY.md).

Run commands from the **repository root** so npm uses its single workspace lockfile:

```sh
npm ci
npm run build
npm start
npm run check
```

Node 24.x is required. The API defaults to http://127.0.0.1:4871; development UI uses port 5178. The root `.env` is optional. `DATA_DIR` resolves from this workspace directory and defaults to `prototype/data/`. Local mode refuses non-loopback binding. Explicit hosted mode requires an access code, exact hosts/origins and a persistent data directory; see [deployment](../docs/DEPLOYMENT.md). `DEMO_MODE=false` refuses startup until a real identity adapter exists.

| Location | Responsibility |
|---|---|
| `src/` | Responsive React interface, persona walkthrough and report views |
| `shared/contracts.ts` | Shared student/import types |
| `server/app.ts` | Role-scoped workflows, transactions, corrections, snapshots and disclosure |
| `server/database.ts` | Schema version, constraints and evidence guards |
| `server/http.ts` | Headers, origin/host restrictions, request limits and structured errors |
| `server/imports.ts` | Bounded CSV parsing, preview and spreadsheet-safe reports |
| `server/signing.ts` | Synthetic Ed25519 issuer, key persistence and signatures |
| `server/audit.ts` | Tenant-scoped retained event-chain verification |
| `server/config.ts`, `server/index.ts` | Local configuration, static bundle and lifecycle |
| `tests/` | Twenty-three HTTP/database and proxy behavioral tests |
| `public/samples/` | Fictional input CSV |
| `docs/` | Architecture, presenter notes, validation and screenshots |

The app does not make government API requests. Fonts and icons are bundled. Source revisions and audit rows are guarded at the database layer, except the explicit operator demo reset. A machine administrator can still alter local storage. Private keys, sessions and database files must remain untracked.

[Architecture](docs/ARCHITECTURE.md) · [API](../docs/API.md) · [Tests](../docs/TESTING.md) · [Security](../SECURITY.md)
