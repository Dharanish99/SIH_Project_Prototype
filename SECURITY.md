# Security scope and reporting

SetuTrace is an SIH submission prototype with deliberately selectable demo identities. Local mode is loopback-only. Hosted mode requires a shared judge access code and exact host/origin configuration; see [deployment](docs/DEPLOYMENT.md). The code-gated public demonstration is for fictional data only and is not ready for real student data.

Implemented controls include API role/tenant scoping, expiring token-hash sessions, mutation tokens, local origin/host restrictions, request and upload limits, database constraints, immutable evidence guards, transactional state changes and live verification of minimal signed assertions. See [API contracts](docs/API.md) and [tests](docs/TESTING.md).

- Persona selection simulates authentication; anyone with local access or the hosted judge code can choose a role. Hosted users share one dataset and reset affects everyone.
- Hosted cookies are Secure over HTTPS. A real service needs institutional identity federation and independent security review.
- SQLite and the synthetic issuer key share the local trust boundary. A privileged administrator can modify storage, rewrite audit history or replace a key. No external audit anchor or managed key custody is implemented.
- Revocation/expiry denies later service retrieval; it does not erase copies already obtained.
- Rate limits are in-process. This is one local server, not a distributed security design.
- Demo reset intentionally removes fictional evidence and restores fixtures; it is not a production retention/deletion workflow.
- No penetration test, DPDP certification, production security or legal compliance is claimed.

Do not include vulnerabilities containing credentials or real student information in public issues. Use an existing private contact route to the repository owner; no unverified security email is provided here. Never commit reproduction data containing real identifiers.

Before a pilot: approve purposes/retention and policy scope, integrate real authentication and recipient onboarding, move to controlled PostgreSQL storage and key custody, test backup/restore and concurrent workers, and obtain independent security/privacy review.
