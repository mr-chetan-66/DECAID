# DECAID Demo Testing Guide

This guide provides comprehensive instructions for testing the DECAID application from all user perspectives.

## Demo Credentials

### User Accounts
| Role | Username | Password | Purpose |
|------|----------|----------|---------|
| Admin | admin | admin123 | System administration, dashboard access |
| Student | student1 | student123 | View credentials, student identity |
| Institution | institution1 | institution123 | Issue credentials, batch operations |
| Employer | employer1 | employer123 | Verify credentials, check risk scores |

### Demo Students & Credentials
| Student ID | Credential Type | Program | Certificate Number |
|------------|----------------|---------|-------------------|
| STU-DEMO-001 | Individual | Bachelor of Computer Science | CS-2024-DEMO-001 |
| STU-DEMO-002 | Batch | Bachelor of Science in Data Science | DS-2024-DEMO-002 |
| STU-DEMO-003 | Batch | Master of Business Administration | MBA-2024-DEMO-003 |
| STU-DEMO-004 | Batch | Bachelor of Engineering in Mechanical | ME-2024-DEMO-004 |
| STU-DEMO-005 | Batch | Bachelor of Arts in Economics | EC-2024-DEMO-005 |

### Demo Credential Hash
- STU-DEMO-001: `262aaa92936d7e586e21956db0629c8b9e03ef3bda9319a136de7cd9dd31e24`

## Testing Instructions by Role

### 1. Admin Perspective

**Login:**
- Navigate to http://localhost:3000
- Login with `admin` / `admin123`

**Features to Test:**
- **Admin Dashboard**: View system statistics
  - Total students count
  - Total issuers count
  - Total credentials count
  - Total batches count
  - Total documents count

- **Student Management**: View all registered students
- **Issuer Management**: View all institutions/issuers
- **Credential Management**: View all issued credentials
- **Batch Management**: View batch operations
- **Document Management**: View uploaded documents

**Expected Behavior:**
- Admin should see all demo students (STU-DEMO-001 through STU-DEMO-005)
- Admin should see the institution (INST-DEMO-001)
- Admin should see 5 total credentials (1 individual + 4 batch)
- Admin should see 1 batch (BATCH-DEMO-001)

---

### 2. Student Perspective

**Login:**
- Navigate to http://localhost:3000
- Login with `student1` / `student123`

**Features to Test:**
- **Student Identity View**: View student DID and profile
- **Credential Portfolio**: View all credentials issued to the student
- **Credential Details**: View specific credential information including:
  - Credential hash
  - Issuer information
  - Issue date
  - Risk score (if available)

**Testing Steps:**
1. After login, navigate to "Student Identity" tab
2. Enter student ID: `STU-DEMO-001`
3. View the generated DID (format: `did:decaid:<uuid>`)
4. Navigate to "Student Credentials" section
5. View the credential details for STU-DEMO-001

**Expected Behavior:**
- Student should see their DID generated
- Student should see their credential with hash `262aaa92936d7e586e21956db0629c8b9e03ef3bda9319a136de7cd9dd31e24`
- Credential should show issuer as INST-DEMO-001
- Credential should show program details

---

### 3. Institution Perspective

**Login:**
- Navigate to http://localhost:3000
- Login with `institution1` / `institution123`

**Features to Test:**
- **Single Credential Issuance**: Issue individual credentials
- **Batch Credential Issuance**: Issue multiple credentials at once
- **Issuer Statistics**: View issuance statistics
- **Batch Management**: View and manage batch operations

**Testing Steps:**

**Single Credential Issuance:**
1. Navigate to "Institution Portal" tab
2. Enter issuer ID: `INST-DEMO-001`
3. Enter student ID: `STU-DEMO-006` (new student)
4. Enter credential data: `Bachelor of Pharmacy, Certificate Number PH-2024-DEMO-006, CGPA 8.3`
5. Enter certificate number: `PH-2024-DEMO-006`
6. Click "Issue Credential"
7. Note the returned credential hash

**Batch Credential Issuance:**
1. Navigate to "Batch Operations" section
2. Enter issuer ID: `INST-DEMO-001`
3. Create a batch with multiple students
4. Submit batch
5. View batch results

