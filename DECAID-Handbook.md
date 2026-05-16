# DECAID Developer Handbook

DECAID is a decentralized academic identity and credential verification prototype. It demonstrates how academic credentials can be issued, verified, risk-scored, and inspected through a local multi-service application.

This handbook reflects the current project in `E:\FinalYearProject`.

## 1. System Overview

DECAID supports four main actors:

| Actor | Current UI Capability |
| --- | --- |
| Student | View DID, credentials, risk score, and document records |
| Institution | Issue credentials, batch issue credentials, upload documents, manage issued credentials |
| Employer | Verify credential hash, status, risk, duplicate signals, and trust rank |
| Admin | Access all tabs and inspect data through the admin dashboard |

The system combines:

- an Express backend API,
- a React frontend,
- a FastAPI auth service,
- a FastAPI AI fraud-risk service,
- a Solidity smart contract on local Hardhat,
- optional PostgreSQL persistence,
- and direct document storage with file IDs.

## 2. Architecture

```text
Browser
  |
  | http://localhost:3000
  v
React Frontend
  |                     |
  | backend API         | auth API
  v                     v
Express Backend       FastAPI Auth Service
port 5000             port 8001
  |
  | risk requests
  v
FastAPI AI Service
port 8000
  |
  | blockchain writes/reads
  v
Hardhat Local Ethereum
port 8545
  |
  | optional persistence
  v
PostgreSQL
port 5432
```

### Runtime Components

| Component | Path | Main file | Port |
| --- | --- | --- | ---: |
| Frontend | `frontend` | `src/App.jsx` | `3000` |
| Backend | `backend` | `src/index.js` | `5000` |
| Auth service | `auth-service` | `main.py` | `8001` |
| AI service | `ai-service` | `main.py` | `8000` |
| Blockchain | `blockchain` | `contracts/CredentialRegistry.sol` | `8545` |
| PostgreSQL | `docker-compose.yml` | Docker service | `5432` |

## 3. Source Map

```text
ai-service/
  main.py                  Hybrid risk service
  simple_main.py           Pure-Python fallback risk service
  requirements.txt
  simple_requirements.txt

auth-service/
  main.py                  Login, register, JWT, role storage
  requirements.txt

backend/
  src/index.js             Express routes and orchestration
  src/auth.js              Backend JWT, Google OAuth helpers, role guards
  src/database.js          PostgreSQL schema and data access helpers
  src/contract/
    CredentialRegistry.json Deployed contract address and ABI
  .env.example

blockchain/
  contracts/CredentialRegistry.sol
  scripts/deploy.js        Deploys contract and writes backend artifact
  hardhat.config.js

frontend/
  src/App.jsx              Main role-based UI
  src/api.js               Backend API helpers
  src/contexts/AuthContext.jsx
  src/pages/LoginPage.jsx
```

## 4. Data Flow

### Credential Issuance

1. Institution submits `studentId`, `issuerId`, and `credentialData`.
2. Backend computes:

```text
credentialHash = sha256(studentId:issuerId:credentialData)
```

3. Backend writes the hash to `CredentialRegistry.issue`.
4. Backend stores credential metadata in memory or PostgreSQL.
5. Backend asks the AI service for risk scoring when batch issuance or verification requires it.
6. Backend returns hash and transaction data to the frontend.

### Employer Verification

1. Employer enters a 64-character credential hash.
2. Backend checks the smart contract with `verify`.
3. Backend resolves student and issuer metadata when available.
4. Backend computes or retrieves risk.
5. Backend computes issuer trust rank.
6. Backend returns blockchain, risk, duplicate, trust, and ZKP status fields.

### Student Profile

1. Student ID is submitted.
2. Backend creates or fetches a DID.
3. Backend collects credentials from memory or PostgreSQL.
4. Backend enriches each credential with blockchain status, risk, trust, and duplicate signals.

### ZKP Commitment Flow

DECAID currently uses a SHA-256 commitment demo:

```text
commitment = sha256(credentialHash:studentId:nonce)
```

This is privacy-oriented because the verifier can validate a proof without raw credential text. It is not a full zk-SNARK implementation.

## 5. Current Authentication Model

The active frontend login flow uses `auth-service`:

```text
LoginPage.jsx -> AuthContext.jsx -> http://127.0.0.1:8001
```

