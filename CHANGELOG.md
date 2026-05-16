# DECAID Changelog

This changelog documents the current workspace state of the DECAID final-year project.

## Current Workspace - 2026-04-25 Snapshot

### Added

- React/Vite frontend with role-aware views for employer verification, student identity, institution workflows, ZKP tools, and admin inspection.
- Separate FastAPI `auth-service` for username/password registration, login, JWT issuance, and role storage.
- Default local admin user created by the auth service: `admin/admin123`.
- Express backend API for credential issuance, verification, revocation, risk scoring, document storage, batch operations, student profiles, and admin data.
- FastAPI `ai-service` with hybrid fraud-risk scoring:
  - rule-based scoring,
  - Isolation Forest anomaly scoring,
  - duplicate hash flag,
  - cross-student credential-content duplicate flag,
  - issuer trust and behavior features.
- Duplicate-content detection for reused certificate, registration, enrollment, roll, transcript, document, and serial identifiers.
- Hardhat/Solidity `CredentialRegistry` contract with issue, revoke, verify, and issuer authorization functions.
- Optional PostgreSQL persistence for issuer stats, batches, batch results, student DIDs, users, and documents.
- In-memory fallback stores for demos without PostgreSQL.
- Direct file upload/document storage flow using generated file IDs while preserving `/api/ipfs/*` compatibility naming.
- Admin dashboard endpoints for students, issuers, credentials, batches, documents, and summary counts.
- Fraud test dataset in `fraud-test-data.json`.
- Local run guide with auth and fraud tests in `RUN_WITH_AUTH_AND_FRAUD_TESTS.md`.

### Changed

- Documentation now describes the actual local stack:
  - frontend on `3000`,
  - backend on `5000`,
  - AI service on `8000`,
  - auth service on `8001`,
  - Hardhat blockchain on `8545`,
  - optional PostgreSQL on `5432`.
- The docs now treat the separate auth service as the active frontend authentication path.
- Google OAuth is documented as backend support code that is not currently wired into the frontend UI.
- IPFS language has been corrected: the current app stores uploaded files directly in memory/PostgreSQL and uses generated file IDs.
- Setup instructions now include the auth service and clarify that blockchain and auth are not started by the root `npm run dev` script.

### Security And Demo Notes

- The Hardhat demo private key appears in local development configuration examples only. Do not use it outside local testing.
- The current smart contract permits duplicate issue calls so fraud scoring can be demonstrated. Production deployments should restore duplicate prevention.
- The backend can fall back to in-memory storage; use PostgreSQL for persistence.
- Rate limiting exists in backend auth helpers, but the global limiter is disabled in `backend/src/index.js` during the current demo state.

### Known Gaps

- The frontend institution stats form references an endpoint shape that is not fully implemented in the backend. Use admin endpoints or issuer trust-rank data as the reliable current inspection path.
- One student document lookup in the frontend uses a path-style URL, while the backend exposes document filtering through `/api/documents?studentId=...`.
- Commitment-only ZKP lookup is currently backed by the running backend's in-memory individual credential store.

## 1.0.0 - Initial Project Baseline

### Added

- Initial DECAID project structure.
- Multi-service architecture for academic credential verification.
- Smart contract based credential registry.
- Fraud-risk scoring service.
- React frontend for credential issue and verification demos.
- Markdown documentation and setup notes.

## Migration Notes

When moving from older documentation to the current project:

1. Start the auth service on port `8001`; the frontend login page depends on it.
2. Start Hardhat and deploy the contract before starting the backend.
3. Confirm `backend/src/contract/CredentialRegistry.json` contains the deployed address.
4. Set `ISSUER_PRIVATE_KEY` for backend blockchain writes.
5. Use PostgreSQL only when persistence is required; otherwise the in-memory fallback is acceptable for demos.
