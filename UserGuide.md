# DECAID
### Decentralized Academic Identity & Credential Risk Assessment System

> A blockchain-powered academic credential ecosystem combining **AI-based fraud detection**, **Decentralized Identity (DID)**, **Zero-Knowledge Proofs**, and **Smart Issuer Trust Ranking** — going far beyond simple certificate verification.

---

## Table of Contents

1. [Why DECAID Exists](#why-decaid-exists)
2. [What Makes DECAID Different](#what-makes-decaid-different)
3. [System Architecture](#system-architecture)
4. [Core Modules](#core-modules)
5. [Technology Stack](#technology-stack)
6. [Quick Start](#quick-start)
7. [Complete Demo Walkthrough](#complete-demo-walkthrough)
8. [User Guides](#user-guides)
9. [How the AI Fraud Engine Works](#how-the-ai-fraud-engine-works)
10. [How Zero-Knowledge Proofs Work](#how-zero-knowledge-proofs-work)
11. [How Trust Ranking Works](#how-trust-ranking-works)
12. [Developer Guide](#developer-guide)
13. [API Reference](#api-reference)
14. [Testing Guide](#testing-guide)
15. [Troubleshooting](#troubleshooting)
16. [Security Considerations](#security-considerations)
17. [Future Roadmap](#future-roadmap)

---

## Why DECAID Exists

Academic credential fraud is a growing global problem. Current systems suffer from:

| Problem | Real-World Impact |
|--------|------------------|
| Fake certificates circulating | Unqualified candidates hired in critical roles |
| Centralized databases | Single point of failure — one breach exposes everything |
| Manual verification | Takes days or weeks; employers often skip it |
| No unified student identity | Students manage scattered credentials across institutions |
| No fraud intelligence | Systems only check *if* a certificate exists, not *how suspicious* it is |

DECAID solves all five problems in one integrated platform.

---

## What Makes DECAID Different

Most blockchain credential systems do one thing: **verify that a certificate exists on-chain**.

DECAID goes further by answering: **"Should you trust this credential?"**

| Feature | Traditional Systems | DECAID |
|--------|-------------------|--------|
| Certificate verification | ✅ Binary yes/no | ✅ Yes/no + risk score |
| Fraud detection | ❌ None | ✅ AI-based anomaly scoring |
| Student identity | ❌ Siloed per institution | ✅ Unified DID across all institutions |
| Privacy | ❌ Reveal full data to verify | ✅ Prove authenticity without revealing data (ZKP) |
| Institution accountability | ❌ None | ✅ Dynamic trust rankings |
| Scale | ❌ One-at-a-time | ✅ Batch upload for entire graduating classes |

> **Viva Answer:** *"Traditional systems only verify certificate existence. Our system evaluates fraud risk probabilistically using AI-based behavioral anomaly detection and dynamic issuer trust ranking."*

---

## System Architecture

```
                    ┌──────────────────────────────┐
                    │     React Frontend             │
                    │  (Port 3000 — 4 dashboards)   │
                    └──────────────┬───────────────┘
                                   │ REST API calls
                    ┌──────────────▼───────────────┐
                    │     Node.js Backend            │
                    │  (Port 5000 — API orchestrator)│
                    └──┬───────┬──────────┬────────┘
                       │       │          │
          ┌────────────▼─┐  ┌──▼───────┐  ┌▼──────────────┐
          │  Ethereum     │  │ Python   │  │  PostgreSQL   │
          │  Blockchain   │  │ FastAPI  │  │  (Optional)   │
          │  (Hardhat)    │  │ AI Svc   │  │  Port 5432    │
          │  Port 8545    │  │ Port 8000│  └───────────────┘
          └──────┬────────┘  └──────────┘
                 │
          ┌──────▼────────┐
          │  IPFS Storage │
          │  (Optional)   │
          │  Port 5001    │
          └───────────────┘
```

**Data Flow:**
1. Institution uploads credential → Backend hashes it (SHA-256) → Stores hash on blockchain
2. AI service computes a fraud risk score (0–100) based on behavioral patterns
3. Student DID is auto-created and aggregated
4. Employer queries by hash → Gets blockchain proof + risk score + ZKP validation + trust rank

---

## Core Modules

### 1. Student Digital Identity (DID) Module
Every student automatically receives a **Decentralized Identifier** — a unique UUID-based address that aggregates all their credentials from any institution into one verifiable profile. The student controls their identity; no central authority owns it.

### 2. Institution Upload Portal
Institutions authenticate and upload credentials individually or in bulk. Every credential is SHA-256 hashed before storage — only the hash goes on-chain, not the raw data. This preserves privacy while maintaining tamper-proof integrity. Each upload feeds the AI risk model and updates the institution's trust ranking.

### 3. Blockchain Layer
Uses a permissioned Ethereum blockchain (Hardhat for development, deployable to Hyperledger or mainnet). The `CredentialRegistry` smart contract handles three operations: `issue()`, `revoke()`, and `verify()`. Only hashes are stored on-chain; document files go to IPFS.

### 4. AI Fraud Risk Scoring Engine
The core innovation. Uses **Isolation Forest** (an unsupervised anomaly detection algorithm) to assign every credential a risk score from 0 to 100. The model examines: duplicate patterns, submission timing anomalies, suspicious bulk uploads, issuer trust history, and behavioral outliers. The model improves over time via feedback loops.

### 5. Smart Issuer Trust Ranking
Institutions are dynamically ranked 1–5 stars based on their historical track record: fraud rate, revocation count, accuracy, compliance score, and error rates. A new institution starts neutral; its rank evolves with every credential it issues.

### 6. Employer Verification Dashboard
Employers search by student ID, blockchain hash, or certificate number. The dashboard returns a color-coded result: blockchain existence status, active/revoked status, risk score with category, duplicate detection result, ZKP validation badge, and issuer trust rank.

### 7. Zero-Knowledge Proof (ZKP) Module
Students can prove their credential is authentic without revealing any underlying academic data. Uses a SHA-256 commitment scheme. The student generates a `commitment` (public) and `nonce` (secret). Employers verify by recomputing the commitment — if it matches, the credential is valid. The original data is never exposed. This is GDPR-compliant by design.

### 8. RESTful Verification API
Real-time credential validation endpoint usable by any third-party system (HR platforms, government portals, university admissions). Returns blockchain confirmation, risk score, trust rank, and ZKP validation status in a single JSON response.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React.js + Tailwind CSS | Multi-role dashboards |
| Frontend | MetaMask | Wallet integration |
| Frontend | Chart.js | Risk visualizations |
| Backend | Node.js + Express | API orchestration |
| Backend | Python FastAPI | AI risk scoring service |
| Backend | PostgreSQL | Metadata persistence (optional) |
| Blockchain | Ethereum / Hyperledger | Immutable credential storage |
| Blockchain | Solidity + Hardhat | Smart contract development |
| Blockchain | Web3.js | Blockchain communication |
| Storage | IPFS | Document file storage |
| AI | Scikit-learn (Isolation Forest) | Anomaly detection |
| AI | NLP | Certificate text validation |
| Privacy | SHA-256 commitment | Zero-Knowledge Proofs |

---

## Quick Start

### Prerequisites
```bash
Node.js 18+
Python 3.12+
Docker (optional, for PostgreSQL)
Git
```

### Installation
```bash
# 1. Clone repository
git clone <your-repo-url>
cd DECAID

# 2. Install all dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../ai-service && pip install -r requirements.txt

# 3. Configure environment
cp backend/.env.example backend/.env
# Edit .env with your settings (see Environment Variables section)
```

### Start Services (4 terminals)

**Terminal 1 — Blockchain:**
```bash
cd blockchain
npx hardhat node --port 8545
# In another tab:
npx hardhat run scripts/deploy.js --network localhost
```

**Terminal 2 — Backend:**
```bash
cd backend
npm run dev
# Starts on http://localhost:5000
```

**Terminal 3 — AI Service:**
```bash
cd ai-service
python -m uvicorn main:app --port 8000
# Starts on http://localhost:8000
```

**Terminal 4 — Frontend:**
```bash
cd frontend
npm run dev
# Opens http://localhost:3000
```

> If PostgreSQL is not running, the backend falls back to in-memory storage automatically. You will see: `"Running with in-memory storage"` in the backend logs.

---

## Complete Demo Walkthrough

This walkthrough uses three personas to demonstrate the full system end-to-end. Use the exact credentials below — they are designed to produce realistic outputs from the AI and trust engine.

### Our Three Users

| Role | Name | Goal |
|------|------|------|
| 🏫 Institution Admin | Prof. Smith | Issue credentials for graduates |
| 🎓 Student | Alex Carter | Prove his degree privately |
| 🏢 Employer | Ms. Johnson | Verify a job applicant's credentials |

---

### Step 1 — Institution Issues a Credential (Prof. Smith)

Open `http://localhost:3000` and click the **Institution Portal** tab.

**Issue Single Credential:**

| Field | Value |
|-------|-------|
| Issuer ID | `UNI-CS-2024` |
| Student ID | `ALEX-CS-001` |
| Credential Data | `Bachelor of Computer Science - First Class Honours` |

Click **Issue Credential**.

**What happens behind the scenes:**
- Backend hashes the credential data using SHA-256
- Hash is written to the `CredentialRegistry` smart contract on the blockchain
- AI service analyzes the submission for anomaly signals
- A student DID is created and linked to this credential
- Institution trust stats are updated

**Expected output:**
```
✅ Credential issued successfully
Credential Hash: b6f1c2a7d39f4cdb82e3e56a7c8910d2a0f6c5b4e3d2c1a9876543210abcdef12
Transaction Hash: 0x3f7a...
```

> **Save this hash.** You will need it in every subsequent step.

---

### Step 2 — Batch Upload for Entire Class (Prof. Smith)

Still in **Institution Portal**, scroll to the **Batch Upload** section.

| Field | Value |
|-------|-------|
| Batch Name | `CS Graduates 2024` |

**Credentials (one per line, format: `STUDENT-ID\|Credential Data`):**
```
ALEX-CS-001|Bachelor of Computer Science - First Class Honours
SARAH-AI-002|Master of Artificial Intelligence - Distinction
MIKE-DS-003|PhD in Data Science - Summa Cum Laude
```

Click **Upload Batch**.

**Expected output:**
```
✅ Batch uploaded: 3 credentials issued
Batch ID: batch-cs-2024-001
```

> The AI model evaluates the entire batch for bulk upload patterns. 3 credentials from a single institution in one session is normal — the risk scores will remain low.

---

### Step 3 — Student Views Digital Identity (Alex)

Click the **Student Identity** tab.

| Field | Value |
|-------|-------|
| Student ID | `ALEX-CS-001` |

Click **Load Profile**.

**Expected output:**
```
DID: did:decaid:4f92a6e1-3c57-4e91-a88a-12345abcdeff
Credentials: 1 credential found
  → Bachelor of Computer Science - First Class Honours
  → Issuer: UNI-CS-2024
  → Risk Score: 28 / 100 (Low Risk)
  → Issuer Trust Rank: ⭐⭐⭐⭐☆ (4/5)
  → Status: ✅ Active
```

This DID is Alex's permanent, portable academic identity. Any future credentials from any institution will appear here automatically.

---

### Step 4 — Generate Zero-Knowledge Proof (Alex)

Alex wants to prove his degree to Ms. Johnson without revealing his grades or personal details.

Click the **ZKP Tools** tab.

| Field | Value |
|-------|-------|
| Credential Hash | `b6f1c2a7d39f4cdb82e3e56a7c8910d2a0f6c5b4e3d2c1a9876543210abcdef12` |
| Student ID | `ALEX-CS-001` |
| Nonce | *(leave empty — auto-generated)* |

Click **Generate ZKP Proof**.

**Expected output:**
```
Commitment: d1c7f65a44b8f9e3a56c2e7a9b0d4f6e8c3b2a1f9d8c7e6b5a4f3e2d1c0b9a8
Nonce:      f3492a67-8dd3-4fbb-9912-cc7811d990f4
Algorithm:  SHA-256-commitment-v1
```

**What Alex does next:**
- ✅ **Share:** `Commitment` → send this to Ms. Johnson
- 🔒 **Keep secret:** `Nonce` → never share this with anyone

---

### Step 5 — Employer Verifies Credential (Ms. Johnson)

Click the **Employer Verification** tab.

**Standard verification:**

| Field | Value |
|-------|-------|
| Credential Hash | `b6f1c2a7d39f4cdb82e3e56a7c8910d2a0f6c5b4e3d2c1a9876543210abcdef12` |
| Student ID | `ALEX-CS-001` |
| Issuer ID | `UNI-CS-2024` |

Click **Verify**.

**Privacy-preserving verification (with ZKP):**

Add one more field:

| Field | Value |
|-------|-------|
| ZKP Commitment | `d1c7f65a44b8f9e3a56c2e7a9b0d4f6e8c3b2a1f9d8c7e6b5a4f3e2d1c0b9a8` |

Click **Verify**.

**Expected dashboard result:**

| Check | Result | Meaning |
|-------|--------|---------|
| Exists on Blockchain | ✅ Yes | Credential was officially issued |
| Status | ✅ Active | Not revoked |
| Risk Score | 🟢 28 / 100 | Low fraud risk |
| Duplicate Detected | ✅ No | Not submitted multiple times |
| Issuer Trust Rank | ⭐⭐⭐⭐☆ 4/5 | Institution is reputable |
| ZKP Verified | ✅ Yes | Proof is valid — data stays private |

**Reading the badges:**
- 🟢 Green = verified, safe, active
- 🔴 Red = not found, revoked, high risk
- 🟡 Amber = duplicate detected, moderate risk, warning

---

### Step 6 — Institution Views Reputation (Prof. Smith)

In **Institution Portal**, scroll to **Institution Statistics**.

| Field | Value |
|-------|-------|
| Issuer ID | `UNI-CS-2024` |

Click **View Stats**.

**Expected output:**
```
Total Credentials Issued: 3
Success Rate: 100%
Average Risk Score: 26 / 100
Revocations: 0
Trust Rank: 4.5 / 5 ⭐
```

---

## User Guides

### For Students
Your goal is to **prove your credentials without surrendering your data**.

1. Go to **Student Identity** tab → enter your Student ID → load your profile to see your DID and all credentials
2. Go to **ZKP Tools** tab → paste your credential hash and student ID → generate proof
3. Send the **commitment** to whoever needs to verify you. Never share the **nonce**.
4. Your DID aggregates credentials from every institution you attend — you never need to manage multiple certificates manually.

### For Institution Admins
Your goal is to **issue credentials at scale and maintain a high trust rank**.

1. Go to **Institution Portal** → issue credentials individually for precision, or batch upload for entire classes
2. Batch format: one credential per line as `STUDENT-ID|Credential Description`
3. Monitor your institution's stats regularly. High revocation rates or anomalous submission patterns will lower your trust rank.
4. Always use a consistent, recognizable **Issuer ID** (e.g., `UNI-CS-2024`) — this is what employers check.

### For Employers
Your goal is to **verify credentials quickly and make risk-informed hiring decisions**.

1. Go to **Employer Verification** tab → enter the hash, student ID, and issuer ID provided by the applicant
2. Add the ZKP commitment if the applicant provided one — this enables privacy-preserving verification
3. Use the dashboard to interpret results: green = good, amber = investigate, red = reject or escalate
4. Trust rank matters: an institution with 2/5 stars and a credential with risk score 75+ warrants serious scrutiny

---

## How the AI Fraud Engine Works

The AI service uses **Isolation Forest** — an unsupervised anomaly detection algorithm that identifies outliers without needing labeled fraud examples.

**What it analyzes:**

| Signal | Example of Suspicious Pattern |
|--------|-------------------------------|
| Duplicate detection | Same student ID issued the same credential twice |
| Bulk upload timing | 500 credentials submitted in 30 seconds |
| Issuer history | Institution with 3 prior fraud flags |
| Behavioral anomaly | Credential issued on a weekend at 3 AM |
| Content patterns | NLP detects certificate text inconsistencies |

**Risk Score Interpretation:**

| Score Range | Risk Level | Recommended Action |
|-------------|-----------|-------------------|
| 0 – 30 | 🟢 Low Risk | Proceed with confidence |
| 31 – 60 | 🟡 Moderate Risk | Review manually before accepting |
| 61 – 100 | 🔴 High Risk | Escalate or reject |

The model improves over time: each verification outcome feeds back into the training loop, making it smarter with every real-world use.

---

## How Zero-Knowledge Proofs Work

The ZKP implementation uses a **SHA-256 commitment scheme**.

**Generation (by student):**
```
commitment = SHA256(credentialHash + ":" + studentId + ":" + nonce)
```

**Verification (by employer):**
```
recomputed = SHA256(credentialHash + ":" + studentId + ":" + nonce)
if recomputed == commitment → VALID ✅
```

**Why this preserves privacy:**
- The employer receives only the `commitment` (a hash)
- Without the `nonce`, it is computationally infeasible to reverse-engineer the original data
- The employer learns one thing only: *"this credential is authentic"*
- Grades, GPA, personal details — none of it is exposed

This is **GDPR-compliant by design**: verification is possible without any data processing of personal information.

---

## How Trust Ranking Works

Every institution starts with a neutral baseline. The ranking (1–5 stars) updates dynamically after every credential event.

**Factors that raise trust rank:**
- High success rate (credentials verified without dispute)
- Low revocation count
- Consistent submission behavior (patterns match legitimate institutional workflows)
- Low average AI risk score across all issued credentials

**Factors that lower trust rank:**
- Revocations (especially frequent ones)
- High AI risk scores on submitted credentials
- Anomalous bulk upload patterns
- History of duplicate submissions

A new institution will typically score 3–3.5/5 until it builds enough history.

---

## Developer Guide

### Project Structure

```
DECAID/
├── frontend/                  # React application
│   └── src/
│       ├── App.jsx            # Main component with 4 tab panels
│       ├── api.js             # API communication layer
│       └── main.jsx           # Entry point
│
├── backend/                   # Node.js API server
│   └── src/
│       ├── index.js           # Express server — all endpoints defined here
│       ├── database.js        # PostgreSQL operations (falls back to in-memory)
│       └── contract/
│           └── CredentialRegistry.json  # Compiled smart contract ABI
│
├── ai-service/                # Python ML service
│   ├── main.py                # FastAPI server with /score endpoint
│   └── requirements.txt
│
├── blockchain/                # Ethereum smart contracts
│   ├── contracts/
│   │   └── CredentialRegistry.sol   # Main smart contract
│   ├── scripts/
│   │   └── deploy.js          # Deployment script
│   └── hardhat.config.js
│
└── docker-compose.yml         # Spins up PostgreSQL
```

### Smart Contract: CredentialRegistry

```solidity
// Three core functions
function issue(bytes32 credentialHash) external
// Stores hash on-chain. Emits CredentialIssued event.

function revoke(bytes32 credentialHash) external  
// Marks credential as revoked. Only callable by original issuer.

function verify(bytes32 credentialHash) external view returns (bool exists, bool revoked)
// Read-only check. Returns existence and revocation status.
```

Only the SHA-256 hash of the credential is stored on-chain. The raw credential data goes to IPFS. This means:
- On-chain storage costs are minimal
- Personal data never touches the blockchain
- IPFS provides content-addressable retrieval when needed

### ZKP Implementation (Backend)

```javascript
// Generation
const nonce = crypto.randomUUID();
const commitment = crypto
  .createHash('sha256')
  .update(`${credentialHash}:${studentId}:${nonce}`)
  .digest('hex');

// Verification
const recomputed = crypto
  .createHash('sha256')
  .update(`${credentialHash}:${studentId}:${nonce}`)
  .digest('hex');
const valid = recomputed === commitment;
```

### AI Service (Python)

```python
# main.py — simplified structure
from sklearn.ensemble import IsolationForest
import numpy as np

# Features used for scoring:
# - is_duplicate (0/1)
# - issuer_trust_score (1-5)
# - submission_hour (0-23)  
# - batch_size (1-N)
# - issuer_fraud_history (0-N)

model = IsolationForest(contamination=0.1, random_state=42)

@app.post("/score")
async def score_credential(request: CredentialRequest):
    features = extract_features(request)
    raw_score = model.decision_function([features])[0]
    risk_score = normalize_to_0_100(raw_score)
    return {"riskScore": risk_score, "model": "isolation_forest"}
```

---

## API Reference

All endpoints return a consistent JSON structure:

```json
// Success
{
  "ok": true,
  "credentialHash": "0x...",
  "blockchain": { "exists": true, "revoked": false },
  "risk": { "riskScore": 28, "model": "isolation_forest" },
  "trustRank": 4,
  "zkp": { "status": "verified" }
}

// Error
{
  "ok": false,
  "error": "Credential hash not found on blockchain"
}
```

### Endpoints

**Issue credential:**
```http
POST /api/credentials/issue
Content-Type: application/json

{
  "studentId": "ALEX-CS-001",
  "issuerId": "UNI-CS-2024",
  "credentialData": "Bachelor of Computer Science - First Class Honours"
}
```

**Verify credential:**
```http
GET /api/verify/by-hash/{hash}?studentId=ALEX-CS-001&issuerId=UNI-CS-2024
```

**Revoke credential:**
```http
POST /api/credentials/revoke
Content-Type: application/json

{
  "credentialHash": "b6f1c2a...",
  "issuerId": "UNI-CS-2024"
}
```

**Batch upload:**
```http
POST /api/batch/upload
Content-Type: application/json

{
  "issuerId": "UNI-CS-2024",
  "batchName": "CS Graduates 2024",
  "credentials": [
    { "studentId": "ALEX-CS-001", "credentialData": "Bachelor of Computer Science" },
    { "studentId": "SARAH-AI-002", "credentialData": "Master of AI" }
  ]
}
```

**Generate ZKP proof:**
```http
POST /api/zkp/generate
Content-Type: application/json

{
  "credentialHash": "b6f1c2a...",
  "studentId": "ALEX-CS-001"
}
```

**Verify ZKP proof:**
```http
POST /api/zkp/verify
Content-Type: application/json

{
  "credentialHash": "b6f1c2a...",
  "studentId": "ALEX-CS-001",
  "nonce": "f3492a67-8dd3-4fbb-9912-cc7811d990f4",
  "commitment": "d1c7f65a..."
}
```

**Student profile:**
```http
GET /api/students/ALEX-CS-001/profile
```

**Institution stats:**
```http
GET /api/issuers/UNI-CS-2024/stats
```

---

## Testing Guide

### 1. Health Checks (start here)

```bash
curl http://localhost:5000/health    # Backend
curl http://localhost:8000/health    # AI Service
curl http://localhost:3000           # Frontend
```

All three should return 200 OK before proceeding.

### 2. Full End-to-End Test (copy-paste ready)

Run these in order. Each step depends on the previous one.

```bash
# Step 1: Issue credential
curl -X POST http://localhost:5000/api/credentials/issue \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "ALEX-CS-001",
    "issuerId": "UNI-CS-2024",
    "credentialData": "Bachelor of Computer Science - First Class Honours"
  }'
# Save the credentialHash from the response

# Step 2: Verify it exists
curl "http://localhost:5000/api/verify/by-hash/PASTE_HASH_HERE?studentId=ALEX-CS-001&issuerId=UNI-CS-2024"
# Expected: exists=true, revoked=false, riskScore ~25-35

# Step 3: Generate ZKP
curl -X POST http://localhost:5000/api/zkp/generate \
  -H "Content-Type: application/json" \
  -d '{
    "credentialHash": "PASTE_HASH_HERE",
    "studentId": "ALEX-CS-001"
  }'
# Save commitment and nonce

# Step 4: Verify ZKP
curl -X POST http://localhost:5000/api/zkp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "credentialHash": "PASTE_HASH_HERE",
    "studentId": "ALEX-CS-001",
    "nonce": "PASTE_NONCE_HERE",
    "commitment": "PASTE_COMMITMENT_HERE"
  }'
# Expected: valid=true

# Step 5: Check student profile
curl http://localhost:5000/api/students/ALEX-CS-001/profile
# Expected: DID, credential list, risk score

# Step 6: Check institution stats
curl http://localhost:5000/api/issuers/UNI-CS-2024/stats
# Expected: totalIssued=1, successRate=100%, trustRank ~4
```

### 3. Expected Results Validation

| Test Scenario | Expected Blockchain Status | Expected Risk Score |
|--------------|---------------------------|-------------------|
| Valid first-time credential | ✅ Exists, ✅ Active | 20–35 (Low) |
| Same credential submitted twice | ✅ Exists, ⚠️ Duplicate | 50–70 (Elevated) |
| Revoked credential | ✅ Exists, 🔴 Revoked | 70+ (High) |
| Non-existent hash | ❌ Not Found | N/A |
| ZKP with correct nonce | ✅ ZKP Verified | Same as original |
| ZKP with wrong nonce | ❌ ZKP Invalid | N/A |
| Batch of 100+ in 60 seconds | ✅ Exists | 60–80 (Suspicious timing) |

---

## Troubleshooting

### "Failed to fetch" on frontend
**Cause:** Frontend is pointing to wrong backend port, or backend is not running.
```bash
curl http://localhost:5000/health
# If this fails, restart backend: cd backend && npm run dev
# Check frontend .env — API_URL should be http://localhost:5000
```

### "Nonce too low" blockchain error
**Cause:** Hardhat was restarted but the backend cached the old account nonce.
```bash
# Restart Hardhat
cd blockchain && npx hardhat node --port 8545
# Redeploy contract
npx hardhat run scripts/deploy.js --network localhost
# Restart backend
cd backend && npm run dev
```

### Risk score not appearing
**Cause:** AI service is not running.
```bash
curl http://localhost:8000/health
# If this fails:
cd ai-service && python -m uvicorn main:app --port 8000
```

### ZKP verification returns "invalid"
**Cause:** Nonce or commitment was pasted incorrectly (extra space, truncated, etc.)
- Copy-paste both values directly from the generation step
- Do not add or remove any characters
- Regenerate the proof if needed and use the fresh values

### PostgreSQL connection failed
**Cause:** Database container not running.
```bash
docker-compose up -d
# If you don't need DB persistence, ignore this warning — the backend runs fine in in-memory mode
```

### Enable debug logging
```bash
# Backend verbose logs
cd backend && DEBUG=* npm run dev

# AI service verbose logs
cd ai-service && python -m uvicorn main:app --log-level debug

# Frontend: Open browser DevTools (F12) → Console tab
```

---

## Environment Variables

```bash
# backend/.env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=decaid
DB_USER=decaid
DB_PASSWORD=your_secure_password

CHAIN_RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x...          # Set after deploying smart contract
ISSUER_PRIVATE_KEY=0x...        # Institution signing key

AI_SERVICE_URL=http://localhost:8000
IPFS_API_URL=http://localhost:5001
```

---

## Security Considerations

This system is currently configured for **development and demonstration**. Before deploying to production:

| Area | Development State | Production Requirement |
|------|------------------|----------------------|
| Authentication | None (open API) | JWT tokens per institution |
| Transport | HTTP | HTTPS with TLS certificates |
| Rate limiting | None | Prevent API abuse |
| Private keys | Stored in .env | Hardware security module (HSM) |
| Database | Optional / in-memory | Encrypted PostgreSQL with backups |
| Smart contract | Hardhat local node | Audited contract on mainnet / permissioned chain |
| ZKP | SHA-256 commitment | zk-SNARKs for production-grade privacy |

---

## Future Roadmap

| Feature | Description |
|---------|------------|
| zk-SNARKs / zk-STARKs | Cryptographically stronger ZKP replacing SHA-256 commitment |
| Multi-chain support | Deploy on Polygon, Arbitrum for lower gas costs |
| Mobile app | React Native student identity app |
| OAuth SSO | Google / Microsoft login for institutions |
| Deep learning models | Replace Isolation Forest with neural network fraud detector |
| Layer 2 scaling | Handle millions of credentials with negligible cost |
| ATS integration | Plug directly into HR platforms (Workday, Greenhouse) |
| University SIS integration | Auto-issue credentials from Student Information Systems |

---

## Conclusion

DECAID is not a blockchain certificate storage system.

It is a complete academic trust ecosystem:
- **Blockchain** guarantees tamper-proof storage
- **AI** evaluates whether a credential *should* be trusted, not just whether it *exists*
- **ZKP** enables privacy-preserving verification that is GDPR-compliant by design
- **DID** gives students portable, self-sovereign academic identity
- **Trust ranking** creates institutional accountability for the first time

---

## Developed By

**Chetan Awari**  
Department of Data Science, IoT & Cyber Security

---

*For questions, open an issue on GitHub. For security vulnerabilities, report privately.*