Auth service endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /register` | Create a user with username, password, and role |
| `POST /login` | Return JWT and user object |
| `GET /me` | Return current user from bearer token |
| `GET /health` | Service health |

Default admin:

```text
username: admin
password: admin123
```

The Express backend also contains Google OAuth helpers and `/api/auth/google`, but the current frontend does not use them.

## 6. Blockchain Layer

Smart contract: `blockchain/contracts/CredentialRegistry.sol`

Main features:

- `issue(bytes32 credentialHash)`
- `revoke(bytes32 credentialHash)`
- `verify(bytes32 credentialHash)`
- `authorizeIssuer(address issuer)`
- `deauthorizeIssuer(address issuer)`
- `isAuthorizedIssuer(address issuer)`

The deploy script:

```text
blockchain/scripts/deploy.js
```

deploys the contract and writes:

```text
backend/src/contract/CredentialRegistry.json
```

The backend reads this artifact to know the contract address and ABI.

## 7. AI Fraud-Risk Service

Main file: `ai-service/main.py`

Endpoint:

```text
POST /score
```

Inputs include:

- `studentId`
- `issuerId`
- `credentialHash`
- `contentSignature`
- `issuedAt`
- `batchId`
- `issuerTrustScore`
- `credentialCount`
- `studentCredentialCount`
- `timeGap`
- `duplicateFlag`
- `contentDuplicateFlag`
- `batchSize`

Outputs include:

- `riskScore`
- `riskLevel`
- `aiScore`
- `ruleScore`
- `reasons`
- `model`

Risk levels:

| Score | Level |
| ---: | --- |
| `0-20` | Low |
| `21-50` | Medium |
| `51-100` | High |

The backend also has a fallback heuristic for some verification paths if the AI service is unavailable.

## 8. Duplicate-Content Detection

The backend extracts unique credential identifiers from credential text, including:

- certificate number,
- registration number,
- enrollment number,
- roll number,
- transcript number,
- document hash or document ID,
- serial number.

It creates a content signature from those identifiers. If the same unique content signature appears for another student, DECAID raises a duplicate-content fraud signal.

Use `fraud-test-data.json` for ready-made examples.

## 9. Database Model

PostgreSQL is optional. When `DB_HOST` is set, the backend creates tables during startup.

Current tables:

- `issuer_stats`
- `batches`
- `batch_results`
- `student_dids`
- `users`
- `documents`

If PostgreSQL is not configured, the backend uses in-memory stores:

- `batchStore`
- `issuerStats`
- `studentDidStore`
- `individualCredentialStore`
- `documentsStore`
- `tempFileStore`

In-memory mode is useful for demos but data disappears after backend restart.

## 10. Document Storage

The current implementation does not require a live IPFS node.

Important detail:

- Endpoints still use names such as `/api/ipfs/upload` and `/api/ipfs/add`.
- Internally, the backend stores file data directly in memory or PostgreSQL.
- It returns generated file IDs such as `file-...`.

This keeps the UI flow simple while preserving room for real IPFS integration later.

## 11. Running The Project

### Install

```powershell
cd E:\FinalYearProject
npm install
cd blockchain; npm install
cd ..\backend; npm install
cd ..\frontend; npm install
cd ..; python -m pip install -r ai-service\requirements.txt
python -m pip install -r auth-service\requirements.txt bcrypt
```

### Configure Backend

Create `backend\.env` from the example if needed:

```powershell
copy backend\.env.example backend\.env
```

For local blockchain writes:

```text
ISSUER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CHAIN_RPC_URL=http://127.0.0.1:8545
AI_SERVICE_URL=http://127.0.0.1:8000
```

### Start Services

```powershell
# Optional PostgreSQL
cd E:\FinalYearProject
docker-compose up -d

# Hardhat
cd E:\FinalYearProject\blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545

# Deploy contract
cd E:\FinalYearProject\blockchain
npx hardhat run scripts/deploy.js --network localhost

# AI service
cd E:\FinalYearProject\ai-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Auth service
cd E:\FinalYearProject\auth-service
python -m uvicorn main:app --host 127.0.0.1 --port 8001

# Backend
cd E:\FinalYearProject\backend
npm run dev

# Frontend
cd E:\FinalYearProject\frontend
npm run dev
```

## 12. Backend API Reference

### Health

| Method | Endpoint |
| --- | --- |
| `GET` | `/health` |

### Authentication In Backend

| Method | Endpoint | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/google` | Backend Google token flow, not active in current frontend |
| `POST` | `/api/auth/onboarding` | Requires backend JWT |
| `GET` | `/api/auth/me` | Requires backend JWT |

### Blockchain Management

| Method | Endpoint | Notes |
| --- | --- | --- |
| `POST` | `/api/blockchain/authorize-issuer` | Admin guarded |
| `POST` | `/api/blockchain/deauthorize-issuer` | Admin guarded |
| `GET` | `/api/blockchain/is-authorized/:issuerAddress` | Public check |