**Expected Behavior:**
- Institution should successfully issue credentials
- Each credential should receive a unique SHA-256 hash
- Credentials should be recorded on blockchain
- Risk scores should be calculated for each credential
- Batch operations should show success/failure counts

---

### 4. Employer Perspective

**Login:**
- Navigate to http://localhost:3000
- Login with `employer1` / `employer123`

**Features to Test:**
- **Credential Verification**: Verify credentials by hash
- **Risk Assessment**: View fraud-risk scores
- **Issuer Trust**: Check issuer trust rankings
- **Verification History**: View past verifications

**Testing Steps:**

**Verify Demo Credential:**
1. Navigate to "Employer Verify" tab
2. Enter credential hash: `262aaa92936d7e586e21956db0629c8b9e03ef3bda9319a136de7cd9dd31e24`
3. Click "Verify Credential"
4. View verification results including:
   - Valid/Invalid status
   - Student information
   - Issuer information
   - Risk score
   - Trust rank

**Verify Batch Credentials:**
1. Use credential hashes from batch operations
2. Verify multiple credentials
3. Compare risk scores and trust ranks

**Expected Behavior:**
- Employer should see credential as valid
- Verification should show student ID: STU-DEMO-001
- Verification should show issuer: INST-DEMO-001
- Risk score should be displayed (0-100 scale)
- Trust rank should be displayed (1-5 scale)
- Blockchain transaction hash should be visible

---

## Additional Testing Scenarios

### Fraud Detection Testing
The system includes fraud detection for duplicate identifiers. Test this by:

1. Issue a credential with certificate number: `CS-2024-DEMO-001`
2. Try to issue another credential with the same certificate number for a different student
3. The system should flag this as potential fraud

### Zero-Knowledge Proof Testing
1. Navigate to "ZKP Tools" tab (admin access)
2. Generate a commitment proof for a credential
3. Verify the commitment without revealing the actual credential data

### Document Upload Testing
1. Navigate to "Document Upload" section
2. Upload a test document (PDF, image, etc.)
3. Attach document to a credential
4. View document in credential details

---

## API Testing (Optional)

For direct API testing, use these endpoints:

### Auth Service (http://127.0.0.1:8001)
- `POST /register` - Register new user
- `POST /login` - Login and get JWT token
- `GET /me` - Get current user info
- `GET /health` - Health check

### Backend API (http://127.0.0.1:5000)
- `POST /api/credentials/issue` - Issue single credential
- `POST /api/institutions/batches` - Issue batch credentials
- `GET /api/credentials/verify/:hash` - Verify credential
- `GET /api/students/:studentId/profile` - Get student profile
- `GET /api/admin/*` - Admin endpoints

### AI Service (http://127.0.0.1:8000)
- `POST /score` - Get fraud-risk score
- `GET /health` - Health check

---

## Troubleshooting

### Common Issues

**Login fails:**
- Ensure auth-service is running on port 8001
- Check username and password are correct
- Clear browser cache and try again

**Credential issuance fails:**
- Ensure blockchain node is running on port 8545
- Ensure smart contract is deployed
- Check backend is running on port 5000
- Verify AI service is running on port 8000

**Verification fails:**
- Ensure credential hash is correct (64-character hex string)
- Check blockchain connection
- Verify credential was actually issued

**UI not loading:**
- Ensure frontend is running on port 3000
- Check browser console for errors
- Verify CORS settings

---

## Reset Demo Data

To reset demo data and start fresh:

1. Stop all services
2. Delete auth-service/auth.db
3. Restart services
4. Run create-users.ps1
5. Run create-credentials.ps1

---

## Next Steps

After completing this demo testing:

1. Test with your own custom data
2. Explore the admin dashboard features
3. Try the fraud detection scenarios
4. Experiment with batch operations
5. Test document upload functionality
6. Explore ZKP tools

For more detailed information, refer to:
- `README.md` - Project overview and setup
- `UserGuide.md` - Detailed user guide
- `TESTING.md` - Comprehensive testing documentation
- `DECAID-Handbook.md` - Developer handbook
