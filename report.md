# DECAID Project Report

## 1. Project Overview

**DECAID** stands for **Decentralized Academic Identity and Credential Verification**. It is a final-year project that demonstrates how academic certificates can be issued, verified, revoked, and risk-analyzed using web technologies, blockchain, artificial intelligence, and digital identity concepts.

The main problem solved by this project is academic credential fraud. In the traditional process, employers or other institutions must manually contact a college or university to confirm whether a certificate is real. This is slow, difficult to scale, and vulnerable to fake or edited documents. DECAID improves this process by generating a cryptographic hash of a credential and storing that hash on a blockchain smart contract. Later, any verifier can check the hash to confirm whether the credential was issued and whether it has been revoked.

The system supports multiple real-world roles:

- **Student:** requests certificates and views approved credentials.
- **Institution/Incharge:** reviews certificate requests and issues credentials.
- **Employer:** verifies credential hashes.
- **Admin:** monitors students, issuers, credentials, documents, and requests.

The project is designed as a local demo system, but the architecture follows concepts that can be extended to real deployments.

## 2. Problem Statement

Fake academic certificates are easy to create but difficult to verify quickly. Manual verification through email, phone calls, or paperwork takes time and depends heavily on human trust. A secure digital system should provide:

- A trusted way to prove that a certificate was really issued.
- A method to detect tampered or duplicate credentials.
- A way to revoke invalid credentials without deleting history.
- Privacy protection so full certificate data is not exposed publicly.
- A fast verification process for employers and institutions.

DECAID addresses these needs using **SHA-256 hashing**, **blockchain immutability**, **role-based workflows**, **AI fraud-risk scoring**, and **ZKP-style commitments**.

## 3. High-Level Architecture

DECAID is built as a multi-service application. Each service has a specific responsibility, which makes the project easier to understand, test, and extend.

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React, Vite, Tailwind CSS | User interface for all roles |
| Backend API | Node.js, Express.js, Ethers.js | Main business logic and blockchain communication |
| Auth Service | FastAPI, SQLite, bcrypt, JWT | Registration, login, role detection, token handling |
| AI Service | FastAPI, scikit-learn, rules | Fraud-risk scoring |
| Blockchain | Solidity, Hardhat | Credential hash registry |
| Database | PostgreSQL or memory fallback | Stores students, DIDs, credentials, documents, requests, commitments |

### System Flow

```text
React Frontend : localhost:3000
    |
    +--> Auth Service : 127.0.0.1:8001
    |       Register, login, JWT token, role detection
    |
    +--> Backend API : 127.0.0.1:5000
            |
            +--> AI Service : 127.0.0.1:8000
            |       Fraud score and risk reasons
            |
            +--> Hardhat Blockchain : 127.0.0.1:8545
            |       Issue, verify, revoke credential hash
            |
            +--> PostgreSQL / In-memory Storage
                    Credential records, DIDs, documents, requests
```

The frontend never directly writes to the blockchain. It calls the backend, and the backend performs validation, hash generation, database storage, smart contract interaction, and risk analysis.

## 4. Technology Used

### Frontend

The frontend is built with **React 18**, **Vite**, and **Tailwind CSS**. React provides reusable UI components, Vite gives a fast development server, and Tailwind is used for styling. The frontend includes views for login/register, student certificate requests, incharge review, employer verification, ZKP tools, and admin monitoring.

Important files:

