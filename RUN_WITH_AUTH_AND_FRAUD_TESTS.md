# DECAID Local Run Guide With Authentication And Fraud Tests

This guide starts the complete local DECAID stack and then walks through authentication and duplicate-credential fraud tests.

## Services

| Service | URL | Required |
| --- | --- | --- |
| Hardhat blockchain | `http://127.0.0.1:8545` | Yes |
| AI service | `http://127.0.0.1:8000` | Yes |
| Auth service | `http://127.0.0.1:8001` | Yes for frontend login |
| Backend API | `http://127.0.0.1:5000` | Yes |
| Frontend | `http://localhost:3000` | Yes for UI demo |
| PostgreSQL | `localhost:5432` | Optional |

## Install Dependencies

Run from the project root:

```powershell
cd E:\FinalYearProject
npm install
cd blockchain; npm install
cd ..\backend; npm install
cd ..\frontend; npm install
cd ..; python -m pip install -r ai-service\requirements.txt
python -m pip install -r auth-service\requirements.txt bcrypt
```

If the AI service cannot install `numpy` or `scikit-learn`, use the pure-Python fallback:

```powershell
cd E:\FinalYearProject\ai-service
python -m pip install -r simple_requirements.txt
python -m uvicorn simple_main:app --host 127.0.0.1 --port 8000
```

## Backend Environment

Create `backend\.env` if needed:

```powershell
copy E:\FinalYearProject\backend\.env.example E:\FinalYearProject\backend\.env
```

For local Hardhat writes, set:

```text
ISSUER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CHAIN_RPC_URL=http://127.0.0.1:8545
AI_SERVICE_URL=http://127.0.0.1:8000
```

If you do not want PostgreSQL, leave `DB_HOST` unset. If `DB_HOST` is present, start PostgreSQL before the backend.

## Startup Order

Open separate terminals and start services in this order.

### Optional Terminal 0: PostgreSQL

```powershell
cd E:\FinalYearProject
docker-compose up -d
```

### Terminal 1: Blockchain Network

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545
```

Expected output includes:

```text
Started HTTP and WebSocket JSON-RPC server
```

### Terminal 2: Deploy Smart Contract

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat run scripts/deploy.js --network localhost
```

Expected output:

```text
CredentialRegistry deployed to: 0x...
```

The deploy script writes the contract address and ABI to `backend\src\contract\CredentialRegistry.json`.

### Terminal 3: AI Service

```powershell
cd E:\FinalYearProject\ai-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Expected output:

```text
Uvicorn running on http://127.0.0.1:8000
```

### Terminal 4: Auth Service

```powershell
cd E:\FinalYearProject\auth-service
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

Expected output:

```text
Uvicorn running on http://127.0.0.1:8001
```

### Terminal 5: Backend API

```powershell
cd E:\FinalYearProject\backend
npm run dev
```

Expected output:

```text
Backend listening on http://127.0.0.1:5000
```

### Terminal 6: Frontend

```powershell
cd E:\FinalYearProject\frontend
npm run dev
```

Expected output:

```text
Local: http://localhost:3000
```

## Authentication

The current frontend login page uses the auth service on port `8001`.

Default admin login:

```text
username: admin
password: admin123
```

You can also register new users from the login page with one of these roles:

- `student`
- `institution`
- `employer`
- `admin`

The selected role controls which tabs are visible after login.

## Health Checks

Run these after startup:

```powershell
curl.exe http://127.0.0.1:8545
curl.exe http://127.0.0.1:8000/health
curl.exe http://127.0.0.1:8001/health
curl.exe http://127.0.0.1:5000/health
curl.exe http://localhost:3000
```

## Fast API Smoke Test

Issue a credential:

```powershell
$body = @{
  studentId = "STU-DEMO-001"
  issuerId = "UNIV-2024"
  credentialData = "Bachelor of Computer Science, Certificate Number CS-2024-1001"
} | ConvertTo-Json

$issued = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/credentials/issue" -ContentType "application/json" -Body $body
$issued
```

Verify it:

```powershell
$hash = $issued.credentialHash
Invoke-RestMethod "http://127.0.0.1:5000/api/verify/by-hash/$hash?studentId=STU-DEMO-001&issuerId=UNIV-2024"
```

Generate a commitment proof:

```powershell
$proofBody = @{
  credentialHash = $hash
  studentId = "STU-DEMO-001"
} | ConvertTo-Json

$proof = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/zkp/generate" -ContentType "application/json" -Body $proofBody
$proof
```

Verify it:

```powershell
$verifyBody = @{
  credentialHash = $hash
  studentId = "STU-DEMO-001"
  nonce = $proof.nonce
  commitment = $proof.commitment
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/api/zkp/verify" -ContentType "application/json" -Body $verifyBody
```

## Fraud Test Data

Ready-made records are in `fraud-test-data.json`.

Use each pair in order:

1. Issue the `first` record.
2. Issue the `second` record.
3. Verify the second credential.
4. Inspect `risk.reasons`, `contentDuplicateDetected`, and `risk.ruleScore`.

Expected behavior:

- `fraudPairs`: the second record reuses a unique credential identifier for another student and should be flagged.
- `safePairs`: shared descriptive text alone should not trigger the unique-identifier duplicate rule.

## UI Fraud Test

1. Log in as `admin/admin123`.
2. Open `Institution Portal`.
3. Issue the first record from one `fraudPairs` entry.
4. Issue the second record from the same pair.
5. Copy the second credential hash from the success notification.
6. Open `Employer Verify`.
7. Paste the hash, student ID, and issuer ID.
8. Confirm the risk panel shows duplicate-content reasoning.

## Notes

- The root `npm run dev` starts the backend, frontend, and AI service only. It does not start Hardhat or the auth service.
- If the backend says `Running with in-memory storage`, persistence is disabled but the demo can still run.
- If blockchain calls fail, restart Hardhat, redeploy the contract, then restart the backend.
- If the frontend login fails, confirm the auth service is running on port `8001`.
- If the AI service is unavailable, the backend can fall back to a simpler built-in heuristic in some verification paths.
