# DECAID Presentation Script

## Title

DECAID: Decentralized Academic Identity And Credential Risk Assessment System

## Opening

Good morning. Our project is DECAID, a local working prototype for academic credential verification.

The problem is simple: academic credentials are still difficult to verify quickly, privately, and reliably. Employers, universities, and agencies often depend on manual checks, emails, scanned PDFs, and trust in the applicant. That creates delays and opens the door to forged documents or reused credential identifiers.

DECAID shows how this process can be improved with a combined system:

- blockchain for tamper-evident credential status,
- AI-assisted fraud-risk scoring,
- role-based identity workflows,
- student DIDs,
- document attachment,
- and zero-knowledge-style commitment verification.

## One-Sentence Project Summary

DECAID lets institutions issue credentials, students manage identity and proof data, employers verify credentials, and admins inspect the system through a multi-service web app.

## Current Architecture

The local project has five main runtime components.

1. The React frontend runs on port `3000`.
2. The Express backend API runs on port `5000`.
3. The AI fraud-risk service runs on port `8000`.
4. The authentication service runs on port `8001`.
5. The Hardhat blockchain runs on port `8545`.

PostgreSQL is optional. If it is not configured, the backend uses in-memory storage so the demo remains easy to run.

## Technology Stack

- Frontend: React, Vite, Tailwind CSS.
- Backend: Node.js, Express, Zod, Ethers.js.
- Auth: FastAPI, SQLite, bcrypt, JWT.
- AI: FastAPI, scikit-learn Isolation Forest, rule-based signals.
- Blockchain: Solidity, Hardhat, local Ethereum JSON-RPC.
- Database: PostgreSQL, with in-memory fallback.

## Feature 1: Credential Issuance

Institution users can issue a credential by entering:

- issuer ID,
- student ID,
- credential data,
- and optionally a document.

The backend hashes the credential using:

```text
sha256(studentId:issuerId:credentialData)
```

That hash is written to the smart contract. The raw credential data is not stored on chain.

Why it matters:

- The blockchain stores a tamper-evident proof of existence.
- The student and employer can verify status later.
- The credential can be revoked if needed.

## Feature 2: Blockchain Registry

The `CredentialRegistry` smart contract supports:

- issue,
- revoke,
- verify,
- authorize issuer,
- deauthorize issuer,
- and check authorized issuer status.

For the demo, duplicate issue calls are allowed so our fraud-risk tests can detect duplicate behavior. In a production version, duplicate prevention should be enforced again at contract level.

## Feature 3: AI Fraud Risk

The AI service returns a risk score from `0` to `100`.

The score combines:

- rule-based checks,
- duplicate hash flags,
- reused unique credential identifiers,
- issuer trust features,
- batch size,
- issuance timing,
- student credential count,
- and Isolation Forest anomaly scoring.

The duplicate-content detection is important. If the same certificate number, registration number, roll number, transcript number, document hash, or serial number appears for two different students, DECAID can raise the risk.

## Feature 4: Student DID And Profile

Each student can be assigned a decentralized identifier in this format:

```text
did:decaid:<uuid>
```

The Student Identity view shows:

- DID,
- credential count,
- student risk score,
- credential cards,
- blockchain status,
- issuer trust,
- and available document records.

## Feature 5: Employer Verification

The employer verifies a credential by entering the credential hash, and optionally the student and issuer IDs.

The verification result shows:

- whether the hash exists on chain,
- whether it has been revoked,
- issuer address,
- fraud-risk score,
- risk level and reasons,
- duplicate status,
- trust rank,
- and raw JSON for technical review.

## Feature 6: ZKP Commitment Demo

DECAID includes a zero-knowledge-style commitment flow.

The system computes:

```text
commitment = sha256(credentialHash:studentId:nonce)
```

This lets a student create a proof that can be verified without directly showing the credential content. The current implementation is a commitment-based demo, not a full zk-SNARK system.

## Feature 7: Authentication And Roles

The current frontend uses a separate FastAPI auth service.