- `frontend/src/App.jsx`
- `frontend/src/api.js`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/contexts/AuthContext.jsx`

The frontend stores the JWT token in browser local storage and sends it with protected requests.

### Backend API

The main backend uses **Node.js** and **Express.js**. It works as the central controller of the application. It handles certificate requests, credential issuing, verification, revocation, document metadata, admin APIs, student DIDs, and ZKP commitments.

Important backend technologies:

- **Express.js:** REST API routing.
- **Ethers.js:** Communication with the Ethereum smart contract.
- **Zod:** Request validation.
- **Multer:** File upload handling.
- **Node crypto module:** SHA-256 hashing and UUID generation.
- **pg:** PostgreSQL connection.

Important files:

- `backend/src/index.js`
- `backend/src/database.js`
- `backend/src/auth.js`

### Authentication Service

The auth service is built separately using **Python FastAPI**. It uses **SQLite** for storing users, **bcrypt** for password hashing, and **JWT** for login sessions.

User role is detected from the username prefix:

| Prefix | Role |
| --- | --- |
| `STU` | Student |
| `TSI` | Teacher Student Incharge |
| `FOR` | Forum/Sport/Event Incharge |
| `NPT` | NPTEL/TNP Incharge |
| `III` | Internship Incharge |
| `EMP` | Employer |
| `ADM` | Admin |
| `INS` | Institution |

The auth service exposes `/register`, `/login`, `/me`, and `/health`.

### AI Fraud-Risk Service

The AI service is built with **FastAPI**, **Pydantic**, **NumPy**, and **scikit-learn Isolation Forest**. It combines rule-based checks and anomaly detection.

Signals used for risk scoring include:

- Duplicate credential hash.
- Same certificate identifier reused for another student.
- Revoked credential.
- Credential not found on blockchain.
- Low issuer trust.
- Very rapid issuance.
- Large batch size.
- Missing document.

The service returns a score from `0` to `100`:

- `0-20`: Low risk
- `21-50`: Medium risk
- `51-100`: High risk

### Blockchain Layer

The blockchain part uses **Solidity** and **Hardhat**. The smart contract is `CredentialRegistry.sol`. It stores only the credential hash, issuer address, issue timestamp, and revoked status.

Main smart contract functions:

- `issue(bytes32 credentialHash)`
- `verify(bytes32 credentialHash)`
- `revoke(bytes32 credentialHash)`
- `authorizeIssuer(address issuer)`
- `deauthorizeIssuer(address issuer)`

Only the hash is stored on blockchain, not the full certificate. This protects privacy while still proving authenticity.

### Database

The project can use PostgreSQL through Docker. If PostgreSQL is not configured, the backend uses in-memory storage. PostgreSQL stores issuer statistics, batches, credential results, student DIDs, documents, certificate requests, and ZKP commitments.

## 5. Main Project Workflows

### Student Certificate Request

A student logs in, selects a certificate type, fills in title and description, and optionally uploads a document. Based on the certificate type, the request is routed to the correct incharge. For example, internship certificates go to the internship incharge, and NPTEL/course certificates go to the NPTEL/TNP incharge.

### Incharge Review and Issue

The incharge opens the review queue, checks the certificate details and uploaded file, and either rejects or approves the request. If approved, the backend generates a SHA-256 credential hash, stores related data, sends the hash to the blockchain smart contract, and returns the hash to the student.

### Employer Verification

An employer enters the 64-character credential hash. The backend checks whether the hash exists on blockchain, whether it is revoked, and whether risk signals are present. It then calls the AI service and returns blockchain status plus fraud-risk information.

### Revocation

If a credential becomes invalid, an authorized user can revoke it. The blockchain keeps the credential record but marks it as revoked. This preserves audit history while preventing future trust in that credential.

### ZKP-Style Verification

The project demonstrates a simplified zero-knowledge-style concept using commitments:

```text
commitment = SHA256(credentialHash + ":" + studentId + ":" + nonce)
```

The commitment can later be verified using the correct nonce and related values. This demonstrates privacy-preserving verification because the user can prove a relationship to a credential without always exposing full credential data.

## 6. Low-Level Concepts

### SHA-256 Hashing

SHA-256 converts certificate data into a fixed 64-character hexadecimal hash. Even a small change in the input creates a different hash. DECAID uses this hash as a unique fingerprint of the credential.

### Smart Contract Mapping

The Solidity contract stores credentials using a mapping:

```solidity
mapping(bytes32 => Credential) private credentials;
```

This allows fast lookup by hash during verification.

### JWT Authentication

After login, the auth service returns a JWT token containing user information and role. The frontend stores the token and uses it to identify the logged-in user.

### bcrypt Password Security

Passwords are hashed using bcrypt before storage. The system never needs to store plain-text passwords.

### DID Generation

The project creates decentralized identifiers for students in this format:

```text
did:decaid:<uuid>
```

This introduces the concept of decentralized identity linked with academic credentials.

### Hybrid Fraud Detection

The risk engine combines direct rules and Isolation Forest anomaly detection. Rules catch known fraud indicators, while Isolation Forest helps detect unusual behavior patterns.

## 7. Important API Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Backend health check |
| `/api/credentials/issue` | POST | Issue one credential |
| `/api/credentials/revoke` | POST | Revoke a credential |
| `/api/credentials/verify/:hash` | GET | Direct blockchain verification |
| `/api/verify/by-hash/:hash` | GET | Employer verification with risk analysis |
| `/api/certificate-requests` | GET/POST | List or create certificate requests |
| `/api/certificate-requests/:id/review` | POST | Approve or reject a request |
| `/api/students/:studentId/profile` | GET | Student DID and credential profile |
| `/api/zkp/generate` | POST | Generate commitment proof |
| `/api/zkp/verify` | POST | Verify commitment proof |
| `/api/admin/stats` | GET | Admin dashboard statistics |

## 8. Exhibition Demonstration Plan

For a project exhibition, the demo can be shown in this order:

1. Explain the problem of fake academic certificates.
2. Login as a student and submit a certificate request.
3. Login as the correct incharge and approve the request.
4. Show that a credential hash is generated and added to blockchain.
5. Login as employer and verify the hash.
6. Show blockchain status, revoked status, and AI risk score.
7. Demonstrate revocation if needed.
8. Show ZKP commitment generation and verification.
9. Open the admin dashboard to show system monitoring.

## 9. Terminal Commands to Run the Full Project

Run these commands from separate terminals because each service keeps running continuously. The recommended order is database, blockchain, contract deployment, AI service, auth service, backend, and frontend.

### 9.1 Open Project Folder

```powershell
cd E:\FinalYearProject
```

This moves the terminal into the main project directory. All other commands assume the project is located at `E:\FinalYearProject`.

### 9.2 Install Root Dependencies

```powershell
npm install
```

This installs root-level Node.js dependencies. The root `package.json` mainly provides scripts for running multiple services.

### 9.3 Install Blockchain Dependencies

```powershell
cd E:\FinalYearProject\blockchain
npm install
```

This installs Hardhat and blockchain development dependencies required to compile, run, and deploy the Solidity smart contract.

### 9.4 Install Backend Dependencies

```powershell
cd E:\FinalYearProject\backend
npm install
```

This installs the Express backend dependencies such as `express`, `ethers`, `zod`, `multer`, `pg`, and authentication-related packages.

### 9.5 Install Frontend Dependencies

```powershell
cd E:\FinalYearProject\frontend
npm install
```

This installs React, Vite, Tailwind CSS, and frontend packages required for the web interface.

### 9.6 Install Python Dependencies

```powershell
cd E:\FinalYearProject
python -m pip install -r ai-service\requirements.txt
python -m pip install -r auth-service\requirements.txt bcrypt
```

The first command installs AI service packages such as FastAPI, NumPy, and scikit-learn. The second command installs authentication service packages, including FastAPI, JWT support, SQLite integration, and bcrypt password hashing.

### 9.7 Start PostgreSQL Database

```powershell
cd E:\FinalYearProject
docker-compose up -d
```

This starts PostgreSQL in Docker using `docker-compose.yml`. PostgreSQL stores students, credentials, issuer stats, certificate requests, documents, and ZKP commitments. This step is optional because the backend can fall back to in-memory storage, but PostgreSQL is better for demonstration because data remains after backend restart.

### 9.8 Start Local Blockchain Node

Open a new terminal:

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545
```

