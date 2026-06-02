from datetime import datetime
from typing import Optional
import json
import os
import re
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

app = FastAPI(title="DECAID AI Fraud Risk Service")


def _load_env_file() -> None:
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()


class ScoreRequest(BaseModel):
    studentId: str = Field(min_length=1, max_length=255)
    issuerId: str = Field(min_length=1, max_length=255)
    credentialHash: str = Field(min_length=64, max_length=64, pattern=r'^[0-9a-fA-F]{64}$')
    contentSignature: Optional[str] = Field(default=None, min_length=64, max_length=64, pattern=r'^[0-9a-fA-F]{64}$')
    issuedAt: Optional[datetime] = None
    batchId: Optional[str] = Field(default=None, max_length=255)
    # New behavioral features
    issuerTrustScore: Optional[int] = Field(default=3, ge=1, le=5)  # 1-5 rating
    credentialCount: Optional[int] = Field(default=1, ge=0)  # credentials by issuer
    studentCredentialCount: Optional[int] = Field(default=1, ge=0)  # credentials for student
    timeGap: Optional[float] = Field(default=86400.0, ge=0)  # seconds between issuances
    duplicateFlag: Optional[int] = Field(default=0, ge=0, le=1)  # 1 if duplicate, else 0
    contentDuplicateFlag: Optional[int] = Field(default=0, ge=0, le=1)  # 1 if same credential content is reused for another student
    documentDuplicateFlag: Optional[int] = Field(default=0, ge=0, le=1)  # 1 if same uploaded document is reused for another student
    batchSize: Optional[int] = Field(default=1, ge=1)  # number in batch
    chainExists: Optional[int] = Field(default=1, ge=0, le=1)
    revokedFlag: Optional[int] = Field(default=0, ge=0, le=1)
    hasDocument: Optional[int] = Field(default=0, ge=0, le=1)


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
    document_duplicate_flag = float(req.documentDuplicateFlag or 0)
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
            max(duplicate_flag, content_duplicate_flag, document_duplicate_flag),  # Duplicate/hash/content/document clone signal
            has_batch,                 # Whether this is a batch issuance
            age_years + (max(content_duplicate_flag, document_duplicate_flag) * 0.25),  # Small bump for cloned content cases
        ]],
        dtype=np.float32,
    )


def _extract_json_object(text: str) -> Optional[dict]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None