Users can register or log in as:

- student,
- institution,
- employer,
- admin.

The role controls which tabs are visible. For example:

- employers see verification,
- students see identity,
- institutions see issuing tools,
- admins see all tabs and dashboard data.

The backend also contains Google OAuth support, but the current frontend demo is connected to the auth service instead.

## Feature 8: Admin Dashboard

The admin dashboard gives a system-wide view of:

- total students,
- total issuers,
- total credentials,
- total documents,
- total batches,
- detailed credential rows,
- and delete actions for test data.

This is useful for demonstrations because it shows the data produced by the other flows.

## Demo Flow

### Demo 1: Login

Open `http://localhost:3000`.

Log in with:

```text
username: admin
password: admin123
```

Show that the admin can access all tabs.

### Demo 2: Issue Credential

Open Institution Portal.

Use:

```text
Issuer ID: UNIV-2024
Student ID: STU-DEMO-001
Credential Data: Bachelor of Computer Science, Certificate Number CS-2024-1001
```

Click Issue Credential and copy the generated hash.

### Demo 3: Verify Credential

Open Employer Verify.

Paste the hash, student ID, and issuer ID.

Point out:

- blockchain exists,
- active status,
- risk score,
- trust rank,
- duplicate status.

### Demo 4: Student Profile

Open Student Identity.

Search for `STU-DEMO-001`.

Show the DID and credential list.

### Demo 5: ZKP Tools

Open ZKP Tools.

Generate a commitment from the credential hash and student ID.

Verify the commitment using the nonce.

Explain that this demonstrates privacy-preserving proof logic, but full zero-knowledge circuits are future work.

### Demo 6: Fraud Detection

Use `fraud-test-data.json`.

Issue two credentials from the same fraud pair:

- first student with one certificate number,
- second student with the same certificate number.

Verify the second credential and show that the risk reasoning detects reused unique credential content.

## Key Technical Point

DECAID does not rely on only one security mechanism. It combines several independent signals:

- blockchain status,
- issuer behavior,
- credential duplicate patterns,
- student identity,
- document records,
- and AI/rule risk scoring.

That layered approach is the main strength of the project.

## Known Limitations

This is a final-year local prototype, not a production deployment.

Current limitations include:

- some frontend dashboard paths still need complete backend alignment,
- commitment-only ZKP lookup is memory-backed in the current demo,
- Google OAuth exists in backend code but is not wired into the current frontend,
- duplicate contract issuance is allowed for testing,
- and production security hardening is still required.

## Future Work

The next version can add:

- production Google OAuth or institutional SSO,
- strict smart contract duplicate prevention,
- persistent ZKP commitment storage,
- real zk-SNARK selective disclosure,
- production object storage or IPFS integration,
- stronger authorization around institution and admin APIs,
- deployment to a testnet or L2 chain,
- and integration with university information systems.

## Closing

DECAID demonstrates a practical path toward faster and more trustworthy academic credential verification.

Institutions can issue, students can prove, employers can verify, and admins can audit the system. By combining blockchain, AI risk scoring, and privacy-focused commitments, the project shows how digital academic identity can become more secure and easier to verify.

Thank you.

## Q And A Notes

### Is this a full zero-knowledge proof system?

No. The current implementation is a SHA-256 commitment proof demo. It demonstrates the verification pattern, while full zk-SNARK selective disclosure is future work.

### Is Google OAuth active?

Not in the current frontend. The backend contains Google OAuth routes, but the active UI uses the separate auth service.

### Where are documents stored?

The current backend stores file data directly in memory or PostgreSQL with generated file IDs. Endpoint names still use `ipfs` for compatibility, but a live IPFS node is not required for the local demo.

### What happens without PostgreSQL?

The backend uses in-memory storage. The demo works, but data is lost when the backend restarts.

### Why allow duplicate credentials on chain?

For the demo, duplicates are allowed so fraud detection can be tested. Production should enforce duplicate prevention in the smart contract and backend.
