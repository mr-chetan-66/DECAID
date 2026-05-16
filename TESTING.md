# DECAID Testing Guide

This guide tests the current local DECAID implementation: blockchain registry, backend API, auth service, AI fraud-risk service, frontend workflows, document storage, and fraud scenarios.

## Test Environment

Expected local services:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend API | `http://127.0.0.1:5000` |
| AI service | `http://127.0.0.1:8000` |
| Auth service | `http://127.0.0.1:8001` |
| Hardhat blockchain | `http://127.0.0.1:8545` |
| PostgreSQL | `localhost:5432` optional |

Start the stack using `RUN_WITH_AUTH_AND_FRAUD_TESTS.md` before running the tests below.

## Health Checks

```powershell
curl.exe http://127.0.0.1:8000/health
curl.exe http://127.0.0.1:8001/health
curl.exe http://127.0.0.1:5000/health
curl.exe http://localhost:3000
```

Expected:

- AI returns `{ "ok": true, "service": "ai", ... }`.
- Auth returns `{ "ok": true, "service": "auth" }`.
- Backend returns `{ "ok": true, "service": "backend", ... }`.
- Frontend returns an HTML page.

## Authentication Tests

### Login With Default Admin

```powershell
$loginBody = @{
  username = "admin"
  password = "admin123"
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8001/login" -ContentType "application/json" -Body $loginBody
$login
```

Expected:

- A `token` field.
- A `user` object with role `admin`.

