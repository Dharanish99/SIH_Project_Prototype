# Initial prototype validation (historical baseline)

28 October 2026, Asia/Kolkata. This record describes a local synthetic prototype, separate from the earlier research-only model.

## Build and API

- `npm run build`: TypeScript checks and Vite production build passed.
- `npm test`: **7 test groups passed, 0 failed** against actual HTTP routes and SQLite.
- Dependency install/update reported zero known vulnerabilities in the installed dependency audit. This is not a security certification.
- Tested runtime: Node 24.19.0, npm 11.6.0, Windows.

| Test group | What was actually exercised |
|---|---|
| Session boundary | Missing session, disallowed browser origin and unknown persona denied |
| Role/tenant boundary | Operator cannot approve; student cannot import or see another student; Riverbend cannot access Aster revisions; regulator/verifier receive no record list; mutation token required |
| CSV | CSV parser contract, required headers, unchanged/update/new preview, commit, repeated receipt and repeated file replay, no extra canonical records or revisions, duplicate rows rejected |
| Conflict/rollback | A source correction after preview causes 409; the earlier new row in that batch is rolled back; Meera stays ECE; both source revisions remain |
| Snapshot and sharing | Frozen row versions and unresolved findings; export access; field allowlist; Ed25519 signature; changed signed bytes rejected; withdrawal blocks claims and verifier metadata does not contain the old assertion |
| Freshness | Clock-controlled expiry; changed source evidence supersedes the snapshot and old grants; new sharing requires fresh approval |
| Persistence/audit | Audit digest/previous-link consistency; a file-backed database retains changes after closing and reopening |

The tests are reproducible in `tests/api.test.ts`. They do not exercise PostgreSQL concurrency, external providers, institutional OIDC, hostile administrators, production key custody or national load.

## Browser walkthrough

The built production app was exercised through the in-app browser:

1. Student submitted an ECE correction for Meera.
2. Operator reviewed it and accepted a source revision. CSE changed from **7/6 to 6/6**; Meera became revision 2; the previous CSE revision remained visible.
3. Approver acknowledged the three remaining findings and created a local snapshot.
4. Student shared only name/programme with the fictional Northstar Skills recipient.
5. Verifier received those two fields, current source/snapshot context and a checked signature. No APAAR or local student ID appeared in the permitted claim set.
6. Student withdrew permission. Rechecking returned **“Student fields withheld”**, with no fields displayed.
7. Operator previewed the sample CSV: unchanged Aarav, updated Rehan and new Riya. Commit reported two changes; replay reported no repeated effects.
8. Institution selector changed to Riverbend and showed its separate three-record workspace.
9. Regulator persona showed aggregate institution counts; no student record table was available.
10. The approach screen explained the four evidence classes and actual prototype boundaries.

Search/filter, mobile navigation, labelled record dialog, Escape closing and focus return to the originating button were checked. No browser errors were reported in the final inspected log. Screenshot evidence is under `screenshots/`.

The final in-app reset confirmation restored the nine/three-record starting scenario. The walkthrough opened and advanced to the student step. The app was then returned to the clean operator overview, ready for presentation. The sidebar also scrolls in shorter windows.

## Responsive checks

- 1440-pixel desktop layout: sidebar, hero, metrics and scoped workflow visible.
- 390-pixel phone: overview and navigation checked.
- 320-pixel narrow phone: record page width remained inside the viewport.
- 820-pixel tablet: institution view checked inside the viewport.
- Mobile table overflow was found and corrected by containing accessible absolute labels in the table scrollport. The final 390-pixel record page was **375 CSS pixels wide**, while its table scrolled within its own container.

This is visual/interaction checking, not a formal WCAG audit. Reduced-motion styling and semantic control labels are implemented; full assistive-technology testing remains future work.

## Submission boundaries

Authentication/personas, provider responses, approvals, recipients and signing identity are demo fixtures. Policy capacities are fictional. No real personal records, government endpoints, official report submission, awarding-body certificate or field impact study was used. Do not report production security, legal compliance or real-world performance from these results.

This was the initial local-only validation. The later submission version is consolidated in the research repository at the user's explicit request; see the [current testing record](../../docs/TESTING.md). The original prototype and parent portfolio remain separate.
