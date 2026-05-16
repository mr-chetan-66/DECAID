# DECAID

DECAID is a final-year project for decentralized academic identity and credential verification. It combines a React frontend, a Node.js backend, a local Ethereum smart contract, a FastAPI fraud-risk service, and a separate FastAPI authentication service.

The current workspace is a local development/demo implementation. It is designed to show how institutions can issue credentials, students can view identity and credential data, employers can verify credentials, and administrators can inspect stored project data.

## Current System At A Glance

| Layer | Path | Port | Purpose |
| --- | --- | ---: | --- |
| Frontend | `frontend` | `3000` | React/Vite UI with role-based tabs |
| Backend API | `backend` | `5000` | Credential, verification, document, admin, blockchain, and ZKP APIs |
| Auth service | `auth-service` | `8001` | Username/password registration, login, JWT, and role storage |
| AI service | `ai-service` | `8000` | Hybrid fraud-risk scoring with rules and Isolation Forest |
| Blockchain | `blockchain` | `8545` | Hardhat local Ethereum node and `CredentialRegistry` contract |
| Database | Docker PostgreSQL | `5432` | Optional persistence; backend falls back to memory if unset |

Important context:

- The active frontend login page talks to `auth-service` at `http://127.0.0.1:8001`.
- The backend still contains Google OAuth endpoints, but the current frontend is not wired to Google Sign-In.
- File/document upload endpoints keep `ipfs` names for compatibility, but the current implementation stores file data directly in memory or PostgreSQL using generated file IDs.
- The blockchain contract allows duplicate issuance in this demo so duplicate and fraud-risk detection can be tested.

## Features

- Role-based web app for `student`, `institution`, `employer`, and `admin` users.
- Institution credential issuance for single credentials and batch submissions.
- SHA-256 credential hashing using `studentId`, `issuerId`, and credential data.
- Ethereum smart contract registry for issue, verify, revoke, and issuer authorization status.
- AI fraud-risk score from `0` to `100`, with rule and model contributions.
- Duplicate-content detection for reused certificate, registration, enrollment, roll, transcript, document, or serial identifiers.
- Student DID generation using `did:decaid:<uuid>`.
- Zero-knowledge-style SHA-256 commitment proof flow.
- Admin dashboard for students, issuers, credentials, batches, documents, and summary counts.
- Optional PostgreSQL persistence with in-memory fallback.

## Prerequisites

- Node.js 18 or newer
- npm
- Python 3.12 recommended
- Docker Desktop, only if you want PostgreSQL persistence
- Git
- Windows PowerShell, or an equivalent terminal

## Install Dependencies

From the repository root:

```powershell
cd E:\FinalYearProject
npm install
cd blockchain; npm install
cd ..\backend; npm install
cd ..\frontend; npm install
cd ..; python -m pip install -r ai-service\requirements.txt
python -m pip install -r auth-service\requirements.txt bcrypt
```

If `scikit-learn` or `numpy` wheels are unavailable for your Python version, run `ai-service/simple_main.py` with `simple_requirements.txt` as a fallback.

## Environment

Copy the backend example if you want to use environment variables:

```powershell
copy backend\.env.example backend\.env
```

For a local Hardhat demo, `ISSUER_PRIVATE_KEY` should match the first Hardhat account:

```text
ISSUER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CHAIN_RPC_URL=http://127.0.0.1:8545
AI_SERVICE_URL=http://127.0.0.1:8000
```

PostgreSQL is optional. If `DB_HOST` is not set, the backend runs with in-memory stores.

## Run The Full Stack

Use separate terminals in this order.

### 1. Optional PostgreSQL

```powershell
cd E:\FinalYearProject
docker-compose up -d
```

### 2. Hardhat Blockchain

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545
```

### 3. Deploy Smart Contract

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat run scripts/deploy.js --network localhost
```

This writes the deployed contract address and ABI to `backend/src/contract/CredentialRegistry.json`.

### 4. AI Service

```powershell
cd E:\FinalYearProject\ai-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 5. Auth Service

```powershell
cd E:\FinalYearProject\auth-service
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

The auth service creates a default admin user:

```text
username: admin
password: admin123
```

### 6. Backend API

```powershell
cd E:\FinalYearProject\backend
npm run dev
```

### 7. Frontend

```powershell
cd E:\FinalYearProject\frontend
npm run dev
```

Open `http://localhost:3000`.

## Health Checks

```powershell
curl.exe http://127.0.0.1:8000/health
curl.exe http://127.0.0.1:8001/health
curl.exe http://127.0.0.1:5000/health
curl.exe http://localhost:3000
```

## Basic Demo Flow

1. Start all services.
2. Log in as `admin/admin123`, or register a new role-specific user.
3. Open the Institution Portal.
4. Enter an issuer ID, student ID, and credential data.
5. Issue the credential and copy the returned 64-character hash.
6. Open Employer Verify and verify the hash.
7. Open Student Identity and load the student ID.
8. Open ZKP Tools as admin to generate or verify commitments.
9. Open Admin Dashboard to inspect students, issuers, credentials, batches, and documents.

## Main Backend API Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | `GET` | Backend health |
| `/api/risk/score` | `POST` | Proxy risk request to AI service |
| `/api/credentials/issue` | `POST` | Issue one credential |
| `/api/credentials/revoke` | `POST` | Revoke a credential on chain |
| `/api/credentials/verify/:hash` | `GET` | Direct blockchain verification |
| `/api/verify/by-hash/:hash` | `GET` | Employer-style verification with risk and trust data |
| `/api/institutions/batches` | `POST` | Batch issue credentials |
| `/api/institutions/batches/:batchId` | `GET` | Fetch batch details |
| `/api/students/:studentId/profile` | `GET` | Student DID and credential profile |
| `/api/zkp/generate` | `POST` | Generate SHA-256 commitment proof |
| `/api/zkp/verify` | `POST` | Verify proof with hash, student ID, nonce, and commitment |
| `/api/zkp/verify-by-commitment` | `POST` | Verify stored commitment without returning private credential data |
| `/api/ipfs/upload` | `POST` | Upload a file into temporary direct storage |
| `/api/documents/upload` | `POST` | Attach uploaded file metadata/data to a credential |
| `/api/documents` | `GET` | List documents, optionally by `studentId` or `issuerId` query |
| `/api/admin/*` | mixed | Admin dashboard data and deletes |

## Project Structure

```text
E:\FinalYearProject
|-- ai-service          FastAPI fraud-risk service
|-- auth-service        FastAPI username/password auth service
|-- backend             Express API and database layer
|-- blockchain          Hardhat project and Solidity contract
|-- frontend            React/Vite/Tailwind application
|-- docker-compose.yml  Optional PostgreSQL service
|-- fraud-test-data.json
|-- README.md
|-- DECAID-Handbook.md
|-- UserGuide.md
|-- TESTING.md
```

## Known Current Limitations

- The frontend has some UI paths that reference backend endpoints that are not fully aligned yet, such as institution stats and one student document lookup path. The admin dashboard and direct API endpoints remain useful for inspecting the same data.
- Commitment-only ZKP lookup is currently memory-backed for individually issued credentials, so it is best tested in the same backend process where the commitment was stored.
- The Google OAuth backend code is present, but the current frontend login screen uses the separate `auth-service`.
- The demo smart contract allows duplicate issue calls to support fraud-detection testing; production contracts should restore strict duplicate prevention.
- The backend has an in-memory fallback, so data disappears when the backend restarts unless PostgreSQL is configured.

## Documentation

- `DECAID-Handbook.md` - architecture, developer guide, workflows, and production notes.
- `UserGuide.md` - role-based usage instructions for students, institutions, employers, and admins.
- `TESTING.md` - health checks, API tests, UI tests, and fraud scenarios.
- `RUN_WITH_AUTH_AND_FRAUD_TESTS.md` - exact local startup order with authentication and fraud test data.
- `GOOGLE_OAUTH_IMPLEMENTATION_REPORT.md` - current authentication architecture and Google OAuth status.
- `DECAID_Presentation_Script.md` - presentation-ready explanation and demo script.

## License

This project is licensed under the MIT License. See `LICENSE`.
