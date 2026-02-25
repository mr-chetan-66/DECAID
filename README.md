# DECAID: Decentralized Academic Identity & Credential Risk Assessment System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Python Version](https://img.shields.io/badge/python-3.12+-blue)](https://www.python.org/)
[![Blockchain](https://img.shields.io/badge/blockchain-ethereum-blue)](https://ethereum.org/)

🎓 **Revolutionizing academic credential verification with blockchain, AI, and zero-knowledge proofs**

## 🌟 Features

### **🔐 Privacy-Preserving Verification**
- **Zero-Knowledge Proofs**: Verify credentials without revealing personal data
- **GDPR Compliant**: Privacy-first design
- **Selective Disclosure**: Students control what they share

### **⛓️ Immutable Blockchain Storage**
- **Ethereum Smart Contracts**: Tamper-proof credential records
- **Hardhat Development**: Local testing environment
- **Gas Optimized**: Efficient contract operations

### **🤖 AI-Powered Fraud Detection**
- **Isolation Forest Algorithm**: Advanced anomaly detection
- **Risk Scoring**: 0-100 fraud risk assessment
- **Pattern Recognition**: Identifies suspicious credential patterns

### **⭐ Trust Ranking System**
- **Institution Reputation**: 1-5 star rating system
- **Historical Tracking**: Success rates and revocations
- **Dynamic Scoring**: Updates based on performance

### **🎯 Multi-User Platform**
- **Students**: Get DIDs, manage credentials, generate ZKPs
- **Institutions**: Issue credentials, batch upload, track statistics
- **Employers**: Verify credentials, assess risk, check trust

### **🗄️ Modern Tech Stack**
- **Frontend**: React + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with in-memory fallback
- **Storage**: IPFS integration
- **AI**: Python + FastAPI

## 🚀 Quick Start

### Prerequisites
```bash
- Node.js 18+
- Python 3.12+
- Docker (optional)
- Git
```

### Installation
```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/DECAID.git
cd DECAID

# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../ai-service && pip install -r requirements.txt

# Setup environment
cp backend/.env.example backend/.env
# Edit .env with your configuration
```

### Start Services
```bash
# Terminal 1: PostgreSQL (optional)
docker-compose up -d

# Terminal 2: Blockchain
cd blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545

# Terminal 3: Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Terminal 4: AI Service
cd ai-service
python -m uvicorn main:app --port 8000

# Terminal 5: Backend
cd backend
npm run dev

# Terminal 6: Frontend
cd frontend
npm run dev
```

### Access Points
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **AI Service**: http://localhost:8000
- **Blockchain**: http://localhost:8545

## 📖 Documentation

### **📘 Complete Handbook**
👉 [**DECAID-Handbook.md**](./DECAID-Handbook.md) - Comprehensive 50+ page guide covering:
- System overview and architecture
- User manuals for all three user types
- Developer guide and API reference
- Testing procedures and troubleshooting
- Production deployment guide

### **Quick Demo**
```bash
# 1. Issue Credential (Institution)
Tab: Institution Portal
Issuer ID: UNIVERSITY-2024
Student ID: ALEX-2024-001
Credential Data: Bachelor of Computer Science

# 2. Generate ZKP (Student)
Tab: ZKP Tools
Credential Hash: [from step 1]
Student ID: ALEX-2024-001

# 3. Verify Credential (Employer)
Tab: Employer Verification
Hash: [from step 1]
Student ID: ALEX-2024-001
Issuer ID: UNIVERSITY-2024
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   AI Service    │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (Python)      │
│  Port: 3000     │    │  Port: 5000     │    │  Port: 8000     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   Blockchain    │    │      IPFS       │
│   (Optional)    │    │  (Hardhat)      │    │   (Optional)    │
│  Port: 5432     │    │  Port: 8545     │    │  Port: 5001     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎯 Use Cases

### **University Admissions**
- Students prove degrees without revealing transcripts
- Admissions offices verify credentials with trust scores
- Privacy-preserving document verification

### **Job Applications**
- Employers verify applicant credentials instantly
- AI-powered fraud detection reduces hiring risks
- ZKP enables privacy-first verification

### **Professional Licensing**
- Medical boards verify licenses efficiently
- Government agencies check credential authenticity
- Reduced fraud in regulated industries

### **Immigration Verification**
- Immigration officers verify foreign credentials
- Trust ranking speeds up visa processing
- Privacy-compliant cross-border verification

## 🔧 Technology Stack

| Component | Technology | Purpose |
|-----------|-------------|---------|
| **Frontend** | React + Tailwind | Modern responsive UI |
| **Backend** | Node.js + Express | API orchestration |
| **Blockchain** | Ethereum + Hardhat | Immutable storage |
| **AI/ML** | Python + FastAPI | Fraud detection |
| **Database** | PostgreSQL | Data persistence |
| **Storage** | IPFS | Document storage |
| **ZKP** | SHA-256 commitments | Privacy verification |

## 📊 Key Features

### **🔐 Zero-Knowledge Proofs**
```
Generate: commitment = SHA-256(hash:studentId:nonce)
Verify: Recompute and compare commitment
Privacy: Original data never revealed
```

### **🤖 AI Risk Scoring**
- **Algorithm**: Isolation Forest
- **Input**: Credential metadata and patterns
- **Output**: Risk score (0-100, higher = riskier)
- **Model**: Continuously learning

### **⭐ Trust Ranking**
- **Factors**: Success rate, revocations, risk scores
- **Scale**: 1-5 stars (5 = highest trust)
- **Dynamic**: Updates with each credential
- **Transparent**: All signals visible

## 🧪 Testing

### **Health Checks**
```bash
curl http://localhost:5000/health    # Backend
curl http://localhost:8000/health    # AI Service
curl http://localhost:3000           # Frontend
```

### **API Testing**
```bash
# Issue credential
curl -X POST http://localhost:5000/api/credentials/issue \
  -H "Content-Type: application/json" \
  -d '{"studentId":"S-TEST","issuerId":"UNI-TEST","credentialData":"Test Degree"}'

# Verify credential
curl "http://localhost:5000/api/verify/by-hash/HASH?studentId=S-TEST&issuerId=UNI-TEST"
```

## 🚀 Production Deployment

### **Environment Variables**
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=decaid
DB_USER=decaid
DB_PASSWORD=secure_password
CHAIN_RPC_URL=http://localhost:8545
ISSUER_PRIVATE_KEY=0x...
AI_SERVICE_URL=http://localhost:8000
IPFS_API_URL=http://localhost:5001
```

### **Security Considerations**
- JWT authentication for institutions
- API rate limiting
- HTTPS enforcement
- Input validation and sanitization
- Secure private key management
- Database encryption

## 📈 Future Roadmap

### **Phase 1: Enhanced Privacy**
- [ ] zk-SNARKs implementation
- [ ] Mobile app (React Native)
- [ ] OAuth integration (Google, Microsoft)

### **Phase 2: Scaling**
- [ ] Multi-chain support (Polygon, Arbitrum)
- [ ] Layer 2 solutions
- [ ] Advanced AI models (Deep Learning)

### **Phase 3: Ecosystem**
- [ ] University SIS integration
- [ ] HR platform APIs
- [ ] Government service integrations

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### **Development Guidelines**
- Follow existing code patterns
- Add tests for new features
- Update documentation
- Ensure all tests pass
- Follow semantic versioning

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- 📖 **Handbook**: [DECAID-Handbook.md](./DECAID-Handbook.md)
- 🐛 **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/DECAID/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/DECAID/discussions)
- 📧 **Email**: [your-email@example.com]

## 🏆 Acknowledgments

- **Ethereum Foundation** - Blockchain infrastructure
- **Hardhat Team** - Development framework
- **FastAPI** - Python web framework
- **React Team** - Frontend library
- **OpenAI** - AI/ML research insights

---

**🎓 Revolutionizing credential verification with privacy, trust, and technology**

*Built with ❤️ for the future of academic credentials*
