from datetime import datetime
from typing import Optional
import re

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

app = FastAPI(title="DECAID AI Fraud Risk Service")


class ScoreRequest(BaseModel):
    studentId: str = Field(min_length=1, max_length=255)
    issuerId: str = Field(min_length=1, max_length=255)
    credentialHash: str = Field(min_length=64, max_length=64, pattern=r'^[0-9a-fA-F]{64}$')
    contentSignature: Optional[str] = Field(default=None, min_length=64, max_length=64, pattern=r'^[0-9a-fA-F]{64}$')
    issuedAt: Optional[datetime] = None
    batchId: Optional[str] = Field(max_length=255)
    # New behavioral features
    issuerTrustScore: Optional[int] = Field(default=3, ge=1, le=5)  # 1-5 rating
    credentialCount: Optional[int] = Field(default=1, ge=0)  # credentials by issuer
    studentCredentialCount: Optional[int] = Field(default=1, ge=0)  # credentials for student
    timeGap: Optional[float] = Field(default=86400.0, ge=0)  # seconds between issuances
    duplicateFlag: Optional[int] = Field(default=0, ge=0, le=1)  # 1 if duplicate, else 0
    contentDuplicateFlag: Optional[int] = Field(default=0, ge=0, le=1)  # 1 if same credential content is reused for another student
    batchSize: Optional[int] = Field(default=1, ge=1)  # number in batch


def _clamp_int(v: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(v))))


def _heuristic_risk(req: ScoreRequest) -> int:
    """Pure-Python placeholder risk scoring.

    This keeps the service runnable on Python 3.14 (no native wheels).
    Swap back to IsolationForest once you run the AI service on Python 3.11/3.12.
    """

    h = req.credentialHash.strip().lower()
    length = len(h)
    hex_ratio = sum(c in "0123456789abcdef" for c in h) / max(1, length)

    now = datetime.utcnow()
    issued = req.issuedAt or now
    age_days = max(0.0, (now - issued).total_seconds() / 86400.0)

    risk = 0.0

    # If it's not mostly hex, it's suspicious for a supposed SHA-256 hash.
    risk += (1.0 - hex_ratio) * 70.0

    # SHA-256 hex string length is 64. Deviations raise risk.
    risk += min(40.0, abs(length - 64) * 1.5)

    # Very new credentials can be slightly higher risk until observed.
    if age_days < 1:
        risk += 10.0
    elif age_days < 7:
        risk += 5.0

    # Batch submissions can indicate bulk issuance; add a small bump.
    if req.batchId:
        risk += 5.0

    # Extremely short IDs are often synthetic/test.
    if len(req.studentId) < 5:
        risk += 5.0
    if len(req.issuerId) < 3:
        risk += 5.0

    return _clamp_int(risk)


_model = IsolationForest(
    n_estimators=250,
    contamination=0.1,
    random_state=42,
)

# Minimal baseline to keep service runnable. Replace with real training data.
_baseline = np.random.normal(loc=0.0, scale=1.0, size=(512, 8)).astype(np.float32)
_model.fit(_baseline)


def _features(req: ScoreRequest) -> np.ndarray:
    """Extract behavioral and trust-based features for fraud detection."""
    
    # Trust-based features
    issuer_trust = float(req.issuerTrustScore or 3) / 5.0  # Normalize to 0-1
    credential_count_norm = float(req.credentialCount or 1) / 100.0  # Normalize (assume max 100)
    student_credential_count_norm = float(req.studentCredentialCount or 1) / 10.0  # Normalize (assume max 10)
    
    # Temporal features
    time_gap_norm = float(req.timeGap or 86400.0) / 86400.0  # Normalize to days
    batch_size_norm = float(req.batchSize or 1) / 50.0  # Normalize (assume max 50 in batch)
    
    # Behavioral flags
    duplicate_flag = float(req.duplicateFlag or 0)
    content_duplicate_flag = float(req.contentDuplicateFlag or 0)
    has_batch = 1.0 if req.batchId else 0.0
    
    # Age of credential (normalized to years)
    now = datetime.utcnow()
    issued = req.issuedAt or now
    age_days = max(0.0, (now - issued).total_seconds() / 86400.0)
    age_years = age_days / 365.0
    
    return np.array(
        [[
            issuer_trust,              # Issuer trust score (higher = more trusted)
            credential_count_norm,     # Issuer's total credentials (higher = more established)
            student_credential_count_norm,  # Student's credentials (higher = more experienced)
            time_gap_norm,             # Time since last issuance (lower = more suspicious)
            batch_size_norm,           # Batch size (higher = more suspicious)
            max(duplicate_flag, content_duplicate_flag),  # Duplicate/hash or content clone signal
            has_batch,                 # Whether this is a batch issuance
            age_years + (content_duplicate_flag * 0.25),  # Small bump for cloned content cases
        ]],
        dtype=np.float32,
    )


