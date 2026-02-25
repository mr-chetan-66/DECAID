# Contributing to DECAID

Thank you for your interest in contributing to DECAID! This document provides guidelines for contributors.

## 🤝 How to Contribute

### 🍴 Prerequisites
- Familiarity with the project (read [UserGuide.md](../UserGuide.md))
- Node.js 18+ and Python 3.12+ development environment
- Git and GitHub account
- Understanding of blockchain concepts (helpful but not required)

### 🌟 Contribution Areas

#### 🎯 Features
- New functionality for any user type (Student, Institution, Employer)
- Enhanced UI/UX improvements
- Additional verification methods
- Performance optimizations

#### 🐛 Bug Fixes
- Issues found in existing functionality
- Edge cases and error handling
- Security vulnerabilities (see security template below)

#### 📚 Documentation
- Improvements to UserGuide.md or DECAID-Handbook.md
- API documentation updates
- Code comments and inline documentation
- Tutorial or example content

#### 🧪 Testing
- Unit tests for backend functions
- Integration tests for API endpoints
- Frontend component tests
- AI model validation tests

### 🔄 Development Workflow

#### 1. Setup Development Environment
```bash
# Clone repository
git clone https://github.com/mr-chetan-66/DECAID.git
cd DECAID

# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../ai-service && pip install -r requirements.txt

# Start services locally
# Follow UserGuide.md Quick Start section
```

#### 2. Create Feature Branch
```bash
# Create descriptive branch name
git checkout -b feature/zkp-enhancement
git checkout -b fix/blockchain-connection
git checkout -b docs/api-reference
```

#### 3. Make Changes
- Follow existing code style and patterns
- Add tests for new functionality
- Update relevant documentation
- Ensure all services still work

#### 4. Test Your Changes
```bash
# Run automated tests
npm test  # (when tests are implemented)

# Manual testing
# Test all user workflows
# Verify API endpoints work
# Check UI functionality
```

#### 5. Submit Pull Request
```bash
# Commit changes
git add .
git commit -m "feat: Add ZKP enhancement for privacy verification

- Implement zk-SNARK support
- Update frontend with new ZKP UI
- Add comprehensive tests
- Update documentation"

# Push to your fork
git push origin feature/zkp-enhancement

# Create pull request on GitHub
```

### 📋 Pull Request Guidelines

#### PR Title Format
```
type(scope): description

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation change
- style: Code style (no functional change)
- refactor: Code refactoring
- test: Adding or updating tests
- chore: Maintenance task

Scope:
- frontend: React/UI changes
- backend: Node.js API changes
- ai-service: Python ML changes
- blockchain: Smart contract changes
- docs: Documentation changes
- infra: Infrastructure changes
```

#### PR Description Template
```markdown
## 📝 Description
Brief description of what this PR changes and why.

## 🧪 Changes
- [ ] Bug fix for XYZ issue
- [ ] New feature for ABC functionality
- [ ] Documentation updates
- [ ] Test coverage improvements

## 🧪 Testing
- [ ] Manual testing completed
- [ ] All services start successfully
- [ ] Existing functionality still works
- [ ] New functionality tested

## 📷 Screenshots (if applicable)
Add screenshots for UI changes.

## 🔗 Related Issues
Closes #123
Related to #456
```

### 🎨 Code Style Guidelines

#### JavaScript/Node.js
```javascript
// Use async/await for async operations
const result = await apiCall();

// Use descriptive variable names
const credentialHash = generateHash(credentialData);

// Error handling
try {
  const result = await verifyCredential(hash);
  return result;
} catch (error) {
  console.error('Verification failed:', error);
  throw new Error('Credential verification failed');
}
```

#### Python
```python
# Use type hints
def calculate_risk_score(features: List[Feature]) -> RiskScore:
    """Calculate fraud risk score for credential."""
    pass

# Use descriptive function names
def extract_features(credential: Credential) -> Features:
    """Extract ML features from credential data."""
    pass

# Error handling
try:
    score = model.predict(features)
    return RiskScore(score=score)
except Exception as e:
    logger.error(f"Risk calculation failed: {e}")
    raise RiskCalculationError(f"Failed to calculate risk: {e}")
```

#### React/JSX
```jsx
// Use functional components with hooks
const CredentialVerification = ({ hash, onVerify }) => {
  const [loading, setLoading] = useState(false);
  
  const handleVerify = async () => {
    setLoading(true);
    try {
      const result = await verifyCredential(hash);
      onVerify(result);
    } catch (error) {
      console.error('Verification failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="credential-verification">
      {/* Component JSX */}
    </div>
  );
};
```

### 🧪 Testing Guidelines

#### Unit Tests
- Test individual functions in isolation
- Mock external dependencies
- Test both success and failure cases
- Aim for >80% code coverage

#### Integration Tests
- Test API endpoints with real database
- Test blockchain interactions
- Test AI service communication
- Verify end-to-end workflows

#### Frontend Tests
- Test component rendering
- Test user interactions
- Test form submissions
- Test error handling

### 📖 Documentation Standards

#### Code Comments
```javascript
/**
 * Verifies a credential hash on the blockchain
 * @param {string} hash - The credential hash to verify
 * @param {string} studentId - Student identifier
 * @returns {Promise<VerificationResult>} Verification result with risk score
 * @throws {Error} When verification fails
 */
async function verifyCredential(hash, studentId) {
  // Implementation
}
```

#### API Documentation
- Document all endpoints in API reference
- Include request/response examples
- Specify error codes and meanings
- Provide curl examples

### 🔒 Security Guidelines

#### What to Avoid
- Never commit API keys, passwords, or secrets
- Don't log sensitive user data
- Validate all user inputs
- Use parameterized queries for database

#### Security Best Practices
- Sanitize all user inputs
- Use HTTPS in production
- Implement rate limiting
- Follow OWASP guidelines

### 🚀 Release Process

#### Version Bumping
- Update version numbers in package.json files
- Update CHANGELOG.md
- Tag releases with semantic versioning

#### Release Checklist
- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version numbers updated
- [ ] Release tagged on GitHub

## 🤝 Community Guidelines

### Code of Conduct
- Be respectful and inclusive
- Provide constructive feedback
- Help newcomers and answer questions
- Focus on what is best for the project

### Getting Help
- Create an issue for questions
- Join GitHub Discussions
- Read existing documentation first
- Check if question was answered before

## 🏆 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Annual project summary

---

Thank you for contributing to DECAID! 🎓

*Every contribution helps make academic credential verification more secure, private, and trustworthy.*