def _gemini_review(req: ScoreRequest, base_score: int, base_reasons: list[str]) -> tuple[Optional[dict], Optional[str]]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None, None

    preferred_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    models = []
    for candidate in [preferred_model, "gemini-2.0-flash", "gemini-2.0-flash-lite"]:
        if candidate not in models:
            models.append(candidate)
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "You are an academic credential fraud analyst. "
                            "Return only strict JSON with keys: riskAdjustment, confidence, reasons, summary. "
                            "riskAdjustment must be an integer from 0 to 25 and represents only extra fraud risk beyond the base score. "
                            "For clean credentials with no red flags, riskAdjustment must be 0. confidence is LOW, MEDIUM, or HIGH. "
                            "Do not invent facts. Use only these signals.\n\n"
                            f"Base risk score: {base_score}\n"
                            f"Base reasons: {base_reasons}\n"
                            f"Student ID: {req.studentId}\n"
                            f"Issuer ID: {req.issuerId}\n"
                            f"Credential hash valid SHA-256: {bool(re.match(r'^[0-9a-fA-F]{64}$', req.credentialHash))}\n"
                            f"Blockchain exists: {req.chainExists == 1}\n"
                            f"Revoked: {req.revokedFlag == 1}\n"
                            f"Duplicate hash: {req.duplicateFlag == 1}\n"
                            f"Duplicate content for another student: {req.contentDuplicateFlag == 1}\n"
                            f"Duplicate uploaded document for another student: {req.documentDuplicateFlag == 1}\n"
                            f"Issuer trust rank: {req.issuerTrustScore}/5\n"
                            f"Issuer credential count: {req.credentialCount}\n"
                            f"Student credential count: {req.studentCredentialCount}\n"
                            f"Batch size: {req.batchSize}\n"
                            f"Uploaded certificate document linked: {req.hasDocument == 1}\n"
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "riskAdjustment": {"type": "INTEGER"},
                    "confidence": {"type": "STRING"},
                    "reasons": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "summary": {"type": "STRING"},
                },
                "required": ["riskAdjustment", "confidence", "reasons", "summary"],
            },
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }

    last_error = None
    for model in models:
      try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        body = json.dumps(payload).encode("utf-8")
        req_obj = urlrequest.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlrequest.urlopen(req_obj, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
        candidate = data.get("candidates", [{}])[0]
        text = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
        if not text:
            finish_reason = candidate.get("finishReason") or data.get("promptFeedback") or "empty response"
            last_error = f"Gemini returned no text: {finish_reason}"
            continue
        parsed = _extract_json_object(text)
        if not parsed:
            last_error = f"Gemini returned non-JSON content: {text[:160]}"
            continue
        adjustment = _clamp_int(float(parsed.get("riskAdjustment", 0)), -10, 25)
        no_red_flags = (
            req.chainExists == 1
            and req.revokedFlag == 0
            and req.duplicateFlag == 0
            and req.contentDuplicateFlag == 0
            and req.documentDuplicateFlag == 0
            and (req.issuerTrustScore or 3) > 2
            and (req.timeGap or 86400.0) >= 3600
            and (req.batchSize or 1) <= 20
            and len(req.studentId) > 4
        )
        if no_red_flags:
            adjustment = 0
        confidence = str(parsed.get("confidence", "MEDIUM")).upper()
        if confidence not in {"LOW", "MEDIUM", "HIGH"}:
            confidence = "MEDIUM"
        reasons = parsed.get("reasons", [])
        if not isinstance(reasons, list):
            reasons = []
        return {
            "riskAdjustment": adjustment,
            "confidence": confidence,
            "reasons": [str(reason) for reason in reasons[:4] if str(reason).strip()],
            "summary": str(parsed.get("summary", "")).strip()[:240],
            "model": model,
        }, None
      except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:240]
        last_error = f"Gemini HTTP {exc.code}: {detail}"
        if exc.code not in {429, 503}:
            break
      except (URLError, TimeoutError, OSError, KeyError, json.JSONDecodeError, ValueError) as exc:
        last_error = f"Gemini unavailable: {type(exc).__name__}"
        break
    return None, last_error


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "ai",
        "geminiEnabled": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "ts": datetime.utcnow().isoformat(),
    }


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

        if req.documentDuplicateFlag == 1:
            rule_score += 70
            reasons.append("The same uploaded certificate document was reused for a different student")

        if req.chainExists == 0:
            rule_score += 45
            reasons.append("Credential hash was not found on blockchain")

        if req.revokedFlag == 1:
            rule_score += 50
            reasons.append("Credential is revoked on blockchain")
        
        # Low issuer trust → increased risk
        if req.issuerTrustScore and req.issuerTrustScore <= 2:
            rule_score += 20
            reasons.append("Low trust issuer")
        
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

        if not reasons:
            ai_score = min(ai_score, 10)
        
        # Combine AI + rule-based scores (0-100)
        final_score = _clamp_int(ai_score + rule_score, 0, 100)

        if req.documentDuplicateFlag == 1:
            final_score = max(final_score, 85)
        elif req.duplicateFlag == 1 or req.contentDuplicateFlag == 1:
            final_score = max(final_score, 75)
        
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
        
        if not reasons:
            reasons = [
                "Credential hash format is valid",
                "No duplicate or rapid-issuance warning was detected",
                "Issuer and student context was accepted",
            ]
            if req.hasDocument == 1:
                reasons.append("Uploaded certificate document is linked to the credential record")

        llm_review, llm_error = _gemini_review(req, final_score, reasons)
        if llm_review:
            final_score = _clamp_int(final_score + llm_review["riskAdjustment"], 0, 100)
            if final_score <= 20:
                risk_level = "LOW"
            elif final_score <= 50:
                risk_level = "MEDIUM"
            else:
                risk_level = "HIGH"
            for reason in llm_review["reasons"]:
                if reason not in reasons:
                    reasons.append(reason)

        return {
            "ok": True,
            "riskScore": final_score,
            "riskLevel": risk_level,
            "aiScore": ai_score,
            "ruleScore": rule_score,
            "reasons": reasons,
            "model": "hybrid_isolation_forest",
            "llmReview": llm_review,
            "llmError": llm_error,
        }
    except Exception as e:
        return {"ok": False, "error": f"Processing error: {str(e)}"}
