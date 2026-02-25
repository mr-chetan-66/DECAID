# DECAID Developer Handbook
## *Decentralized Academic Identity & Credential Risk Assessment System*

---

## **📖 Table of Contents**
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Quick Start Guide](#quick-start-guide)
4. [User Manuals](#user-manuals)
5. [Developer Guide](#developer-guide)
6. [Testing & Verification](#testing--verification)
7. [Troubleshooting](#troubleshooting)
8. [API Reference](#api-reference)

---

## **🎯 System Overview**

### **What is DECAID?**
DECAID is a **blockchain-based credential verification platform** that enables:
- **Institutions** to issue tamper-proof academic credentials
- **Students** to prove credentials without revealing personal data
- **Employers** to verify credentials with fraud detection and trust rankings

### **Core Technologies**
| Technology | Purpose | Implementation |
|------------|---------|----------------|
| **Blockchain** | Immutable credential storage | Ethereum smart contracts (Hardhat) |
| **Zero-Knowledge Proofs** | Privacy-preserving verification | SHA-256 commitment scheme |
| **AI Risk Engine** | Fraud detection | Isolation Forest algorithm |
| **Trust Ranking** | Institution reputation | Dynamic scoring system |
| **IPFS** | Document storage | Content-addressable storage |
| **PostgreSQL** | Data persistence | Optional (falls back to in-memory) |
| **React + Tailwind** | Frontend UI | Modern responsive interface |

---

## **🏗️ Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   AI Service    │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (Python)      │
│  Port: 3000     │    │  Port: 5000     │    │  Port: 8000     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   Blockchain    │    │      IPFS       │
│   (Optional)    │    │  (Hardhat)      │    │   (Optional)    │
│  Port: 5432     │    │  Port: 8545     │    │  Port: 5001     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## **🚀 Quick Start Guide**

### **Prerequisites**
```bash
# Required Software
- Node.js 18+
- Python 3.12+
- Docker (optional, for PostgreSQL)
- Git
```

### **Installation & Setup**
```bash
# 1. Clone Repository
git clone <repository-url>
cd FinalYearProject

# 2. Install Dependencies
npm install                    # Root dependencies
cd backend && npm install      # Backend dependencies
cd ../frontend && npm install  # Frontend dependencies
cd ../ai-service && pip install -r requirements.txt  # AI service

# 3. Environment Setup
cp backend/.env.example backend/.env
# Edit .env with your configuration

# 4. Start Services (see detailed startup below)
```

### **Service Startup**
```bash
# Terminal 1: PostgreSQL (optional but recommended)
cd e:\FinalYearProject
docker-compose up -d

# Terminal 2: Blockchain
cd e:\FinalYearProject\blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545

# Terminal 3: Deploy contract
cd e:\FinalYearProject\blockchain
npx hardhat run scripts/deploy.js --network localhost

# Terminal 4: AI Service
cd e:\FinalYearProject\ai-service
python -m uvicorn main:app --port 8000

# Terminal 5: Backend
cd e:\FinalYearProject\backend
npm run dev

# Terminal 6: Frontend
cd e:\FinalYearProject\frontend
npm run dev
```

### **Access Points**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **AI Service**: http://localhost:8000
- **Blockchain**: http://localhost:8545
- **PostgreSQL**: localhost:5432 (if using Docker)

---

## **👥 User Manuals**

### **🎓 Student User Guide**

#### **Purpose**
- Get your decentralized identity (DID)
- View all your credentials in one place
- Generate privacy-preserving proofs

#### **Step-by-Step Workflow**

**1. Get Your Digital Identity**
```
1. Open: http://localhost:3000
2. Click: "Student Identity" tab
3. Enter: Your Student ID (e.g., "S-2024-001")
4. Click: "Load Profile"
5. Result: Your DID and credential list
```

**2. Generate ZKP Proof**
```
1. Click: "ZKP Tools" tab
2. Fill in:
   - Credential Hash: [64-hex hash]
   - Student ID: Your ID
   - Nonce: Leave empty (auto-generated)
3. Click: "Generate ZKP Proof"
4. Result: Commitment (share) + Nonce (keep secret)
```

**3. Share Proof Privately**
- **Share**: Commitment hash with employers
- **Keep**: Nonce completely private
- **Result**: Employers can verify without seeing your data

---

### **🏫 Institution User Guide**

#### **Purpose**
- Issue tamper-proof credentials
- Upload batches efficiently
- Monitor institution reputation

#### **Step-by-Step Workflow**

**1. Issue Single Credential**
```
1. Click: "Institution Portal" tab
2. Fill in:
   - Issuer ID: Your institution code
   - Student ID: Student's unique ID
   - Credential Data: Degree/achievement details
3. Click: "Issue Credential"
4. Result: Credential hash (save this!)
```

**2. Batch Upload (Multiple Students)**
```
1. Scroll to: "Batch Upload" section
2. Fill in:
   - Batch Name: Descriptive name
   - Credentials: One per line format:
     "STUDENT-ID|Credential Data"
3. Example:
   "S-001|Bachelor of Computer Science"
   "S-002|Master of AI"
   "S-003|PhD in Data Science"
4. Click: "Upload Batch"
5. Result: Batch ID + credential count
```

**3. Monitor Statistics**
```
1. Scroll to: "Institution Statistics"
2. Enter: Your Issuer ID
3. Click: "View Stats"
4. Result: Dashboard showing:
   - Total credentials issued
   - Success rate percentage
   - Average risk score
   - Revocation count
   - Trust rank (1-5 stars)
```

---

### **🏢 Employer User Guide**

#### **Purpose**
- Verify job applicant credentials
- Assess fraud risk
- Check institution trustworthiness

#### **Step-by-Step Workflow**

**1. Traditional Verification**
```
1. Click: "Employer Verification" tab
2. Fill in:
   - Credential Hash: From applicant
   - Student ID: Applicant's ID
   - Issuer ID: Institution code
3. Click: "Verify"
4. Result: Visual dashboard with:
   - Blockchain status (Exists/Not Found)
   - Active/Revoked status
   - Trust rank (stars)
   - Risk score (0-100)
   - Duplicate detection
```

**2. Privacy-Preserving Verification (ZKP)**
```
1. Same as traditional verification
2. Additional: Add ZKP commitment from applicant
3. Result: Same verification + "ZKP Verified" badge
4. Benefit: Applicant's data stays private
```

**3. Interpreting Results**
- **Green badges**: Good (Exists, Active, Low Risk)
- **Red badges**: Bad (Not Found, Revoked, High Risk)
- **Amber badges**: Warning (Duplicate, Moderate Risk)
- **Stars**: Institution trust (1-5, higher = better)
- **Risk Score**: 0-100 (lower = safer)

---

## **💻 Developer Guide**

### **Project Structure**
```
FinalYearProject/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── index.js        # Main server file
│   │   ├── database.js     # PostgreSQL operations
│   │   └── contract/       # Smart contract artifacts
│   ├── .env.example        # Environment template
│   └── package.json
├── frontend/               # React application
│   ├── src/
│   │   ├── App.jsx         # Main React component
│   │   ├── api.js          # API helper functions
│   │   └── main.jsx        # Entry point
│   └── package.json
├── ai-service/             # Python ML service
│   ├── main.py            # FastAPI server
│   └── requirements.txt
├── blockchain/             # Ethereum contracts
│   ├── contracts/         # Solidity files
│   ├── scripts/           # Deployment scripts
│   └── hardhat.config.js
└── docker-compose.yml     # PostgreSQL setup
```

### **Key Components Explained**

#### **1. Backend (Node.js)**
**Purpose**: Central API orchestrator
**Key Files**:
- `src/index.js`: Main server with all endpoints
- `src/database.js`: PostgreSQL operations
- `src/contract/CredentialRegistry.json`: Smart contract ABI

**Core Endpoints**:
```javascript
POST /api/credentials/issue     # Issue single credential
POST /api/batch/upload          # Batch upload
GET  /api/verify/by-hash/:hash  # Verify credential
POST /api/zkp/generate          # Generate ZKP proof
POST /api/zkp/verify            # Verify ZKP proof
GET  /api/students/:id/profile  # Student profile
GET  /api/issuers/:id/stats     # Institution stats
```

#### **2. Frontend (React)**
**Purpose**: User interface for all three user types
**Key Components**:
- `App.jsx`: Main application with tab navigation
- `api.js`: API communication layer
- UI state management for each user type

**Tab Structure**:
```javascript
- Employer Verification: Credential verification dashboard
- Student Identity: DID and credential aggregation
- Institution Portal: Batch upload and statistics
- ZKP Tools: Privacy-preserving proof generation/verification
```

#### **3. AI Service (Python)**
**Purpose**: Fraud risk scoring
**Algorithm**: Isolation Forest (unsupervised anomaly detection)
**Input**: Credential metadata and patterns
**Output**: Risk score (0-100, higher = riskier)

#### **4. Blockchain (Ethereum)**
**Purpose**: Immutable credential storage
**Contract**: `CredentialRegistry.sol`
**Functions**:
```solidity
issue(bytes32 credentialHash)    # Store credential
revoke(bytes32 credentialHash)   # Revoke credential
verify(bytes32 credentialHash)   # Check existence
```

#### **5. Zero-Knowledge Proofs**
**Algorithm**: SHA-256 commitment scheme
**Process**:
1. **Generate**: `commitment = SHA-256(hash:studentId:nonce)`
2. **Verify**: Recompute and compare commitment
3. **Privacy**: Original data never revealed

---

## **🧪 Testing & Verification**

### **Automated Testing**

#### **1. Health Checks**
```bash
# Backend health
curl http://localhost:5000/health

# AI service health  
curl http://localhost:8000/health

# Frontend access
curl http://localhost:3000
```

#### **2. API Testing**
```bash
# Issue credential
curl -X POST http://localhost:5000/api/credentials/issue \
  -H "Content-Type: application/json" \
  -d '{"studentId":"S-TEST","issuerId":"UNI-TEST","credentialData":"Test Degree"}'

# Verify credential
curl "http://localhost:5000/api/verify/by-hash/HASH?studentId=S-TEST&issuerId=UNI-TEST"

# Generate ZKP
curl -X POST http://localhost:5000/api/zkp/generate \
  -H "Content-Type: application/json" \
  -d '{"credentialHash":"HASH","studentId":"S-TEST"}'
```

### **Manual Testing Workflow**

#### **Complete End-to-End Test**
```bash
# 1. Issue Credential (Institution)
- Use Institution Portal
- Issuer ID: UNI-TEST
- Student ID: S-TEST-001
- Credential Data: Bachelor of Computer Science
- Save returned hash

# 2. Generate ZKP (Student)
- Use ZKP Tools tab
- Hash: [from step 1]
- Student ID: S-TEST-001
- Save commitment and nonce

# 3. Verify Credential (Employer)
- Use Employer Verification tab
- Hash: [from step 1]
- Student ID: S-TEST-001
- Issuer ID: UNI-TEST
- Check visual results

# 4. Verify with ZKP (Employer)
- Same as step 3
- Add commitment from step 2
- Should show "ZKP Verified" badge

# 5. Check Student Profile
- Use Student Identity tab
- Student ID: S-TEST-001
- Should show credential and DID

# 6. Check Institution Stats
- Use Institution Portal
- Issuer ID: UNI-TEST
- Should show statistics
```

### **Expected Results Validation**

| Test | Expected Status | Expected Score |
|------|----------------|----------------|
| Valid credential | ✅ Exists, ✅ Active | Risk: 20-40 |
| Invalid hash | ✗ Not Found | Risk: N/A |
| Revoked credential | ⚠ Revoked | Risk: High (70+) |
| Duplicate submission | ⚠ Duplicate | Risk: Elevated |
| ZKP verification | ✅ ZKP Verified | Same as original |
| New institution | Trust Rank: 3-4/5 | Based on history |

---

## **🔧 Troubleshooting**

### **Common Issues & Solutions**

#### **1. "Failed to fetch" Error**
**Cause**: Wrong backend URL or service not running
**Solution**:
```bash
# Check backend is running
curl http://localhost:5000/health

# Update frontend URL to correct port
# Usually 5000, not 5002
```

#### **2. "Nonce too low" Blockchain Error**
**Cause**: Hardhat restarted but backend using old nonce
**Solution**:
```bash
# Restart Hardhat
cd blockchain && npx hardhat node --port 8545

# Redeploy contract
npx hardhat run scripts/deploy.js --network localhost

# Restart backend
cd backend && npm run dev
```

#### **3. "No risk score"**
**Cause**: AI service not running or unreachable
**Solution**:
```bash
# Check AI service
curl http://localhost:8000/health

# Restart AI service
cd ai-service && python -m uvicorn main:app --port 8000
```

#### **4. PostgreSQL Connection Failed**
**Cause**: Database not running or wrong credentials
**Solution**:
```bash
# Start PostgreSQL
docker-compose up -d

# Or continue without DB (in-memory mode)
# Backend will show: "Running with in-memory storage"
```

#### **5. ZKP Verification Fails**
**Cause**: Wrong commitment/nonce combination
**Solution**:
- Ensure commitment and nonce match exactly
- Copy-paste without extra spaces
- Regenerate proof if needed

### **Debug Mode**

#### **Enable Detailed Logging**
```bash
# Backend logs
cd backend && DEBUG=* npm run dev

# AI service logs
cd ai-service && python -m uvicorn main:app --log-level debug

# Frontend logs
# Open browser DevTools (F12) → Console tab
```

#### **Database Inspection**
```bash
# Connect to PostgreSQL
docker exec -it decaid-postgres psql -U decaid -d decaid

# View tables
\dt
SELECT * FROM issuer_stats;
SELECT * FROM batches;
SELECT * FROM student_dids;
```

---

## **📚 API Reference**

### **Authentication**
Currently **no authentication** (development mode). Production should add:
- JWT tokens for institutions
- API rate limiting
- HTTPS enforcement

### **Response Format**
```javascript
// Success Response
{
  "ok": true,
  "data": { ... },
  "credentialHash": "0x...",
  "blockchain": { ... },
  "risk": { "riskScore": 25, "model": "isolation_forest" },
  "trustRank": 4,
  "zkp": { "status": "verified" }
}

// Error Response
{
  "ok": false,
  "error": "Invalid credential hash format"
}
```

### **Key Endpoints**

#### **Credential Management**
```http
POST /api/credentials/issue
{
  "studentId": "S-001",
  "issuerId": "UNI-001", 
  "credentialData": "Bachelor of Science"
}
→ { "credentialHash": "0x...", "transactionHash": "0x..." }

POST /api/credentials/revoke
{
  "credentialHash": "0x...",
  "issuerId": "UNI-001"
}
→ { "revoked": true, "revokedAt": 1234567890 }
```

#### **Verification**
```http
GET /api/verify/by-hash/{hash}?studentId=S-001&issuerId=UNI-001
→ {
  "blockchain": { "exists": true, "revoked": false },
  "risk": { "riskScore": 25, "model": "isolation_forest" },
  "trustRank": 4,
  "duplicateDetected": false,
  "zkp": { "status": "not_provided" }
}
```

#### **Zero-Knowledge Proofs**
```http
POST /api/zkp/generate
{
  "credentialHash": "0x...",
  "studentId": "S-001",
  "nonce": "optional-custom-nonce"
}
→ {
  "commitment": "0x...",
  "nonce": "generated-or-provided-nonce",
  "algorithm": "SHA-256-commitment-v1"
}

POST /api/zkp/verify
{
  "credentialHash": "0x...",
  "studentId": "S-001",
  "nonce": "secret-nonce",
  "commitment": "public-commitment"
}
→ { "valid": true, "algorithm": "SHA-256-commitment-v1" }
```

#### **Batch Operations**
```http
POST /api/batch/upload
{
  "issuerId": "UNI-001",
  "batchName": "Graduates 2024",
  "credentials": [
    { "studentId": "S-001", "credentialData": "Bachelor" },
    { "studentId": "S-002", "credentialData": "Master" }
  ]
}
→ { "batchId": "batch-123", "credentials": [...] }
```

---

## **🚀 Production Deployment**

### **Environment Variables**
```bash
# Backend (.env)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=decaid
DB_USER=decaid
DB_PASSWORD=secure_password
CHAIN_RPC_URL=http://localhost:8545
ISSUER_PRIVATE_KEY=0x...  # Institution's private key
AI_SERVICE_URL=http://localhost:8000
IPFS_API_URL=http://localhost:5001
```

### **Security Considerations**
1. **Authentication**: Add JWT/OAuth for institutions
2. **Rate Limiting**: Prevent API abuse
3. **HTTPS**: Encrypt all communications
4. **Input Validation**: Sanitize all inputs
5. **Private Keys**: Secure key management
6. **Database**: Encrypt sensitive data

### **Scaling Recommendations**
1. **Load Balancer**: Multiple backend instances
2. **Database**: Connection pooling, read replicas
3. **Blockchain**: Layer 2 solutions for gas efficiency
4. **IPFS**: Pinning service for persistent storage
5. **Monitoring**: Health checks, metrics, alerts

---

## **🎯 Future Enhancements**

### **Planned Features**
1. **Multi-chain support**: Polygon, Arbitrum
2. **Advanced ZKPs**: zk-SNARKs, zk-STARKs
3. **Mobile App**: React Native implementation
4. **OAuth Integration**: Google, Microsoft SSO
5. **Smart Contracts**: More sophisticated logic
6. **AI Models**: Deep learning for fraud detection

### **Integration Opportunities**
1. **University Systems**: SIS integration
2. **HR Platforms**: ATS integration
3. **Government Services**: Digital identity programs
4. **Professional Bodies**: License verification
5. **EdTech Platforms**: Credential automation

---

## **📞 Support & Contributing**

### **Getting Help**
1. **Documentation**: This handbook
2. **Code Comments**: Inline documentation
3. **Issue Tracking**: GitHub issues
4. **Community**: Developer discussions

### **Contributing Guidelines**
1. **Code Style**: Follow existing patterns
2. **Testing**: Add tests for new features
3. **Documentation**: Update this handbook
4. **Security**: Report vulnerabilities privately

---

## **🏆 Success Metrics**

### **Technical Metrics**
- **Uptime**: 99.9% availability
- **Response Time**: <200ms API calls
- **Success Rate**: >99% verification accuracy
- **Security**: Zero data breaches

### **Business Metrics**
- **Adoption**: Number of institutions/students
- **Verification**: Daily credential checks
- **Trust**: Average institution ratings
- **Privacy**: ZKP usage percentage

---

## **🎉 Quick Demo Script**

### **For New Users (Copy-Paste Ready)**

**Step 1: Issue Credential (Institution)**
```
Tab: Institution Portal
Issuer ID: UNIVERSITY-2024
Student ID: ALEX-2024-001
Credential Data: Bachelor of Computer Science
Click: Issue Credential
Save the returned hash
```

**Step 2: Generate ZKP (Student)**
```
Tab: ZKP Tools
Credential Hash: [paste hash from Step 1]
Student ID: ALEX-2024-001
Nonce: Leave empty
Click: Generate ZKP Proof
Copy the commitment (share this)
```

**Step 3: Verify Credential (Employer)**
```
Tab: Employer Verification
Credential Hash: [same hash from Step 1]
Student ID: ALEX-2024-001
Issuer ID: UNIVERSITY-2024
Click: Verify
See: ✅ Exists, ✅ Active, ★★★★☆, 🟢 Risk Score
```

**Step 4: Verify with ZKP (Privacy Mode)**
```
Same as Step 3
Add commitment from Step 2
Click: Verify
See: Same results + ✅ ZKP Verified badge
```

**Step 5: Check Student Profile**
```
Tab: Student Identity
Student ID: ALEX-2024-001
Click: Load Profile
See: DID + all credentials
```

**Step 6: Check Institution Stats**
```
Tab: Institution Portal
Issuer ID: UNIVERSITY-2024
Click: View Stats
See: Total issued, success rate, trust rank
```

---

**🎊 Congratulations! You now have a complete understanding of DECAID.**

*This handbook covers everything from basic usage to advanced development. Share it with your team and start building the future of credential verification!*

---

*Last Updated: February 2026*
*Version: 1.0*