This starts a local Ethereum blockchain using Hardhat. It provides test accounts and runs at `http://127.0.0.1:8545`. Keep this terminal open.

### 9.9 Deploy Smart Contract

Open another terminal:

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat run scripts/deploy.js --network localhost
```

This deploys the `CredentialRegistry.sol` smart contract to the local Hardhat blockchain. It also writes the deployed contract address and ABI to the backend contract file so the backend can call the smart contract.

### 9.10 Start AI Fraud-Risk Service

Open another terminal:

```powershell
cd E:\FinalYearProject\ai-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

This starts the AI service at `http://127.0.0.1:8000`. The backend calls this service to calculate risk score, risk level, AI score, rule score, and fraud reasons.

Health check:

```powershell
curl.exe http://127.0.0.1:8000/health
```

### 9.11 Start Authentication Service

Open another terminal:

```powershell
cd E:\FinalYearProject\auth-service
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

This starts the login/register service at `http://127.0.0.1:8001`. It stores users in SQLite, hashes passwords with bcrypt, detects roles from username prefixes, and returns JWT tokens.

Health check:

```powershell
curl.exe http://127.0.0.1:8001/health
```

### 9.12 Start Backend API

Open another terminal:

```powershell
cd E:\FinalYearProject\backend
npm run dev
```

