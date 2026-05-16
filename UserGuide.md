# DECAID User Guide

DECAID is a local web application for academic credential issuance and verification. It helps institutions issue credentials, students view identity records, employers verify credentials, and administrators inspect system data.

## Quick Start For Users

1. Start the full stack using `RUN_WITH_AUTH_AND_FRAUD_TESTS.md`.
2. Open `http://localhost:3000`.
3. Log in or register.
4. Use the tabs available for your role.

Default admin login:

```text
username: admin
password: admin123
```

## Roles

| Role | What You Can Do |
| --- | --- |
| Student | View student DID, credentials, risk score, and documents |
| Institution | Issue credentials, batch upload, upload documents, view issued credentials |
| Employer | Verify a credential hash and inspect risk/trust data |
| Admin | Access all tabs and dashboard inspection tools |

The app shows tabs based on your role.

## Login And Registration

### Login

1. Open the DECAID frontend.
2. Choose `Login`.
3. Enter username and password.
4. Click `Login`.

### Register

1. Choose `Register`.
2. Enter username and password.
3. Select a role:
   - `student`
   - `institution`
   - `employer`
   - `admin`
4. Submit the form.

After registration, the app logs you in with the selected role.

## App Layout

After login, you will see:

- a header with your username and role,
- role-based navigation tabs,
- an API Connection panel,
- a main work area,
- and a raw JSON panel for technical details.

The default backend API URL is:

```text
http://127.0.0.1:5000
```

If your backend runs elsewhere, update the API Connection panel and click `Save`.

## For Institutions

Use the Institution Portal to create academic credentials.

### Issue One Credential

1. Open `Institution Portal`.
2. Enter an `Issuer ID`, such as `UNIV-2024`.
3. Enter a `Student ID`, such as `STU-1001`.
4. Enter credential data, such as:

```text
Bachelor of Computer Science, Certificate Number CS-2024-5001
```

5. Optionally attach a document.
6. Click `Issue Credential`.
7. Copy the generated credential hash from the success message.

The credential hash is what employers use for verification.

### Batch Upload

The batch box accepts one credential per line:

```text
StudentID|CredentialData
```

Example:

```text
STU-2001|Bachelor of Commerce, Certificate Number COM-2024-001
STU-2002|Master of AI, Certificate Number AI-2024-002
STU-2003|Diploma in Data Analytics, Certificate Number DA-2024-003
```

Steps:

1. Enter the issuer ID.
2. Enter a batch name for your own reference.
3. Paste the batch lines.
4. Click `Upload Batch`.

### Manage Credentials

The portal can load credentials for an issuer and show revoke actions for test data.

Use revocation carefully. Revocation writes to the blockchain and is intended to mark a credential as no longer valid.

## For Employers

Use Employer Verify to check a credential.

### Verify A Credential

1. Open `Employer Verify`.
2. Paste the 64-character credential hash.
3. Enter Student ID and Issuer ID if you have them.
4. Click `Verify`.

The result can show:

- whether the credential exists on chain,
- whether it is active or revoked,
- duplicate status,
- fraud-risk score,
- risk level,
- risk reasons,
- AI score and rule score,
- issuer trust rank,
- issuer blockchain address,
- and technical raw JSON.

### Understanding Risk Score

| Score | Meaning |
| ---: | --- |
| `0-20` | Low risk |
| `21-50` | Medium risk |
| `51-100` | High risk |

High score does not automatically prove fraud. It means the credential needs closer review.

### Student ID Mismatch

If the app reports a student mismatch, the credential hash is associated with a different student ID than the one entered. Check the student ID and try again.

## For Students

Use Student Identity to view your DID and issued credentials.

### Load Student Profile

1. Open `Student Identity`.
2. Enter the student ID used during credential issuance.
3. Click `Load Profile`.

The profile can show:

- DID,
- credential count,
- student risk score,
- issued credentials,
- blockchain status,
- issuer trust,
- documents if available,
- and verification history demo data.

### DID

DECAID generates DIDs in this format:

```text
did:decaid:<uuid>
```

The DID is a project-local decentralized identifier for the student profile.

## ZKP Tools

Admins can access ZKP Tools in the current UI.

DECAID's current ZKP feature is a SHA-256 commitment demo:

```text
commitment = sha256(credentialHash:studentId:nonce)
```

### Generate A Proof

1. Open `ZKP Tools`.
2. Enter credential hash.
3. Enter student ID.
4. Optionally enter a nonce, or leave it blank.
5. Click `Generate ZKP Proof`.

The app returns:

- commitment,
- nonce,
- algorithm name.

### Verify A Proof

To verify with full information, provide:

- credential hash,
- student ID,
- nonce,
- commitment.

To verify by commitment only, provide:

- commitment,
- nonce.

Commitment-only verification works best in the same backend session where the commitment was stored.

## For Admins

The Admin Dashboard shows system-wide data.

Tabs include:

- Overview,
- Students,
- Issuers,
- Credentials,
- Documents.

Admins can inspect:

- total students,
- total issuers,
- total credentials,
- total documents,
- total batches,
- credential hashes,
- risk scores,
- document metadata,
- and stored records.

Delete actions are intended for local test cleanup. Do not use them on important data.

## Fraud Test Walkthrough

The project includes `fraud-test-data.json`.

To demonstrate duplicate-content detection:

1. Log in as admin.
2. Open Institution Portal.
3. Pick one `fraudPairs` entry.
4. Issue the `first` credential.
5. Issue the `second` credential.
6. Verify the second credential in Employer Verify.
7. Look for reused unique identifier reasoning in the risk panel.

Example fraud pattern:

```text
Student A: Certificate Number CS-2024-5001
Student B: Certificate Number CS-2024-5001
```

The second credential should be considered suspicious because a unique identifier was reused for another student.

## Common Problems

### I cannot log in

Check that the auth service is running:

```text
http://127.0.0.1:8001/health
```

### Verification fails with blockchain unavailable

Make sure Hardhat is running, the contract has been deployed, and the backend was restarted after deployment.

### Risk score is missing

Check the AI service:

```text
http://127.0.0.1:8000/health
```

### My data disappeared

The backend may be running without PostgreSQL. In-memory demo data disappears when the backend restarts.

### Document data is confusing

The UI and backend use `ipfs` naming for compatibility, but the current local project stores uploaded files directly in memory or PostgreSQL.

### Google login is missing

The backend has Google OAuth code, but the current frontend uses username/password login through the auth service.

## Best Demo Data

Use clear credential data with unique identifiers:

```text
Bachelor of Computer Science, Certificate Number CS-2024-1001
Master of Business Administration, Registration Number REG-MBA-8842
B.Tech Mechanical Engineering, Roll Number MECH-7712
Bachelor of Commerce, Transcript Number TR-2024-1199
Bachelor of Arts, Document Hash DOC-8f3a91b7c2d4
```

Good student IDs:

```text
STU-1001
STU-1002
STU-DEMO-001
SAFE-1001
```

Good issuer IDs:

```text
UNIV-2024
DEMO-UNIVERSITY
MIT-UNIVERSITY
HARVARD-MEDICAL
```

## What DECAID Proves

DECAID demonstrates that a credential verification system can combine:

- on-chain credential state,
- off-chain profile and document data,
- fraud-risk scoring,
- role-based user workflows,
- student identity,
- and privacy-oriented proof commitments.

The project is a local prototype, but it shows the end-to-end shape of a more secure academic credential ecosystem.