### Read Current User

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8001/me" -Headers @{ Authorization = "Bearer $($login.token)" }
```

Expected:

- Current admin user details.

### Register A Test Institution

```powershell
$registerBody = @{
  username = "institution-test"
  password = "test12345"
  role = "institution"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8001/register" -ContentType "application/json" -Body $registerBody
```

Expected:

- A user record with role `institution`.
- If the user already exists, a `400` response is acceptable for repeat test runs.

## Credential API Tests

### Issue A Credential

```powershell
$issueBody = @{
  studentId = "STU-TEST-001"
  issuerId = "UNIV-TEST"
  credentialData = "Bachelor of Computer Science, Certificate Number CS-TEST-001"
} | ConvertTo-Json

$issued = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/credentials/issue" -ContentType "application/json" -Body $issueBody
$issued
```

Expected:

- `ok: true`
- `credentialHash` is a 64-character hex string.
- `txHash` is present if the blockchain call succeeded.

### Verify By Hash

```powershell
$hash = $issued.credentialHash
$verify = Invoke-RestMethod "http://127.0.0.1:5000/api/verify/by-hash/$hash?studentId=STU-TEST-001&issuerId=UNIV-TEST"
$verify
```

Expected:

- `blockchain.exists: true`
- `blockchain.revoked: false`
- `risk.ok: true`
- `trustRank` between `1` and `5`

### Verify Student ID Mismatch Protection

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/api/verify/by-hash/$hash?studentId=WRONG-STUDENT&issuerId=UNIV-TEST"
```

Expected:

- A forbidden response with `code: STUDENT_ID_MISMATCH` when the backend has the original student mapping in memory or PostgreSQL.

### Direct Blockchain Verification

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/api/credentials/verify/$hash"
```

Expected:

- `exists: true`
- `revoked: false`

## ZKP Tests

DECAID's current ZKP demo uses SHA-256 commitments:

```text
commitment = sha256(credentialHash:studentId:nonce)
```

### Generate Proof

```powershell
$proofBody = @{
  credentialHash = $hash
  studentId = "STU-TEST-001"
} | ConvertTo-Json

$proof = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/zkp/generate" -ContentType "application/json" -Body $proofBody
$proof
```

Expected:

- `commitment` is 64-character hex.
- `nonce` is returned.
- `algorithm` is `SHA-256-commitment-v1`.

### Verify Proof

```powershell
$zkpVerifyBody = @{
  credentialHash = $hash
  studentId = "STU-TEST-001"
  nonce = $proof.nonce
  commitment = $proof.commitment
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/zkp/verify" -ContentType "application/json" -Body $zkpVerifyBody
```

Expected:

- `valid: true`.

### Commitment-Only Verification

Commitment-only verification depends on the backend's in-memory individual credential store. It works best immediately after issuing and storing a commitment in the same backend process.

```powershell
$storeBody = @{
  credentialHash = $hash
  studentId = "STU-TEST-001"
  nonce = $proof.nonce
  commitment = $proof.commitment
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/zkp/store-commitment" -ContentType "application/json" -Body $storeBody

$commitOnlyBody = @{
  nonce = $proof.nonce
  commitment = $proof.commitment
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/zkp/verify-by-commitment" -ContentType "application/json" -Body $commitOnlyBody
```

Expected:

- `valid: true`
- Blockchain summary returned without exposing student ID or credential hash.

## Student Profile Tests

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/api/students/STU-TEST-001/profile"
```

Expected:

- `did` starts with `did:decaid:`.
- `credentialCount` is at least `1`.
- Credentials include blockchain, risk, trust, and duplicate fields.

## Batch Tests

```powershell
$batchBody = @{
  issuerId = "UNIV-TEST"
  credentials = @(
    @{
      studentId = "STU-BATCH-001"
      issuerId = "UNIV-TEST"
      credentialData = "Bachelor of Science, Certificate Number BATCH-001"
    },
    @{
      studentId = "STU-BATCH-002"
      issuerId = "UNIV-TEST"
      credentialData = "Bachelor of Arts, Certificate Number BATCH-002"
    }
  )
} | ConvertTo-Json -Depth 5

$batch = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/institutions/batches" -ContentType "application/json" -Body $batchBody
$batch
```

Expected:

- `ok: true`
- `batchId` present
- `count: 2`

Fetch the batch:

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/api/institutions/batches/$($batch.batchId)"
```

Expected:

- Batch metadata and two results.

## Fraud Detection Tests

Use `fraud-test-data.json`.

For each `fraudPairs` entry:

1. Issue the `first` credential.
2. Issue the `second` credential with the reused unique identifier.
3. Verify the second credential hash.

Expected:

- `contentDuplicateDetected: true` in verification, when the backend can resolve the stored content signature.
- `risk.reasons` includes reused credential identifier reasoning.
- `risk.ruleScore` increases.

For `safePairs`:

- Shared descriptive text should not trigger the unique identifier duplicate rule.

## Revocation Test

```powershell
$revokeBody = @{
  credentialHash = $hash
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/credentials/revoke" -ContentType "application/json" -Body $revokeBody
Invoke-RestMethod "http://127.0.0.1:5000/api/credentials/verify/$hash"
```

Expected:

- Revoke returns `ok: true`.
- Follow-up verification returns `revoked: true`.

## Document Storage Test

Upload a small file through the frontend Institution Portal, or call the backend multipart endpoint:

```powershell
# Use the frontend for the easiest manual document test.
# Backend endpoint: POST /api/ipfs/upload with multipart field name "file".
```

Expected:

- Upload returns a generated `cid` such as `file-...`.
- After credential issue, `/api/documents` lists stored metadata/data when PostgreSQL or in-memory storage contains the document.

## Admin Endpoint Tests

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/api/admin/stats"
Invoke-RestMethod "http://127.0.0.1:5000/api/admin/students"
Invoke-RestMethod "http://127.0.0.1:5000/api/admin/issuers"
Invoke-RestMethod "http://127.0.0.1:5000/api/admin/credentials"
Invoke-RestMethod "http://127.0.0.1:5000/api/admin/batches"
Invoke-RestMethod "http://127.0.0.1:5000/api/documents"
```

Expected:

- JSON with `ok: true`.
- Lists may be empty in a new in-memory session.

## Frontend UI Tests

### Login

1. Open `http://localhost:3000`.
2. Log in as `admin/admin123`.
3. Confirm the header displays username and role.

### Institution Portal

1. Issue one credential.
2. Copy the success hash.
3. Use batch upload with lines in `StudentID|CredentialData` format.
4. Load credentials for revocation.

### Employer Verify

1. Paste a credential hash.
2. Provide student and issuer IDs when available.
3. Confirm blockchain status, revocation status, risk score, duplicate status, and trust rank.

### Student Identity

1. Enter a student ID that has issued credentials.
2. Confirm DID, credential count, credential cards, and student risk score.

### ZKP Tools

1. Generate a proof for an existing credential.
2. Verify with full hash/student/nonce/commitment data.
3. Try commitment-only verification after storing the commitment.

### Admin Dashboard

1. Open all dashboard tabs.
2. Confirm stats, students, issuers, credentials, documents, and batches render.
3. Use delete actions only on disposable test data.

## Troubleshooting

### Backend cannot write to blockchain

- Confirm Hardhat is running on `127.0.0.1:8545`.
- Redeploy the contract.
- Confirm `backend/src/contract/CredentialRegistry.json` has a valid address.
- Confirm `ISSUER_PRIVATE_KEY` is set for a local Hardhat account.
- Restart the backend after changes.

### Login fails

- Confirm auth service is running on `127.0.0.1:8001`.
- Restart the auth service.
- Delete the local `auth.db` only if you intentionally want to reset auth data.

### Risk score is missing

- Confirm AI service is running on `127.0.0.1:8000`.
- Check backend logs for `AI service unavailable`.
- Use `simple_main.py` if Python package compatibility blocks the main AI service.

### Data disappears

- The backend is likely running in memory mode.
- Start PostgreSQL and set backend DB variables for persistence.

### Frontend dashboard data seems incomplete

- Some frontend paths are still being aligned with the backend. Use the backend admin endpoints directly to confirm stored data.
