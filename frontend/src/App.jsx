import { useEffect, useMemo, useRef, useState } from 'react';
import { generateZkpProof, getApiBaseUrl, setApiBaseUrl, verifyByHash, verifyZkpProof, verifyZkpByCommitment, storeZkpCommitment, revokeCredential } from './api.js';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';

function Badge({ label, tone }) {
  const cls = useMemo(() => {
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1';
    if (tone === 'green') return `${base} bg-emerald-500/15 text-emerald-200 ring-emerald-400/30`;
    if (tone === 'red') return `${base} bg-rose-500/15 text-rose-200 ring-rose-400/30`;
    if (tone === 'amber') return `${base} bg-amber-500/15 text-amber-200 ring-amber-400/30`;
    return `${base} bg-slate-500/15 text-slate-200 ring-slate-400/30`;
  }, [tone]);

  return <span className={cls}>{label}</span>;
}

function Card({ title, children }) {
  return (
    <div className="rounded-lg bg-[#0b1220]/85 ring-1 ring-cyan-100/10 shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="px-5 py-4 border-b border-cyan-100/10">
        <h2 className="text-sm font-semibold text-cyan-50">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function formatUnix(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

const CERTIFICATE_TYPES = [
  { value: 'normal_certificate', label: 'Normal Certificate', issuerId: 'TEACHER-STUDENT-INCHARGE' },
  { value: 'courses', label: 'NPTEL / Courses', issuerId: 'NPTEL-TNP-INCHARGE' },
  { value: 'internship', label: 'Internship', issuerId: 'III-INTERNSHIP-INCHARGE' },
  { value: 'sport', label: 'Sport', issuerId: 'FORUM-SPORT-EVENT-INCHARGE' },
  { value: 'other_event', label: 'Other Event / Hackathon', issuerId: 'FORUM-SPORT-EVENT-INCHARGE' }
];

const INCHARGE_ROLE_ISSUER = {
  teacher_student_incharge: 'TEACHER-STUDENT-INCHARGE',
  forum_incharge: 'FORUM-SPORT-EVENT-INCHARGE',
  nptel_incharge: 'NPTEL-TNP-INCHARGE',
  iii_incharge: 'III-INTERNSHIP-INCHARGE'
};

const INCHARGE_ROLE_LABEL = {
  teacher_student_incharge: 'Teacher Student Incharge',
  forum_incharge: 'Forum Incharge',
  nptel_incharge: 'NPTEL / TNP Incharge',
  iii_incharge: 'III Internship Incharge'
};

const isInchargeRole = (role) => Object.prototype.hasOwnProperty.call(INCHARGE_ROLE_ISSUER, role);

function maskHash(hash) {
  if (!hash) return '****';
  return `${hash.slice(0, 6)}****${hash.slice(-6)}`;
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('token');
  return token
    ? { ...extra, Authorization: `Bearer ${token}` }
    : extra;
}

function buildRequestCredentialData(request) {
  return [
    request.certificateType,
    request.title,
    request.description,
    request.filename || ''
  ].join('|');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Admin Operations Component
function AdminDashboard({ apiBaseUrl, adminLoading, setAdminLoading, adminError, setAdminError, adminStats, setAdminStats }) {
  const [requests, setRequests] = useState([]);

  async function loadOperationsData() {
    setAdminLoading(true);
    setAdminError('');
    try {
      const [statsRes, requestsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/admin/stats`),
        fetch(`${apiBaseUrl}/api/certificate-requests`, {
          headers: getAuthHeaders()
        })
      ]);

      const stats = await statsRes.json();
      const requestData = await requestsRes.json();
      if (stats.ok) setAdminStats(stats.stats);
      if (requestData.ok) setRequests(requestData.requests || []);
    } catch (err) {
      setAdminError(err.message || 'Failed to load admin data');
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    loadOperationsData();
  }, []);

  const pending = requests.filter((request) => request.status === 'pending');
  const approved = requests.filter((request) => request.status === 'approved');
  const rejected = requests.filter((request) => request.status === 'rejected');
  const routes = Object.entries(
    requests.reduce((acc, request) => {
      acc[request.assignedIssuerId] = (acc[request.assignedIssuerId] || 0) + 1;
      return acc;
    }, {})
  );

  return (
    <Card title="Admin Operations">
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm text-slate-300">
            Monitor certificate request flow and blockchain issuance health.
          </div>
          <button
            type="button"
            onClick={loadOperationsData}
            disabled={adminLoading}
            className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
          >
            {adminLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {adminError ? (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 p-3 text-sm">
            {adminError}
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10 text-center">
            <div className="text-2xl font-bold text-amber-300">{pending.length}</div>
            <div className="text-xs text-slate-400">Pending</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10 text-center">
            <div className="text-2xl font-bold text-emerald-300">{approved.length}</div>
            <div className="text-xs text-slate-400">Approved</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10 text-center">
            <div className="text-2xl font-bold text-rose-300">{rejected.length}</div>
            <div className="text-xs text-slate-400">Not Accepted</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10 text-center">
            <div className="text-2xl font-bold text-slate-100">{adminStats?.totalCredentials || 0}</div>
            <div className="text-xs text-slate-400">On Record</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10 text-center">
            <div className="text-2xl font-bold text-slate-100">{requests.length}</div>
            <div className="text-xs text-slate-400">Requests</div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Incharge Routing</h4>
          {routes.length === 0 ? (
            <div className="text-sm text-slate-500">No routed requests yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {routes.map(([issuerId, count]) => (
                <div key={issuerId} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                  <span className="text-sm text-slate-200 font-mono">{issuerId}</span>
                  <Badge label={`${count} request${count === 1 ? '' : 's'}`} tone="slate" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Requests</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {requests.length === 0 ? (
              <div className="text-sm text-slate-500">No certificate requests yet.</div>
            ) : requests.slice(0, 20).map((request) => (
              <div key={request.id} className="p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-slate-200">{request.title}</div>
                    <div className="text-xs text-slate-500">{request.studentId} - {request.assignedIssuerId}</div>
                  </div>
                  <Badge
                    label={request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Not Accepted' : 'Pending'}
                    tone={request.status === 'approved' ? 'green' : request.status === 'rejected' ? 'red' : 'amber'}
                  />
                </div>
                {request.credentialHash ? (
                  <div className="mt-2 font-mono text-xs text-emerald-300 break-all">{maskHash(request.credentialHash)}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AppContent({ user, onLogout }) {
  const [apiBaseUrl, setApiBaseUrlState] = useState(getApiBaseUrl());
  const [tab, setTab] = useState(() => {
    if (user.role === 'student') return 'student';
    if (user.role === 'institution' || isInchargeRole(user.role)) return 'institution';
    if (user.role === 'employer') return 'employer';
    return 'employer'; // default for admin
  });
  const [hash, setHash] = useState('');
  const [studentId, setStudentId] = useState('');
  const [issuerId, setIssuerId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const [studentLookupId, setStudentLookupId] = useState(user.role === 'student' ? user.username : '');
  const [studentRequests, setStudentRequests] = useState([]);
  const [studentRequestLoading, setStudentRequestLoading] = useState(false);
  const [studentRequestError, setStudentRequestError] = useState('');
  const [studentRequestForm, setStudentRequestForm] = useState({
    certificateType: 'normal_certificate',
    title: '',
    description: '',
    file: null
  });
  const studentFileInputRef = useRef(null);

  // ZKP state
  const [zkpPlainText, setZkpPlainText] = useState('');
  const [zkpHash, setZkpHash] = useState('');
  const [zkpStudentId, setZkpStudentId] = useState('');
  const [zkpNonce, setZkpNonce] = useState('');
  const [zkpLoading, setZkpLoading] = useState(false);
  const [zkpError, setZkpError] = useState('');
  const [zkpProof, setZkpProof] = useState(null);
  const [zkpVerifyHash, setZkpVerifyHash] = useState('');
  const [zkpVerifyStudentId, setZkpVerifyStudentId] = useState('');
  const [zkpVerifyNonce, setZkpVerifyNonce] = useState('');
  const [zkpVerifyCommitment, setZkpVerifyCommitment] = useState('');
  const [zkpVerifyLoading, setZkpVerifyLoading] = useState(false);
  const [zkpVerifyError, setZkpVerifyError] = useState('');
  const [zkpVerifyResult, setZkpVerifyResult] = useState(null);

  // Commitment-only verification state
  const [zkpCommitmentOnlyNonce, setZkpCommitmentOnlyNonce] = useState('');
  const [zkpCommitmentOnlyCommitment, setZkpCommitmentOnlyCommitment] = useState('');
  const [zkpCommitmentOnlyLoading, setZkpCommitmentOnlyLoading] = useState(false);
  const [zkpCommitmentOnlyError, setZkpCommitmentOnlyError] = useState('');
  const [zkpCommitmentOnlyResult, setZkpCommitmentOnlyResult] = useState(null);

  // Institution state
  const [institutionLoading, setInstitutionLoading] = useState(false);
  const [institutionError, setInstitutionError] = useState('');
  const [institutionIssuerId, setInstitutionIssuerId] = useState('');
  const [inchargeRequests, setInchargeRequests] = useState([]);
  const [reviewNotes, setReviewNotes] = useState({});
  const [requestHashPreviews, setRequestHashPreviews] = useState({});
  const [copiedHashKey, setCopiedHashKey] = useState('');

  // Admin Dashboard state
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminStats, setAdminStats] = useState(null);
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminIssuers, setAdminIssuers] = useState([]);
  const [adminCredentials, setAdminCredentials] = useState([]);
  const [adminDocuments, setAdminDocuments] = useState([]);
  const [adminActiveTab, setAdminActiveTab] = useState('overview');

  async function onVerify(e) {
    e.preventDefault();
    setError('');
    setData(null);

    const h = hash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      setError('Enter a valid 64-hex SHA-256 hash.');
      return;
    }

    setLoading(true);
    try {
      const out = await verifyByHash({ 
        hash: h, 
        studentId: studentId.trim(), 
        issuerId: issuerId.trim() 
      });
      setData(out);
    } catch (err) {
      setError(err?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentRequests(id = studentLookupId.trim()) {
    if (!id) return;
    const response = await fetch(`${getApiBaseUrl()}/api/certificate-requests?studentId=${encodeURIComponent(id)}`, {
      headers: getAuthHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to load certificate requests');
    setStudentRequests(result.requests || []);
  }

  async function onSubmitStudentRequest(e) {
    e.preventDefault();
    setStudentRequestError('');
    const currentStudentId = user.role === 'student' ? user.username : studentLookupId.trim();
    if (!currentStudentId) {
      setStudentRequestError('Enter your student ID before submitting a request.');
      return;
    }
    if (!studentRequestForm.title.trim() || !studentRequestForm.description.trim()) {
      setStudentRequestError('Add a title and description for the certificate.');
      return;
    }

    setStudentRequestLoading(true);
    try {
      const formData = new FormData();
      formData.append('studentId', currentStudentId);
      formData.append('certificateType', studentRequestForm.certificateType);
      formData.append('title', studentRequestForm.title.trim());
      formData.append('description', studentRequestForm.description.trim());
      if (studentRequestForm.file) {
        formData.append('file', studentRequestForm.file);
      }

      const response = await fetch(`${getApiBaseUrl()}/api/certificate-requests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Request failed');

      setStudentLookupId(currentStudentId);
      setStudentRequestForm({
        certificateType: 'normal_certificate',
        title: '',
        description: '',
        file: null
      });
      if (studentFileInputRef.current) {
        studentFileInputRef.current.value = '';
      }
      await loadStudentRequests(currentStudentId);
    } catch (err) {
      setStudentRequestError(err?.message || 'Request failed');
    } finally {
      setStudentRequestLoading(false);
    }
  }

  async function onGenerateZkp(e) {
    e.preventDefault();
    setZkpError('');
    setZkpProof(null);

    const h = zkpHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      setZkpError('Enter a valid 64-hex SHA-256 credential hash.');
      return;
    }
    const sid = zkpStudentId.trim();
    if (!sid) {
      setZkpError('Enter a student ID.');
      return;
    }

    setZkpLoading(true);
    try {
      const out = await generateZkpProof({ credentialHash: h, studentId: sid, nonce: zkpNonce.trim() || undefined });
      setZkpProof(out);

      // Automatically store the commitment for later verification
      try {
        await storeZkpCommitment({
          credentialHash: h,
          studentId: sid,
          commitment: out.commitment,
          nonce: out.nonce
        });
      } catch (storeErr) {
        console.warn('Failed to store commitment:', storeErr);
      }
    } catch (err) {
      setZkpError(err?.message || 'Failed to generate ZKP proof');
    } finally {
      setZkpLoading(false);
    }
  }

  async function onGenerateHashFromText() {
    setZkpError('');
    if (!zkpPlainText.trim()) {
      setZkpError('Enter certificate data to hash.');
      return;
    }

    const hashHex = await sha256Hex(zkpPlainText.trim());
    setZkpHash(hashHex);
  }

  async function onVerifyZkp(e) {
    e.preventDefault();
    setZkpVerifyError('');
    setZkpVerifyResult(null);

    const h = zkpVerifyHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      setZkpVerifyError('Enter a valid 64-hex SHA-256 credential hash.');
      return;
    }
    const sid = zkpVerifyStudentId.trim();
    if (!sid) {
      setZkpVerifyError('Enter a student ID.');
      return;
    }
    const nonce = zkpVerifyNonce.trim();
    if (!nonce) {
      setZkpVerifyError('Enter the proof nonce.');
      return;
    }
    const commitment = zkpVerifyCommitment.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(commitment)) {
      setZkpVerifyError('Enter a valid 64-hex commitment.');
      return;
    }

    setZkpVerifyLoading(true);
    try {
      const out = await verifyZkpProof({ credentialHash: h, studentId: sid, nonce, commitment });
      setZkpVerifyResult(out);
    } catch (err) {
      setZkpVerifyError(err?.message || 'Failed to verify ZKP proof');
    } finally {
      setZkpVerifyLoading(false);
    }
  }

  async function onVerifyZkpByCommitment(e) {
    e.preventDefault();
    setZkpCommitmentOnlyError('');
    setZkpCommitmentOnlyResult(null);

    const commitment = zkpCommitmentOnlyCommitment.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(commitment)) {
      setZkpCommitmentOnlyError('Enter a valid 64-hex commitment.');
      return;
    }
    const nonce = zkpCommitmentOnlyNonce.trim();
    if (!nonce) {
      setZkpCommitmentOnlyError('Enter the nonce.');
      return;
    }

    setZkpCommitmentOnlyLoading(true);
    try {
      const out = await verifyZkpByCommitment({ commitment, nonce });
      setZkpCommitmentOnlyResult(out);
    } catch (err) {
      setZkpCommitmentOnlyError(err?.message || 'Failed to verify ZKP proof');
    } finally {
      setZkpCommitmentOnlyLoading(false);
    }
  }

  function onSaveApiBaseUrl() {
    const v = apiBaseUrl.trim();
    setApiBaseUrl(v);
    setApiBaseUrlState(getApiBaseUrl());
  }

  async function onRevokeCredential(credentialHash) {
    if (!confirm('Are you sure you want to revoke this credential? This action cannot be undone.')) {
      return;
    }

    setInstitutionLoading(true);
    setInstitutionError('');
    try {
      await revokeCredential({ credentialHash });
      alert('Credential revoked successfully');
      // Reload institution data to show updated status
      await loadInstitutionData(institutionIssuerId);
    } catch (err) {
      setInstitutionError(err?.message || 'Failed to revoke credential');
    } finally {
      setInstitutionLoading(false);
    }
  }

  async function loadInstitutionData(issuerId) {
    if (!issuerId) return;
    try {
      const requestsRes = await fetch(`${getApiBaseUrl()}/api/certificate-requests?issuerId=${encodeURIComponent(issuerId)}`, {
        headers: getAuthHeaders()
      });
      if (requestsRes.ok) {
        const requestsData = await requestsRes.json();
        setInchargeRequests(requestsData.requests || []);
      }
    } catch (err) {
      console.error('Failed to load institution data:', err);
    }
  }

  async function onReviewCertificateRequest(requestId, decision) {
    setInstitutionLoading(true);
    setInstitutionError('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/certificate-requests/${requestId}/review`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          decision,
          rejectionReason: reviewNotes[requestId] || 'Not accepted'
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Review failed');
      await loadInstitutionData(institutionIssuerId);
    } catch (err) {
      setInstitutionError(err?.message || 'Review failed');
    } finally {
      setInstitutionLoading(false);
    }
  }

  async function onGenerateRequestHashPreview(request) {
    const credentialData = buildRequestCredentialData(request);
    const hash = await sha256Hex(`${request.studentId}:${request.assignedIssuerId}:${credentialData}`);
    setRequestHashPreviews((previews) => ({
      ...previews,
      [request.id]: hash
    }));
  }

  async function onOpenRequestDocument(request) {
    setInstitutionError('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/certificate-requests/${request.id}/document`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not open uploaded document');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setInstitutionError(err?.message || 'Could not open uploaded document');
    }
  }

  useEffect(() => {
    const roleIssuerId = INCHARGE_ROLE_ISSUER[user.role];
    if (roleIssuerId && !institutionIssuerId) {
      setInstitutionIssuerId(roleIssuerId);
      loadInstitutionData(roleIssuerId);
    }
  }, [user.role]);

  useEffect(() => {
    if (user.role === 'student' && user.username) {
      setStudentLookupId(user.username);
      loadStudentRequests(user.username).catch((err) => {
        setStudentRequestError(err?.message || 'Failed to load certificate requests');
      });
    }
  }, [user.role, user.username]);

  const riskScore = data?.risk?.ok ? data.risk.riskScore : null;
  const riskTone = riskScore == null ? 'slate' : riskScore >= 70 ? 'red' : riskScore >= 40 ? 'amber' : 'green';
  const approvedRequests = studentRequests.filter((request) => request.status === 'approved');
  const pendingRequests = studentRequests.filter((request) => request.status === 'pending');
  const rejectedRequests = studentRequests.filter((request) => request.status === 'rejected');
  const currentInchargeRequests = inchargeRequests.filter((request) => request.status === 'pending');
  const reviewedInchargeRequests = inchargeRequests.filter((request) => request.status !== 'pending');
  const riskAssessmentAvailable = Boolean(data?.verificationContext?.riskAssessmentAvailable && data?.risk?.ok);
  const tabButtonClass = (active) =>
    `rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition-colors ${
      active
        ? 'bg-cyan-100 text-slate-950 ring-cyan-200/70 shadow-lg shadow-cyan-950/20'
        : 'bg-[#0b1220]/75 text-slate-300 ring-cyan-100/10 hover:bg-[#101a2b] hover:text-cyan-50'
    }`;

  async function copyHashToClipboard(hashValue, key) {
    if (!hashValue) return;
    await navigator.clipboard.writeText(hashValue);
    setCopiedHashKey(key);
    setTimeout(() => {
      setCopiedHashKey((current) => (current === key ? '' : current));
    }, 1800);
  }

  return (
    <div className="app-shell min-h-screen text-slate-100">
      {/* Header */}
      <div className="bg-[#07101d]/88 backdrop-blur-xl border-b border-cyan-100/10 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h1 className="text-xl font-bold tracking-wide text-cyan-50">DECAID</h1>
              <span className="text-xs text-cyan-100/65">Decentralized Academic Identity</span>
              <span className="hidden sm:inline text-xs text-slate-600">|</span>
              <span className="text-xs text-slate-400">Logged in as: {user?.username} ({user?.role})</span>
            </div>
            <button
              onClick={onLogout}
              className="rounded-lg px-4 py-2 text-sm font-semibold ring-1 ring-cyan-100/10 bg-[#0d1728] text-slate-200 hover:bg-[#14223a] transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-10">

        {/* Tab navigation */}
        <div className="mt-5 flex gap-2 flex-wrap">
          {(user.role === 'employer' || user.role === 'admin') && (
            <button
              type="button"
              onClick={() => setTab('employer')}
              className={tabButtonClass(tab === 'employer')}
            >
              Employer Verify
            </button>
          )}
          
          {(user.role === 'student' || user.role === 'admin') && (
            <button
              type="button"
              onClick={() => setTab('student')}
              className={tabButtonClass(tab === 'student')}
            >
              Student Identity
            </button>
          )}
          
          {(user.role === 'institution' || isInchargeRole(user.role) || user.role === 'admin') && (
            <button
              type="button"
              onClick={() => setTab('institution')}
              className={tabButtonClass(tab === 'institution')}
            >
              Incharge Portal
            </button>
          )}
          
          {user.role !== 'student' && user.role !== 'employer' && (
            <button
              type="button"
              onClick={() => setTab('zkp')}
              className={tabButtonClass(tab === 'zkp')}
            >
              ZKP Tools
            </button>
          )}

          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => setTab('admin')}
              className={tabButtonClass(tab === 'admin')}
            >
              Admin Operations
            </button>
          )}
        </div>

        <div className={`mt-6 grid ${tab === 'student' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'} gap-5`}>
          {tab !== 'student' && (
          <div className="lg:col-span-1 flex flex-col gap-5">
            {user.role === 'admin' && (
            <Card title="API Connection">
              <label className="block text-xs text-slate-300 mb-2">Backend Base URL</label>
              <div className="flex gap-2">
                <input
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrlState(e.target.value)}
                  className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                  placeholder="http://127.0.0.1:5002"
                />
                <button
                  type="button"
                  onClick={onSaveApiBaseUrl}
                  className="rounded-xl bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold"
                >
                  Save
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-400">Using: {getApiBaseUrl()}</div>
            </Card>
            )}

            {tab === 'employer' ? (
              <Card title="Verify Credential">
                <form onSubmit={onVerify} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Credential Hash (SHA-256 hex)</label>
                    <input
                      value={hash}
                      onChange={(e) => setHash(e.target.value)}
                      className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                      placeholder="64-hex hash"
                      spellCheck={false}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Student ID (optional)</label>
                      <input
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="e.g. S12345"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Issuer ID (optional)</label>
                      <input
                        value={issuerId}
                        onChange={(e) => setIssuerId(e.target.value)}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="e.g. UNI001"
                      />
                    </div>
                  </div>

                  <button
                    disabled={loading}
                    className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                  >
                    {loading ? 'Verifying...' : 'Verify'}
                  </button>

                  {error && (
                    <div className={`text-sm rounded-xl p-3 border ${error.includes('mismatch') || error.includes('not found') || error.includes('Invalid') ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">❌</span>
                        <span>{error}</span>
                      </div>
                      {(error.includes('mismatch') || error.includes('Student ID')) && (
                        <div className="mt-2 text-xs text-rose-300/70">
                          Please check the Student ID and try again. The credential may belong to a different student.
                        </div>
                      )}
                    </div>
                  )}
                </form>
              </Card>
            ) : tab === 'zkp' ? (
              <Card title="ZKP Tools">
                <div className="flex flex-col gap-4">
                  <div className="text-sm text-slate-300">
                    Generate a credential hash, turn it into a zero-knowledge proof, or verify a proof shared by another participant.
                  </div>
                  <div className="rounded-xl bg-slate-950/40 ring-1 ring-white/10 p-3">
                    <label className="block text-xs text-slate-300 mb-1">Certificate Data to Hash</label>
                    <textarea
                      value={zkpPlainText}
                      onChange={(e) => setZkpPlainText(e.target.value)}
                      className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100 h-20"
                      placeholder="Paste certificate title, student ID, issuer, or canonical credential text"
                    />
                    <button
                      type="button"
                      onClick={onGenerateHashFromText}
                      className="mt-2 w-full rounded-xl bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 text-sm font-semibold"
                    >
                      Generate Hash
                    </button>
                  </div>
                  <form onSubmit={onGenerateZkp} className="flex flex-col gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Credential Hash</label>
                      <input
                        value={zkpHash}
                        onChange={(e) => setZkpHash(e.target.value)}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="64-hex hash"
                        spellCheck={false}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Student ID</label>
                      <input
                        value={zkpStudentId}
                        onChange={(e) => setZkpStudentId(e.target.value)}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="e.g. S12345"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Nonce (optional - auto-generated if empty)</label>
                      <input
                        value={zkpNonce}
                        onChange={(e) => setZkpNonce(e.target.value)}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="Custom nonce (optional)"
                      />
                    </div>
                    <button
                      disabled={zkpLoading}
                      className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                    >
                      {zkpLoading ? 'Generating...' : 'Generate ZKP Proof'}
                    </button>
                    {zkpError ? <div className="text-sm text-rose-200">{zkpError}</div> : null}
                  </form>

                  {zkpProof && (
                    <div className="mt-2 p-3 rounded-xl bg-emerald-950/30 ring-1 ring-emerald-500/30">
                      <div className="text-xs text-emerald-300 mb-2">ZKP Generated Successfully</div>
                      <div className="text-xs text-slate-300 mb-1">Commitment (share this):</div>
                      <div className="font-mono text-xs text-slate-100 break-all mb-2">{zkpProof.commitment}</div>
                      <div className="text-xs text-slate-300 mb-1">Nonce (keep secret):</div>
                      <div className="font-mono text-xs text-slate-100 break-all">{zkpProof.nonce}</div>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-4 mt-2">
                    <div className="text-sm text-slate-300 mb-3">
                      <strong>Privacy-Preserving Verification</strong>
                      <div className="text-xs text-slate-400 mt-1">Verify using only commitment + nonce - employer never sees credential hash or student ID</div>
                    </div>
                    <form onSubmit={onVerifyZkpByCommitment} className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Commitment</label>
                        <input
                          value={zkpCommitmentOnlyCommitment}
                          onChange={(e) => setZkpCommitmentOnlyCommitment(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="64-hex commitment from student"
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Nonce</label>
                        <input
                          value={zkpCommitmentOnlyNonce}
                          onChange={(e) => setZkpCommitmentOnlyNonce(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="Nonce from student (revealed privately)"
                        />
                      </div>
                      <button
                        disabled={zkpCommitmentOnlyLoading}
                        className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                      >
                        {zkpCommitmentOnlyLoading ? 'Verifying...' : 'Verify by Commitment'}
                      </button>
                      {zkpCommitmentOnlyError ? <div className="text-sm text-rose-200">{zkpCommitmentOnlyError}</div> : null}
                    </form>

                    {zkpCommitmentOnlyResult && (
                      <div className={`mt-2 p-3 rounded-xl ${zkpCommitmentOnlyResult.valid ? 'bg-emerald-950/30 ring-1 ring-emerald-500/30' : 'bg-rose-950/30 ring-1 ring-rose-500/30'}`}>
                        <Badge
                          label={zkpCommitmentOnlyResult.valid ? 'Valid' : 'Invalid'}
                          tone={zkpCommitmentOnlyResult.valid ? 'green' : 'red'}
                        />
                        <div className="mt-2 text-xs text-slate-300">
                          {zkpCommitmentOnlyResult.valid
                            ? 'Credential verified on blockchain. Proof is valid.'
                            : 'Invalid proof or commitment not found.'}
                        </div>
                        {zkpCommitmentOnlyResult.blockchain && (
                          <div className="mt-2 text-xs text-slate-400">
                            <div>On-chain: {zkpCommitmentOnlyResult.blockchain.exists ? 'Yes' : 'No'}</div>
                            {zkpCommitmentOnlyResult.blockchain.issuerAddress && (
                              <div>Issuer: {zkpCommitmentOnlyResult.blockchain.issuerAddress.substring(0, 10)}...</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ) : (
              <Card title="Incharge Tools">
                <div className="space-y-3">
                  <div className="text-sm text-slate-300">
                    Review student certificate requests assigned to your role.
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Issuer ID</label>
                    <input
                      value={institutionIssuerId}
                      onChange={(e) => setInstitutionIssuerId(e.target.value)}
                      className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                      disabled={isInchargeRole(user.role)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => loadInstitutionData(institutionIssuerId)}
                    disabled={institutionLoading || !institutionIssuerId}
                    className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                  >
                    {institutionLoading ? 'Loading...' : 'Refresh Queue'}
                  </button>
                  <div className="text-xs text-slate-500">
                    Current: {currentInchargeRequests.length} | History: {reviewedInchargeRequests.length}
                  </div>
                </div>
              </Card>
            )}
          </div>
          )}

          <div className={`${tab === 'student' ? '' : 'lg:col-span-2'} flex flex-col gap-5`}>
            {tab === 'employer' ? (
              <Card title="Verification Result">
                {!data ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-sm">Enter a credential hash and click Verify</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Status Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className={`p-3 rounded-xl border ${data.blockchain?.exists ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                        <div className="text-xs text-slate-400 mb-1">Blockchain</div>
                        <div className={`text-sm font-semibold ${data.blockchain?.exists ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {data.blockchain?.exists ? '✓ Exists' : '✗ Not Found'}
                        </div>
                      </div>
                      <div className={`p-3 rounded-xl border ${data.blockchain?.revoked ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                        <div className="text-xs text-slate-400 mb-1">Status</div>
                        <div className={`text-sm font-semibold ${data.blockchain?.revoked ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {data.blockchain?.revoked ? '⚠ Revoked' : '✓ Active'}
                        </div>
                      </div>
                      <div className={`p-3 rounded-xl border ${data.duplicateDetected ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-500/10 border-slate-500/30'}`}>
                        <div className="text-xs text-slate-400 mb-1">Duplicate</div>
                        <div className={`text-sm font-semibold ${data.duplicateDetected ? 'text-amber-400' : 'text-slate-300'}`}>
                          {data.duplicateDetected ? '⚠ Detected' : '✓ Unique'}
                        </div>
                      </div>
                      <div className={`p-3 rounded-xl border ${data.trustRank >= 4 ? 'bg-emerald-500/10 border-emerald-500/30' : data.trustRank <= 2 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-500/10 border-slate-500/30'}`}>
                        <div className="text-xs text-slate-400 mb-1">Trust Rank</div>
                        <div className="text-sm font-semibold text-slate-200">
                          {'★'.repeat(data.trustRank)}{'☆'.repeat(5 - data.trustRank)}
                        </div>
                      </div>
                    </div>

                    {/* Risk Score Visual */}
                    <div className="bg-slate-950/30 rounded-xl p-4 border border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-slate-300">Verification Analysis</span>
                        <div className="flex items-center gap-3">
                          {riskAssessmentAvailable && data?.risk?.riskLevel && (
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              data.risk.riskLevel === 'HIGH' ? 'bg-rose-500/20 text-rose-300' :
                              data.risk.riskLevel === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {data.risk.riskLevel}
                            </span>
                          )}
                          {riskAssessmentAvailable ? (
                            <span className={`text-2xl font-bold ${riskScore >= 70 ? 'text-rose-400' : riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {riskScore ?? '--'}/100
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">Hash-only</span>
                          )}
                        </div>
                      </div>
                      {riskAssessmentAvailable ? (
                        <>
                          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${riskScore >= 70 ? 'bg-rose-500' : riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${riskScore ?? 0}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-2 text-xs text-slate-500">
                            <span>Safe (0)</span>
                            <span>Moderate (50)</span>
                            <span>High Risk (100)</span>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-lg bg-cyan-400/5 p-3 text-sm text-slate-300 ring-1 ring-cyan-300/15">
                          Hash-only verification confirms blockchain existence and status. Add the Student ID, and optionally Issuer ID, to run the fraud-risk analysis.
                        </div>
                      )}
                      {riskAssessmentAvailable && data?.risk?.model && (
                        <div className="mt-2 text-xs text-slate-500">
                          Model: <span className="text-slate-400">{data.risk.model}</span>
                        </div>
                      )}
                      {riskAssessmentAvailable && data?.risk?.reasons && data.risk.reasons.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-slate-400 mb-2">Analysis Notes:</div>
                          <div className="space-y-1">
                            {data.risk.reasons.map((reason, idx) => (
                              <div key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300"></span>
                                {reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {riskAssessmentAvailable && data?.risk?.aiScore !== undefined && data?.risk?.ruleScore !== undefined && (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-slate-900/50">
                            <div className="text-slate-500">AI Score</div>
                            <div className="text-slate-300 font-semibold">{data.risk.aiScore}/50</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/50">
                            <div className="text-slate-500">Rule Score</div>
                            <div className="text-slate-300 font-semibold">{data.risk.ruleScore}/50</div>
                          </div>
                        </div>
                      )}
                      {riskAssessmentAvailable && data?.risk?.llmReview ? (
                        <div className="mt-3 rounded-lg bg-cyan-400/5 p-3 text-xs text-slate-300 ring-1 ring-cyan-300/15">
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-cyan-100">Gemini Review</span>
                            <span className="text-slate-500">{data.risk.llmReview.model} | {data.risk.llmReview.confidence}</span>
                          </div>
                          <div>{data.risk.llmReview.summary}</div>
                        </div>
                      ) : null}
                      {riskAssessmentAvailable && data?.risk?.llmError ? (
                        <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-100 ring-1 ring-amber-400/20">
                          Gemini review unavailable; local analysis was used.
                        </div>
                      ) : null}
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Credential Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Hash</span>
                            <span className="text-slate-300 font-mono text-xs truncate max-w-[200px]">{data.credentialHash}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Issued At</span>
                            <span className="text-slate-300">{formatUnix(data.blockchain?.issuedAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">IPFS CID</span>
                            <span className="text-slate-300 font-mono text-xs">{data.ipfsCid || '—'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Issuer Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Address</span>
                            <span className="text-slate-300 font-mono text-xs truncate max-w-[200px]">{data.blockchain?.issuerAddress || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Verification Mode</span>
                            <span className={data?.verificationContext?.riskAssessmentAvailable ? 'text-emerald-400' : 'text-slate-400'}>
                              {data?.verificationContext?.riskAssessmentAvailable ? 'Context verified' : 'Hash-only'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Document Viewer */}
                    {data.document && (
                      <div className="bg-slate-950/30 rounded-xl p-4 border border-white/5">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Credential Document</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Filename</span>
                            <span className="text-slate-300">{data.document.filename}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">IPFS CID</span>
                            <span className="text-slate-300 font-mono text-xs truncate max-w-[200px]">{data.document.ipfsCid}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Size</span>
                            <span className="text-slate-300">{(data.document.fileSize / 1024).toFixed(2)} KB</span>
                          </div>
                          <a 
                            href={`https://ipfs.io/ipfs/${data.document.ipfsCid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 text-sm font-semibold"
                          >
                            View Document
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Trust Signals */}
                    {data.trustSignals && (
                      <div className="bg-slate-950/30 rounded-xl p-4 border border-white/5">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Issuer Trust Signals</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-slate-200">{data.trustSignals.totalIssuedAttempts || 0}</div>
                            <div className="text-xs text-slate-500">Total Issued</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-400">{((data.trustSignals.chainSuccessRate || 0) * 100).toFixed(0)}%</div>
                            <div className="text-xs text-slate-500">Success Rate</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-slate-200">{(data.trustSignals.avgRisk || 0).toFixed(0)}</div>
                            <div className="text-xs text-slate-500">Avg Risk</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-rose-400">{data.trustSignals.revocations || 0}</div>
                            <div className="text-xs text-slate-500">Revocations</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ) : tab === 'student' ? (
              <Card title="Student Certificates">
                <div className="space-y-6">
                  <form onSubmit={onSubmitStudentRequest} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-950/50 ring-1 ring-white/10 px-3 py-2">
                      <div className="text-xs text-slate-400">Student ID</div>
                      <div className="text-sm font-mono text-slate-100">{user.username}</div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Certificate Type</label>
                      <select
                        value={studentRequestForm.certificateType}
                        onChange={(e) => setStudentRequestForm((form) => ({ ...form, certificateType: e.target.value }))}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                      >
                        {CERTIFICATE_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-slate-300 mb-1">Certificate Title / ID</label>
                      <input
                        value={studentRequestForm.title}
                        onChange={(e) => setStudentRequestForm((form) => ({ ...form, title: e.target.value }))}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="Certificate number, event name, course name"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-slate-300 mb-1">Description</label>
                      <textarea
                        value={studentRequestForm.description}
                        onChange={(e) => setStudentRequestForm((form) => ({ ...form, description: e.target.value }))}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100 h-24"
                        placeholder="Add issuer, event, course, or certificate details needed for verification"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-slate-300 mb-1">Certificate File</label>
                      <input
                        type="file"
                        ref={studentFileInputRef}
                        onChange={(e) => setStudentRequestForm((form) => ({ ...form, file: e.target.files?.[0] || null }))}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        accept=".pdf,.jpg,.jpeg,.png"
                      />
                    </div>
                    <button
                      disabled={studentRequestLoading}
                      className="md:col-span-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                    >
                      {studentRequestLoading ? 'Sending...' : 'Send Request'}
                    </button>
                    {studentRequestError ? <div className="md:col-span-2 text-sm text-rose-200">{studentRequestError}</div> : null}
                  </form>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Achieved Certificates</h4>
                    <div className="space-y-2">
                      {approvedRequests.length === 0 ? (
                        <div className="text-sm text-slate-500">No approved certificates yet.</div>
                      ) : approvedRequests.map((request) => (
                        <div key={request.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                          <div>
                            <div className="text-sm text-slate-200">{request.title}</div>
                            <div className="text-xs text-slate-500">{CERTIFICATE_TYPES.find((type) => type.value === request.certificateType)?.label}</div>
                            <div className="font-mono text-xs text-slate-400 mt-1">{maskHash(request.credentialHash)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyHashToClipboard(request.credentialHash, `student-${request.id}`)}
                            className="rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 text-xs font-medium"
                          >
                            {copiedHashKey === `student-${request.id}` ? 'Copied' : 'Copy Hash'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Under Process</h4>
                    <div className="space-y-2">
                      {pendingRequests.length === 0 && rejectedRequests.length === 0 ? (
                        <div className="text-sm text-slate-500">No active requests.</div>
                      ) : [...pendingRequests, ...rejectedRequests].map((request) => (
                        <div key={request.id} className="p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-sm text-slate-200">{request.title}</div>
                              <div className="text-xs text-slate-500">Sent to {request.assignedIssuerId}</div>
                            </div>
                            <Badge label={request.status === 'rejected' ? 'Not Accepted' : 'Under Process'} tone={request.status === 'rejected' ? 'red' : 'amber'} />
                          </div>
                          {request.rejectionReason ? <div className="mt-2 text-xs text-rose-200">{request.rejectionReason}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ) : tab === 'institution' ? (
              <Card title="Incharge Review Queue">
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-300 mb-1">Incharge Issuer ID</label>
                      <input
                        value={institutionIssuerId}
                        onChange={(e) => setInstitutionIssuerId(e.target.value)}
                        className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="TEACHER-STUDENT-INCHARGE"
                        disabled={isInchargeRole(user.role)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => loadInstitutionData(institutionIssuerId)}
                      disabled={institutionLoading || !institutionIssuerId}
                      className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                    >
                      {institutionLoading ? 'Loading...' : 'Load Requests'}
                    </button>
                  </div>

                  <div className="text-sm text-slate-300">
                    {isInchargeRole(user.role) ? INCHARGE_ROLE_LABEL[user.role] : 'Admin technical view'} checks submitted certificates, generates the credential hash from the request data, adds accepted certificates to blockchain, and returns the hash to the student.
                  </div>

                  {inchargeRequests.length === 0 ? (
                    <div className="rounded-xl bg-slate-950/40 ring-1 ring-white/10 p-6 text-sm text-slate-400">
                      No certificate requests for this incharge yet.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {[
                        {
                          key: 'current',
                          title: 'Current Requests',
                          empty: 'No current requests.',
                          requests: currentInchargeRequests
                        },
                        {
                          key: 'history',
                          title: 'History / Preview Analyzed',
                          empty: 'No analyzed requests yet.',
                          requests: reviewedInchargeRequests
                        }
                      ].map((section) => (
                        <div key={section.key}>
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{section.title}</h4>
                            <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-300/15">{section.requests.length}</span>
                          </div>
                          {section.requests.length === 0 ? (
                            <div className="rounded-lg bg-slate-950/40 p-4 text-sm text-slate-500 ring-1 ring-white/10">{section.empty}</div>
                          ) : (
                            <div className="space-y-3">
                              {section.requests.map((request) => (
                        <div key={request.id} className="p-4 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-slate-100">{request.title}</span>
                                <Badge
                                  label={request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Not Accepted' : 'Pending'}
                                  tone={request.status === 'approved' ? 'green' : request.status === 'rejected' ? 'red' : 'amber'}
                                />
                              </div>
                              <div className="text-xs text-slate-500 mb-2">
                                {request.studentId} - {CERTIFICATE_TYPES.find((type) => type.value === request.certificateType)?.label || request.certificateType}
                              </div>
                              <div className="text-sm text-slate-300 whitespace-pre-wrap">{request.description}</div>
                              {request.filename ? (
                                <div className="mt-3 flex flex-col gap-2 rounded-lg bg-cyan-400/5 ring-1 ring-cyan-300/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-cyan-200">Uploaded Document</div>
                                    <div className="mt-1 truncate text-sm text-slate-200">{request.filename}</div>
                                    {request.fileSize ? (
                                      <div className="text-xs text-slate-500">{formatFileSize(request.fileSize)}</div>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => onOpenRequestDocument(request)}
                                    disabled={!request.hasDocument}
                                    className="shrink-0 rounded-lg bg-cyan-400/15 px-3 py-2 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-300/20 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    View Document
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-3 rounded-lg bg-slate-950/40 ring-1 ring-white/10 p-3 text-xs text-slate-500">
                                  No document uploaded with this request.
                                </div>
                              )}
                              {requestHashPreviews[request.id] ? (
                                <div className="mt-2 rounded-lg bg-slate-900/70 ring-1 ring-white/10 p-2">
                                  <div className="text-xs text-slate-500 mb-1">Generated hash preview</div>
                                  <div className="font-mono text-xs text-amber-200 break-all">{requestHashPreviews[request.id]}</div>
                                </div>
                              ) : null}
                              {request.credentialHash ? (
                                <div className="mt-2 rounded-lg bg-emerald-950/20 ring-1 ring-emerald-500/20 p-2">
                                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-xs text-emerald-300 mb-1">Returned hash</div>
                                      <div className="font-mono text-xs text-emerald-200 break-all">{request.credentialHash}</div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => copyHashToClipboard(request.credentialHash, `incharge-${request.id}`)}
                                      className="rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 px-3 py-1 text-xs font-semibold"
                                    >
                                      {copiedHashKey === `incharge-${request.id}` ? 'Copied' : 'Copy'}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              {request.rejectionReason ? <div className="mt-2 text-xs text-rose-200">{request.rejectionReason}</div> : null}
                            </div>

                            {request.status === 'pending' ? (
                              <div className="w-full md:w-64 flex flex-col gap-2">
                                <textarea
                                  value={reviewNotes[request.id] || ''}
                                  onChange={(e) => setReviewNotes((notes) => ({ ...notes, [request.id]: e.target.value }))}
                                  className="w-full rounded-xl bg-slate-900/80 ring-1 ring-white/10 px-3 py-2 text-xs text-slate-100 h-20"
                                  placeholder="Reason if not accepted"
                                />
                                <button
                                  type="button"
                                  onClick={() => onGenerateRequestHashPreview(request)}
                                  className="rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 text-xs font-semibold"
                                >
                                  Generate Hash
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    disabled={institutionLoading}
                                    onClick={() => onReviewCertificateRequest(request.id, 'rejected')}
                                    className="rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                                  >
                                    Not Accepted
                                  </button>
                                  <button
                                    type="button"
                                    disabled={institutionLoading}
                                    onClick={() => onReviewCertificateRequest(request.id, 'approved')}
                                    className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                                  >
                                    Add & Return
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {institutionError ? (
                    <div className="text-sm rounded-xl p-3 border bg-rose-500/10 border-rose-500/30 text-rose-200">
                      {institutionError}
                    </div>
                  ) : null}
                </div>
              </Card>
            ) : tab === 'zkp' ? (
              <Card title="ZKP Verification">
                <div className="flex flex-col gap-4">
                  <div className="text-sm text-slate-300">
                    Zero-Knowledge Proof allows verifying credential authenticity without revealing the actual credential data. This enables GDPR-compliant privacy-preserving verification.
                  </div>
                  
                  {zkpProof && (
                    <div className="p-3 rounded-xl bg-emerald-950/30 ring-1 ring-emerald-500/30">
                      <div className="text-xs text-emerald-300 mb-2 font-semibold">Generated ZKP Proof</div>
                      <div className="text-xs text-slate-300 mb-1">Commitment (share with verifier):</div>
                      <div className="font-mono text-xs text-slate-100 break-all mb-3 p-2 bg-slate-950/50 rounded">{zkpProof.commitment}</div>
                      <div className="text-xs text-slate-300 mb-1">Nonce (keep secret):</div>
                      <div className="font-mono text-xs text-slate-100 break-all p-2 bg-slate-950/50 rounded">{zkpProof.nonce}</div>
                    </div>
                  )}

                  {zkpVerifyResult && (
                    <div className={`p-3 rounded-xl ${zkpVerifyResult.valid ? 'bg-emerald-950/30 ring-1 ring-emerald-500/30' : 'bg-rose-950/30 ring-1 ring-rose-500/30'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge 
                          label={zkpVerifyResult.valid ? 'Proof Valid' : 'Proof Invalid'} 
                          tone={zkpVerifyResult.valid ? 'green' : 'red'} 
                        />
                      </div>
                      <div className="text-xs text-slate-300">
                        {zkpVerifyResult.valid 
                          ? 'The zero-knowledge proof is valid. The prover possesses the credential without revealing its contents.' 
                          : 'The proof verification failed. The commitment does not match the expected value.'}
                      </div>
                    </div>
                  )}

                  {!zkpProof && !zkpVerifyResult && (
                    <div className="text-sm text-slate-400">
                      Use the ZKP Tools panel on the left to generate or verify proofs.
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <AdminDashboard 
                apiBaseUrl={apiBaseUrl}
                adminLoading={adminLoading}
                setAdminLoading={setAdminLoading}
                adminError={adminError}
                setAdminError={setAdminError}
                adminStats={adminStats}
                setAdminStats={setAdminStats}
                adminStudents={adminStudents}
                setAdminStudents={setAdminStudents}
                adminIssuers={adminIssuers}
                setAdminIssuers={setAdminIssuers}
                adminCredentials={adminCredentials}
                setAdminCredentials={setAdminCredentials}
                adminDocuments={adminDocuments}
                setAdminDocuments={setAdminDocuments}
                adminActiveTab={adminActiveTab}
                setAdminActiveTab={setAdminActiveTab}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

function AuthenticatedApp() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-shell min-h-screen flex items-center justify-center">
        <div className="rounded-lg border border-cyan-100/10 bg-[#0b1220]/85 px-5 py-3 text-cyan-50 shadow-xl">
          Loading...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AppContent user={user} onLogout={logout} />;
}

