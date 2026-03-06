import { useMemo, useState } from 'react';
import { generateZkpProof, getApiBaseUrl, getStudentProfile, setApiBaseUrl, verifyByHash, verifyZkpProof } from './api.js';
import { AuthProvider, useAuth } from './auth.jsx';
import Login from './Login.jsx';

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
    <div className="rounded-2xl bg-slate-900/60 ring-1 ring-white/10 shadow-xl">
      <div className="px-5 py-4 border-b border-white/10">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
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

function AppContent() {
  const { user, getAuthHeaders, isAuthenticated, logout, loading: authLoading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [apiBaseUrl, setApiBaseUrlState] = useState(getApiBaseUrl());
  const [tab, setTab] = useState('employer');
  const [hash, setHash] = useState('');
  const [studentId, setStudentId] = useState('');
  const [issuerId, setIssuerId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const [studentLookupId, setStudentLookupId] = useState('');
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [studentProfile, setStudentProfile] = useState(null);

  // ZKP state
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

  // Institution state
  const [institutionLoading, setInstitutionLoading] = useState(false);
  const [institutionError, setInstitutionError] = useState('');
  const [institutionIssuerId, setInstitutionIssuerId] = useState('');
  const [institutionBatchName, setInstitutionBatchName] = useState('');
  const [institutionCredentials, setInstitutionCredentials] = useState('');
  const [institutionIssueStudentId, setInstitutionIssueStudentId] = useState('');
  const [institutionIssueData, setInstitutionIssueData] = useState('');
  const [institutionStats, setInstitutionStats] = useState(null);

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
      }, getAuthHeaders());
      setData(out);
    } catch (err) {
      setError(err?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function onLoadStudent(e) {
    e.preventDefault();
    setStudentError('');
    setStudentProfile(null);

    const sid = studentLookupId.trim();
    if (!sid) {
      setStudentError('Enter a student ID.');
      return;
    }

    setStudentLoading(true);
    try {
      const out = await getStudentProfile(sid, getAuthHeaders());
      setStudentProfile(out);
    } catch (err) {
      setStudentError(err?.message || 'Student lookup failed');
    } finally {
      setStudentLoading(false);
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
    } catch (err) {
      setZkpError(err?.message || 'Failed to generate ZKP proof');
    } finally {
      setZkpLoading(false);
    }
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

  function onSaveApiBaseUrl() {
    const v = apiBaseUrl.trim();
    setApiBaseUrl(v);
    setApiBaseUrlState(getApiBaseUrl());
  }

  const riskScore = data?.risk?.ok ? data.risk.riskScore : null;
  const riskTone = riskScore == null ? 'slate' : riskScore >= 70 ? 'red' : riskScore >= 40 ? 'amber' : 'green';

  // Show loading screen while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-lg">Loading DECAID...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="bg-slate-900/90 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-white">DECAID</h1>
              <span className="text-xs text-slate-400">Decentralized Academic Identity</span>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-slate-300">
                    {user?.email} ({user?.role})
                  </span>
                  <button
                    onClick={() => logout()}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-10">

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setTab('employer')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
              tab === 'employer' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
            }`}
          >
            Employer Verify
          </button>
          <button
            type="button"
            onClick={() => setTab('student')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
              tab === 'student' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
            }`}
          >
            Student Identity
          </button>
          <button
            type="button"
            onClick={() => setTab('institution')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
              tab === 'institution' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
            }`}
          >
            Institution Portal
          </button>
          <button
            type="button"
            onClick={() => setTab('zkp')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
              tab === 'zkp' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
            }`}
          >
            ZKP Tools
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 flex flex-col gap-5">
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

                  {error ? <div className="text-sm text-rose-200">{error}</div> : null}
                </form>
              </Card>
            ) : tab === 'student' ? (
              <Card title="Student Identity Lookup">
                <form onSubmit={onLoadStudent} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Student ID</label>
                    <input
                      value={studentLookupId}
                      onChange={(e) => setStudentLookupId(e.target.value)}
                      className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                      placeholder="e.g. S12345"
                    />
                  </div>

                  <button
                    disabled={studentLoading}
                    className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                  >
                    {studentLoading ? 'Loading...' : 'Load Profile'}
                  </button>

                  {studentError ? <div className="text-sm text-rose-200">{studentError}</div> : null}
                </form>
              </Card>
            ) : (
              <Card title="ZKP Tools">
                <div className="flex flex-col gap-4">
                  <div className="text-sm text-slate-300">
                    Generate a zero-knowledge proof to verify credential ownership without revealing the actual credential data.
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
                      Verify a ZKP proof without accessing the original credential data.
                    </div>
                    <form onSubmit={onVerifyZkp} className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Credential Hash</label>
                        <input
                          value={zkpVerifyHash}
                          onChange={(e) => setZkpVerifyHash(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="64-hex hash"
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Student ID</label>
                        <input
                          value={zkpVerifyStudentId}
                          onChange={(e) => setZkpVerifyStudentId(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="e.g. S12345"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Nonce</label>
                        <input
                          value={zkpVerifyNonce}
                          onChange={(e) => setZkpVerifyNonce(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="Proof nonce"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Commitment</label>
                        <input
                          value={zkpVerifyCommitment}
                          onChange={(e) => setZkpVerifyCommitment(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="64-hex commitment"
                          spellCheck={false}
                        />
                      </div>
                      <button
                        disabled={zkpVerifyLoading}
                        className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                      >
                        {zkpVerifyLoading ? 'Verifying...' : 'Verify ZKP Proof'}
                      </button>
                      {zkpVerifyError ? <div className="text-sm text-rose-200">{zkpVerifyError}</div> : null}
                    </form>

                    {zkpVerifyResult && (
                      <div className={`mt-2 p-3 rounded-xl ${zkpVerifyResult.valid ? 'bg-emerald-950/30 ring-1 ring-emerald-500/30' : 'bg-rose-950/30 ring-1 ring-rose-500/30'}`}>
                        <Badge 
                          label={zkpVerifyResult.valid ? 'ZKP Valid' : 'ZKP Invalid'} 
                          tone={zkpVerifyResult.valid ? 'green' : 'red'} 
                        />
                        <div className="mt-2 text-xs text-slate-300">
                          {zkpVerifyResult.valid 
                            ? 'The proof is valid. The prover knows the credential without revealing it.' 
                            : 'The proof is invalid. The commitment does not match.'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2 flex flex-col gap-5">
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
                        <span className="text-sm text-slate-300">Fraud Risk Score</span>
                        <span className={`text-2xl font-bold ${riskScore >= 70 ? 'text-rose-400' : riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {riskScore ?? '--'}/100
                        </span>
                      </div>
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
                      {data?.risk?.model && (
                        <div className="mt-2 text-xs text-slate-500">
                          Model: <span className="text-slate-400">{data.risk.model}</span>
                        </div>
                      )}
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
                            <span className="text-slate-500">ZKP Status</span>
                            <span className={`${data?.zkp?.status === 'verified' ? 'text-emerald-400' : data?.zkp?.status === 'invalid' ? 'text-rose-400' : 'text-slate-400'}`}>
                              {data?.zkp?.status === 'verified' ? '✓ Verified' : data?.zkp?.status === 'invalid' ? '✗ Invalid' : '○ Not Provided'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

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
              <Card title="Student Profile">
                {!studentProfile ? (
                  <div className="text-sm text-slate-400">Load a student profile to view DID and aggregated credentials.</div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Badge label={`DID: ${studentProfile.did}`} tone="slate" />
                      <Badge
                        label={
                          studentProfile.studentRiskScore == null
                            ? 'Student Risk: -'
                            : `Student Risk: ${studentProfile.studentRiskScore}/100`
                        }
                        tone={
                          studentProfile.studentRiskScore == null
                            ? 'slate'
                            : studentProfile.studentRiskScore >= 70
                              ? 'red'
                              : studentProfile.studentRiskScore >= 40
                                ? 'amber'
                                : 'green'
                        }
                      />
                      <Badge label={`Credentials: ${studentProfile.credentialCount}`} tone="slate" />
                    </div>

                    <div className="rounded-xl bg-slate-950/50 ring-1 ring-white/10 overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-xs text-slate-300">
                          <tr className="border-b border-white/10">
                            <th className="text-left px-3 py-2">Hash</th>
                            <th className="text-left px-3 py-2">IPFS</th>
                            <th className="text-left px-3 py-2">Issuer</th>
                            <th className="text-left px-3 py-2">On-chain</th>
                            <th className="text-left px-3 py-2">Revoked</th>
                            <th className="text-left px-3 py-2">Risk</th>
                            <th className="text-left px-3 py-2">Trust</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-100">
                          {(studentProfile.credentials || []).map((c) => (
                            <tr key={c.credentialHash} className="border-b border-white/5">
                              <td className="px-3 py-2 font-mono text-xs break-all max-w-[240px]">{c.credentialHash}</td>
                              <td className="px-3 py-2 font-mono text-xs break-all max-w-[220px]">{c.ipfsCid || '-'}</td>
                              <td className="px-3 py-2">{c.issuerId}</td>
                              <td className="px-3 py-2">{c.blockchain?.exists ? 'yes' : 'no'}</td>
                              <td className="px-3 py-2">{c.blockchain?.revoked ? 'yes' : 'no'}</td>
                              <td className="px-3 py-2">{c.risk?.ok ? `${c.risk.riskScore}` : '-'}</td>
                              <td className="px-3 py-2">{c.trustRank}/5</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            ) : tab === 'institution' ? (
              <Card title="Institution Portal">
                <div className="space-y-4">
                  <div className="text-sm text-slate-300">
                    Issue credentials, upload batches, and view institution statistics.
                  </div>
                  
                  {/* Issue Single Credential */}
                  <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-semibold text-slate-200 mb-3">Issue Single Credential</h4>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setInstitutionLoading(true);
                      setInstitutionError('');
                      try {
                        const authHeaders = getAuthHeaders();
                        const response = await fetch(`${getApiBaseUrl()}/api/credentials/issue`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...authHeaders
                          },
                          body: JSON.stringify({
                            studentId: institutionIssueStudentId,
                            issuerId: institutionIssuerId,
                            credentialData: institutionIssueData
                          })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Issue failed');
                        
                        // Create copyable hash notification
                        const hash = result.credentialHash;
                        const notification = document.createElement('div');
                        notification.style.cssText = `
                          position: fixed;
                          top: 20px;
                          right: 20px;
                          background: #10b981;
                          color: white;
                          padding: 16px;
                          border-radius: 8px;
                          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                          z-index: 1000;
                          max-width: 400px;
                        `;
                        notification.innerHTML = `
                          <div style="font-weight: bold; margin-bottom: 8px;">✅ Credential Issued Successfully!</div>
                          <div style="font-size: 12px; margin-bottom: 8px;">Hash (click to copy):</div>
                          <div style="
                            background: rgba(255,255,255,0.2);
                            padding: 8px;
                            border-radius: 4px;
                            font-family: monospace;
                            font-size: 11px;
                            word-break: break-all;
                            cursor: pointer;
                            user-select: all;
                          " onclick="navigator.clipboard.writeText('${hash}'); this.style.background='rgba(255,255,255,0.4)'; setTimeout(() => this.style.background='rgba(255,255,255,0.2)', 200)">${hash}</div>
                          <div style="font-size: 10px; margin-top: 8px; opacity: 0.8;">Click hash to copy to clipboard</div>
                        `;
                        document.body.appendChild(notification);
                        setTimeout(() => document.body.removeChild(notification), 8000);
                        
                        // Clear form
                        setInstitutionIssueStudentId('');
                        setInstitutionIssueData('');
                      } catch (err) {
                        setInstitutionError(err.message);
                      } finally {
                        setInstitutionLoading(false);
                      }
                    }} className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Issuer ID</label>
                        <input
                          value={institutionIssuerId}
                          onChange={(e) => setInstitutionIssuerId(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="UNI-DEMO"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Student ID</label>
                        <input
                          value={institutionIssueStudentId}
                          onChange={(e) => setInstitutionIssueStudentId(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="S-DEMO-001"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Credential Data</label>
                        <textarea
                          value={institutionIssueData}
                          onChange={(e) => setInstitutionIssueData(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100 h-20"
                          placeholder="Bachelor of Computer Science - 2024"
                        />
                      </div>
                      <button
                        disabled={institutionLoading}
                        className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                      >
                        {institutionLoading ? 'Issuing...' : 'Issue Credential'}
                      </button>
                    </form>
                  </div>

                  {/* Batch Upload */}
                  <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-semibold text-slate-200 mb-3">Batch Upload</h4>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setInstitutionLoading(true);
                      setInstitutionError('');
                      try {
                        const credentials = institutionCredentials.split('\n').filter(line => line.trim()).map(line => {
                          const [studentId, data] = line.split('|').map(s => s.trim());
                          return { studentId, credentialData: data };
                        });
                        const authHeaders = getAuthHeaders();
                        const response = await fetch(`${getApiBaseUrl()}/api/institutions/batches`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...authHeaders
                          },
                          body: JSON.stringify({
                            issuerId: institutionIssuerId,
                            batchName: institutionBatchName,
                            credentials
                          })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Batch upload failed');
                        alert(`Batch uploaded successfully!\nBatch ID: ${result.batchId}\nCredentials: ${result.credentials?.length || 0}`);
                      } catch (err) {
                        setInstitutionError(err.message);
                      } finally {
                        setInstitutionLoading(false);
                      }
                    }} className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Batch Name</label>
                        <input
                          value={institutionBatchName}
                          onChange={(e) => setInstitutionBatchName(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          placeholder="CS Graduates 2024"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Credentials (one per line: StudentID|CredentialData)</label>
                        <textarea
                          value={institutionCredentials}
                          onChange={(e) => setInstitutionCredentials(e.target.value)}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100 h-32 font-mono text-xs"
                          placeholder="S-DEMO-001|Bachelor of Computer Science&#10;S-DEMO-002|Master of AI&#10;S-DEMO-003|PhD in Data Science"
                        />
                      </div>
                      <button
                        disabled={institutionLoading}
                        className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                      >
                        {institutionLoading ? 'Uploading...' : 'Upload Batch'}
                      </button>
                    </form>
                  </div>

                  {/* View Stats */}
                  <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-semibold text-slate-200 mb-3">Institution Statistics</h4>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setInstitutionLoading(true);
                      setInstitutionError('');
                      try {
                        const response = await fetch(`${getApiBaseUrl()}/api/issuers/${institutionIssuerId}/stats`);
                        const stats = await response.json();
                        if (!response.ok) throw new Error(stats.error || 'Stats fetch failed');
                        setInstitutionStats(stats);
                      } catch (err) {
                        setInstitutionError(err.message);
                      } finally {
                        setInstitutionLoading(false);
                      }
                    }} className="flex gap-2">
                      <input
                        value={institutionIssuerId}
                        onChange={(e) => setInstitutionIssuerId(e.target.value)}
                        className="flex-1 rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="UNI-DEMO"
                      />
                      <button
                        disabled={institutionLoading}
                        className="rounded-xl bg-slate-500 hover:bg-slate-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                      >
                        {institutionLoading ? 'Loading...' : 'View Stats'}
                      </button>
                    </form>
                    
                    {institutionStats && (
                      <div className="mt-3 p-3 rounded-xl bg-slate-950/30 ring-1 ring-white/10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-slate-200">{institutionStats.totalIssuedAttempts || 0}</div>
                            <div className="text-xs text-slate-500">Total Issued</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-400">{((institutionStats.chainSuccessRate || 0) * 100).toFixed(0)}%</div>
                            <div className="text-xs text-slate-500">Success Rate</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-slate-200">{(institutionStats.avgRisk || 0).toFixed(0)}</div>
                            <div className="text-xs text-slate-500">Avg Risk</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-rose-400">{institutionStats.revocations || 0}</div>
                            <div className="text-xs text-slate-500">Revocations</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {institutionError && <div className="text-sm text-rose-200">{institutionError}</div>}
                </div>
              </Card>
            ) : (
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
            )}

            {/* Collapsible Raw JSON */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-300 transition-colors">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>View Raw JSON (Technical Details)</span>
              </summary>
              <div className="mt-2">
                <Card title="Raw JSON">
                  <pre className="text-xs text-slate-200 bg-slate-950/50 ring-1 ring-white/10 rounded-xl p-3 overflow-auto max-h-60">
                    {tab === 'employer'
                      ? (data ? JSON.stringify(data, null, 2) : '{ }')
                      : tab === 'student'
                        ? (studentProfile ? JSON.stringify(studentProfile, null, 2) : '{ }')
                        : tab === 'institution'
                          ? (institutionStats ? JSON.stringify(institutionStats, null, 2) : '{ }')
                          : (zkpProof ? JSON.stringify(zkpProof, null, 2) : zkpVerifyResult ? JSON.stringify(zkpVerifyResult, null, 2) : '{ }')}
                  </pre>
                </Card>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <Login onClose={() => setShowLogin(false)} />
      )}
    </div>
  );
}

// Wrap with AuthProvider
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
