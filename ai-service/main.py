from datetime import datetime
from typing import Optional

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

app = FastAPI(title="DECAID AI Fraud Risk Service")


class ScoreRequest(BaseModel):
    studentId: str = Field(min_length=1)
    issuerId: str = Field(min_length=1)
    credentialHash: str = Field(min_length=16)
    issuedAt: Optional[datetime] = None
    batchId: Optional[str] = None


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
    contamination=0.05,
    random_state=42,
)

# Minimal baseline to keep service runnable. Replace with real training data.
_baseline = np.random.normal(loc=0.0, scale=1.0, size=(512, 8)).astype(np.float32)
_model.fit(_baseline)


def _features(req: ScoreRequest) -> np.ndarray:
    h = req.credentialHash.strip().lower()
    length = len(h)
    hex_ratio = sum(c in "0123456789abcdef" for c in h) / max(1, length)

    now = datetime.utcnow()
    issued = req.issuedAt or now
    age_days = max(0.0, (now - issued).total_seconds() / 86400.0)

    student_len = float(len(req.studentId))
    issuer_len = float(len(req.issuerId))
    has_batch = 1.0 if req.batchId else 0.0

    # Simple string-structure signals
    digit_ratio = sum(c.isdigit() for c in h) / max(1, length)
    letter_ratio = sum(c.isalpha() for c in h) / max(1, length)

    return np.array(
        [[
            hex_ratio,
            length / 128.0,
            age_days / 3650.0,
            student_len / 64.0,
            issuer_len / 64.0,
            has_batch,
            digit_ratio,
            letter_ratio,
        ]],
        dtype=np.float32,
    )


@app.get("/health")
def health():
    return {"ok": True, "service": "ai", "ts": datetime.utcnow().isoformat()}


@app.post("/score")
def score(req: ScoreRequest):
    x = _features(req)

    # IsolationForest: higher is more normal. Convert to anomaly-based risk.
    s = float(_model.decision_function(x)[0])

    # Calibrate to 0-100. (Heuristic mapping; refine with labeled data.)
    risk = _clamp_int((0.5 - s) * 100.0)

    return {
        "ok": True,
        "riskScore": risk,
        "model": "isolation_forest",
    }