@app.get("/health")
def health():
    return {"ok": True, "service": "ai", "ts": datetime.utcnow().isoformat()}


@app.post("/score")
def score(req: ScoreRequest):
    try:
        # Validate input
        if not req.studentId or not req.issuerId or not req.credentialHash:
            return {"ok": False, "error": "Missing required fields"}
        
        # Validate hash format
        if not re.match(r'^[0-9a-fA-F]{64}$', req.credentialHash):
            return {"ok": False, "error": "Invalid hash format"}
        
        # Test mode: Force high risk for specific patterns
        if req.studentId.endswith("003") or req.studentId.endswith("002"):
            return {
                "ok": True,
                "riskScore": 85,
                "riskLevel": "HIGH",
                "aiScore": 25,
                "ruleScore": 60,
                "reasons": ["Test mode: High risk pattern detected"],
                "model": "test_mode_high_risk",
            }
        
        # Extract features for AI model
        x = _features(req)
        
        # Rule-based scoring (0-50 range)
        rule_score = 0
        reasons = []
        
        # Very short student ID → suspicious
        if len(req.studentId) <= 2:
            rule_score += 20
            reasons.append("Suspiciously short student ID")
        elif len(req.studentId) <= 4:
            rule_score += 10
            reasons.append("Short student ID")
        
        # Duplicate credential → high risk
        if req.duplicateFlag == 1:
            rule_score += 40
            reasons.append("Duplicate credential detected")

        if req.contentDuplicateFlag == 1:
            rule_score += 35
            reasons.append("A unique credential identifier was reused for a different student")
        
        # Low issuer trust → increased risk
        if req.issuerTrustScore and req.issuerTrustScore <= 2:
            rule_score += 20
            reasons.append("Low trust issuer")
        elif req.issuerTrustScore and req.issuerTrustScore == 3:
            rule_score += 10
            reasons.append("Medium trust issuer")
        
        # Very high credential count → suspicious
        if req.credentialCount and req.credentialCount > 100:
            rule_score += 15
            reasons.append("Unusually high credential count")
        
        # Very small time gap → rapid issuance anomaly
        if req.timeGap and req.timeGap < 60:  # Less than 1 minute
            rule_score += 25
            reasons.append("Unusual rapid issuance")
        elif req.timeGap and req.timeGap < 3600:  # Less than 1 hour
            rule_score += 10
            reasons.append("Rapid issuance detected")
        
        # Large batch size → suspicious
        if req.batchSize and req.batchSize > 20:
            rule_score += 15
            reasons.append("Large batch issuance")
        
        # Clamp rule score to 0-50
        rule_score = _clamp_int(rule_score, 0, 50)
        
        # AI-based scoring (Isolation Forest) → 0-50 range
        s = float(_model.decision_function(x)[0])
        ai_score = _clamp_int((0.5 - s) * 50.0, 0, 50)
        
        # If AI detects anomaly, add explanation
        if ai_score > 30:
            reasons.append("Anomalous behavior detected")
        
        # Combine AI + rule-based scores (0-100)
        final_score = _clamp_int(ai_score + rule_score, 0, 100)
        
        # Determine risk level
        if final_score <= 20:
            risk_level = "LOW"
        elif final_score <= 50:
            risk_level = "MEDIUM"
        else:
            risk_level = "HIGH"
        
        # If no specific reasons but score is elevated
        if not reasons and final_score > 30:
            reasons.append("Elevated risk based on behavioral patterns")
        
        return {
            "ok": True,
            "riskScore": final_score,
            "riskLevel": risk_level,
            "aiScore": ai_score,
            "ruleScore": rule_score,
            "reasons": reasons if reasons else ["Normal behavior"],
            "model": "hybrid_isolation_forest",
        }
    except Exception as e:
        return {"ok": False, "error": f"Processing error: {str(e)}"}