This starts the Express backend at `http://127.0.0.1:5000`. The backend handles credential issuing, blockchain verification, revocation, document upload, certificate requests, student DIDs, admin APIs, and ZKP APIs.

Health check:

```powershell
curl.exe http://127.0.0.1:5000/health
```

### 9.13 Start Frontend

Open another terminal:

```powershell
cd E:\FinalYearProject\frontend
npm run dev
```

This starts the React/Vite frontend. Open the shown URL in the browser, usually:

```text
http://localhost:3000
```

The frontend is where students submit requests, incharges approve certificates, employers verify hashes, admins monitor records, and users test ZKP tools.

### 9.14 Optional Single Command for Main Services

From the root folder:

```powershell
cd E:\FinalYearProject
npm run dev
```

This uses the root script to start backend, frontend, AI service, and auth service together. However, the blockchain node and contract deployment should still be started separately first. For exhibition, separate terminals are easier to explain and debug.

### 9.15 Full Startup Summary

Use this order for a clean demo:

```powershell
cd E:\FinalYearProject
docker-compose up -d
```

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545
```

```powershell
cd E:\FinalYearProject\blockchain
npx hardhat run scripts/deploy.js --network localhost
```

```powershell
cd E:\FinalYearProject\ai-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
cd E:\FinalYearProject\auth-service
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

```powershell
cd E:\FinalYearProject\backend
npm run dev
```

```powershell
cd E:\FinalYearProject\frontend
npm run dev
```

After all services are running, open:

```text
http://localhost:3000
```

## 10. Strengths and Future Scope

### Strengths

- Combines blockchain, AI, authentication, database, and frontend concepts.
- Stores only hashes on blockchain, improving privacy.
- Supports multiple real-world roles.
- Provides instant employer verification.
- Includes revocation and fraud-risk scoring.
- Demonstrates decentralized identity through DIDs.
- Includes privacy-focused commitment verification.

### Current Limitations

- Blockchain runs locally using Hardhat.
- In-memory mode loses data after restart.
- ZKP implementation is educational, not a full zk-SNARK system.
- Document storage is database/memory based, not true IPFS.
- Duplicate blockchain issuance is relaxed for fraud testing.

### Future Enhancements

- Deploy contract on a testnet or permissioned blockchain.
- Add real IPFS or decentralized document storage.
- Add QR code verification for certificates.
- Train the AI model with real fraud datasets.
- Add full cryptographic ZKP support.
- Add stronger production-grade role and issuer management.

## 11. Conclusion

DECAID is a complete academic credential verification demo that connects high-level user workflows with low-level security and blockchain concepts. At the high level, it shows how students, institutions, employers, and admins can interact in a trusted credential ecosystem. At the low level, it uses SHA-256 hashing, Solidity smart contracts, JWT authentication, bcrypt password hashing, PostgreSQL storage, Isolation Forest fraud detection, and commitment-based verification.

For project exhibition, DECAID can be presented as a practical solution for **secure, fast, intelligent, and privacy-aware academic credential verification**.
