from datetime import datetime
from typing import Optional
import re
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="DECAID AI Fraud Risk Service")

class ScoreRequest(BaseModel):
    studentId: str = Field(min_length=1, max_length=255)
    issuerId: str = Field(min_length=1, max_length=255)
    credentialHash: str = Field(min_length=64, max_length=64, pattern=r'^[0-9a-fA-F]{64}$')
    issuedAt: Optional[datetime] = None
    batchId: Optional[str] = Field(max_length=255)

def _clamp_int(v: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(v))))

def _heuristic_risk(req: ScoreRequest) -> int:
    """Pure-Python risk scoring - works without numpy/scikit-learn"""
    
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
        
        # Use pure-python heuristic scoring
        risk = _heuristic_risk(req)

        return {
            "ok": True,
            "riskScore": risk,
            "model": "heuristic_pure_python",
        }
    except Exception as e:
        return {"ok": False, "error": f"Processing error: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
