const DEFAULT_BASE_URL = 'http://127.0.0.1:5000';

export function getApiBaseUrl() {
  const v = localStorage.getItem('DECAID_API_BASE_URL');
  return v && v.trim() ? v.trim() : DEFAULT_BASE_URL;
}

export function setApiBaseUrl(url) {
  localStorage.setItem('DECAID_API_BASE_URL', String(url || '').trim());
}

export async function verifyByHash({ hash, studentId, issuerId, zkpCommitment, nonce }) {
  const base = getApiBaseUrl();
  const u = new URL(`/api/verify/by-hash/${hash}`, base);
  if (studentId) u.searchParams.set('studentId', studentId);
  if (issuerId) u.searchParams.set('issuerId', issuerId);
  if (zkpCommitment) u.searchParams.set('zkpCommitment', zkpCommitment);
  if (nonce) u.searchParams.set('nonce', nonce);

  const r = await fetch(u.toString(), {
    method: 'GET'
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function getStudentProfile(studentId) {
  const base = getApiBaseUrl();
  const u = new URL(`/api/students/${encodeURIComponent(studentId)}/profile`, base);
  const r = await fetch(u.toString(), { 
    method: 'GET'
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function generateZkpProof({ credentialHash, studentId, nonce }) {
  const base = getApiBaseUrl();
  const r = await fetch(`${base}/api/zkp/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialHash, studentId, nonce })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function verifyZkpProof({ credentialHash, studentId, nonce, commitment }) {
  const base = getApiBaseUrl();
  const r = await fetch(`${base}/api/zkp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialHash, studentId, nonce, commitment })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function verifyZkpByCommitment({ commitment, nonce }) {
  const base = getApiBaseUrl();
  const r = await fetch(`${base}/api/zkp/verify-by-commitment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitment, nonce })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function storeZkpCommitment({ credentialHash, studentId, commitment, nonce }) {
  const base = getApiBaseUrl();
  const r = await fetch(`${base}/api/zkp/store-commitment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialHash, studentId, commitment, nonce })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function revokeCredential({ credentialHash }) {
  const base = getApiBaseUrl();
  const r = await fetch(`${base}/api/credentials/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialHash })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}