### Credentials

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/credentials/issue` | Issue one credential |
| `POST` | `/api/credentials/revoke` | Revoke credential |
| `GET` | `/api/credentials/verify/:hash` | Direct chain verification |
| `GET` | `/api/verify/by-hash/:hash` | Employer verification with risk/trust |

### Batch And Institution Data

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/institutions/batches` | Batch issue credentials |
| `GET` | `/api/institutions/batches/:batchId` | Fetch batch details |
| `GET` | `/api/issuers/:issuerId/trust-rank` | Issuer trust rank |
| `GET` | `/api/issuers` | Issuer list in memory mode |

### Student And ZKP

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/students/:studentId/did` | Create/fetch DID for authenticated student |
| `GET` | `/api/students/:studentId/profile` | Student profile |
| `POST` | `/api/zkp/generate` | Generate commitment |
| `POST` | `/api/zkp/verify` | Verify commitment with full data |
| `POST` | `/api/zkp/verify-by-commitment` | Verify stored commitment |
| `POST` | `/api/zkp/store-commitment` | Store commitment for issued credential |

### Documents And Admin

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/ipfs/upload` | Multipart upload into temp storage |
| `POST` | `/api/ipfs/add` | Base64 upload into temp storage |
| `POST` | `/api/documents/upload` | Persist document metadata/data |
| `GET` | `/api/documents/:credentialHash` | Fetch document by credential hash |
| `GET` | `/api/documents` | List documents; supports `studentId` and `issuerId` query |
| `GET` | `/api/admin/stats` | Summary counts |
| `GET` | `/api/admin/students` | Student list |
| `GET` | `/api/admin/issuers` | Issuer stats |
| `GET` | `/api/admin/credentials` | Credential list |
| `GET` | `/api/admin/batches` | Batch list |

## 13. Testing Strategy

Use `TESTING.md` for command-by-command tests.

Recommended test layers:

1. Health checks for all services.
2. Auth login and `/me`.
3. Credential issue and direct verify.
4. Employer verify with risk.
5. Student profile lookup.
6. ZKP generate and verify.
7. Batch issue.
8. Fraud pair from `fraud-test-data.json`.
9. Admin endpoint inspection.
10. Frontend end-to-end walkthrough.

## 14. Known Current Limitations

- Google OAuth backend support exists, but the current frontend uses `auth-service`.
- Some frontend data panels reference endpoint paths that still need backend alignment.
- Commitment-only ZKP lookup is best tested in the same running backend process.
- Duplicate contract issuance is allowed for fraud demonstration.
- In-memory mode loses data after backend restart.
- Production-grade API authorization is not enforced on every local demo endpoint.

## 15. Production Hardening Checklist

Before a real deployment:

- Enforce duplicate prevention in smart contract and backend.
- Replace demo private keys and secrets.
- Require HTTPS.
- Harden CORS.
- Require authentication and role checks on institution/admin/revocation endpoints.
- Use persistent database migrations instead of startup `CREATE TABLE` logic.
- Add proper object storage or real IPFS integration.
- Persist ZKP commitments if commitment-only verification is required after restart.
- Add automated tests for backend routes, auth flows, AI scoring, and contract behavior.
- Add monitoring and audit logging.

## 16. Troubleshooting

### Backend says blockchain unavailable

Restart Hardhat, redeploy the contract, then restart the backend.

### Login page cannot authenticate

Confirm `auth-service` is running on port `8001`.

### AI service fails to start

Use Python 3.12 if possible. If package wheels are unavailable, run `simple_main.py`.

### Data is empty after restart

You were using in-memory mode. Configure PostgreSQL for persistence.

### Frontend cannot fetch backend

Confirm the API base URL in the frontend is `http://127.0.0.1:5000`.

### Nonce or duplicate blockchain errors

Restart Hardhat, redeploy the contract, and restart the backend so the contract artifact and account nonce state are fresh.

## 17. Demo Script Summary

1. Log in as `admin/admin123`.
2. Issue one credential in Institution Portal.
3. Copy the credential hash.
4. Verify it in Employer Verify.
5. Load the student in Student Identity.
6. Generate and verify a ZKP commitment.
7. Issue a fraud pair from `fraud-test-data.json`.
8. Show the risk reasons and admin dashboard data.

## 18. Project Summary

DECAID is a practical academic credential verification prototype. Its value is the combined workflow: smart contract status, AI/rule risk, student DID, document attachment, ZKP-style commitments, and role-based verification in one working local system.
