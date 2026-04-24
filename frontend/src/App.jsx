import { useEffect, useMemo, useState } from 'react';
import { generateZkpProof, getApiBaseUrl, getStudentProfile, setApiBaseUrl, verifyByHash, verifyZkpProof, verifyZkpByCommitment, storeZkpCommitment, revokeCredential } from './api.js';
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

// Admin Dashboard Component
function AdminDashboard({ 
  apiBaseUrl, 
  adminLoading, setAdminLoading, 
  adminError, setAdminError,
  adminStats, setAdminStats,
  adminStudents, setAdminStudents,
  adminIssuers, setAdminIssuers,
  adminCredentials, setAdminCredentials,
  adminDocuments, setAdminDocuments,
  adminActiveTab, setAdminActiveTab
}) {
  
  async function loadDashboardData() {
    setAdminLoading(true);
    setAdminError('');
    try {
      // Load all data in parallel
      const [statsRes, studentsRes, issuersRes, credentialsRes, documentsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/admin/stats`),
        fetch(`${apiBaseUrl}/api/admin/students`),
        fetch(`${apiBaseUrl}/api/admin/issuers`),
        fetch(`${apiBaseUrl}/api/admin/credentials`),
        fetch(`${apiBaseUrl}/api/documents`)
      ]);

      const stats = await statsRes.json();
      const students = await studentsRes.json();
      const issuers = await issuersRes.json();
      const credentials = await credentialsRes.json();
      const documents = await documentsRes.json();

      if (stats.ok) setAdminStats(stats.stats);
      if (students.ok) setAdminStudents(students.students);
      if (issuers.ok) setAdminIssuers(issuers.issuers);
      if (credentials.ok) setAdminCredentials(credentials.credentials);
      if (documents.ok) setAdminDocuments(documents.documents);
    } catch (err) {
      setAdminError(err.message || 'Failed to load dashboard data');
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  const TabButton = ({ id, label, count }) => (
    <button
      onClick={() => setAdminActiveTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        adminActiveTab === id 
          ? 'bg-indigo-500 text-white' 
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
          adminActiveTab === id ? 'bg-white/20' : 'bg-slate-600'
        }`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <Card title="Admin Dashboard - PostgreSQL Data Viewer">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-300">
            View all data stored in PostgreSQL database
          </div>
          <button
            onClick={loadDashboardData}
            disabled={adminLoading}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            {adminLoading ? 'Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {adminError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
            ❌ {adminError}
          </div>
        )}

        {/* Stats Overview */}
        {adminStats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 text-center">
              <div className="text-2xl font-bold text-indigo-400">{adminStats.totalStudents}</div>
              <div className="text-xs text-slate-400">Students</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 text-center">
              <div className="text-2xl font-bold text-emerald-400">{adminStats.totalIssuers}</div>
              <div className="text-xs text-slate-400">Issuers</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 text-center">
              <div className="text-2xl font-bold text-amber-400">{adminStats.totalCredentials}</div>
              <div className="text-xs text-slate-400">Credentials</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 text-center">
              <div className="text-2xl font-bold text-cyan-400">{adminStats.totalDocuments}</div>
              <div className="text-xs text-slate-400">Documents</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 text-center">
              <div className="text-2xl font-bold text-purple-400">{adminStats.totalBatches}</div>
              <div className="text-xs text-slate-400">Batches</div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2">
          <TabButton id="overview" label="Overview" />
          <TabButton id="students" label="Students" count={adminStudents.length} />
          <TabButton id="issuers" label="Issuers" count={adminIssuers.length} />
          <TabButton id="credentials" label="Credentials" count={adminCredentials.length} />
          <TabButton id="documents" label="Documents" count={adminDocuments.length} />
        </div>

        {/* Tab Content */}
        <div className="mt-2">
          {adminActiveTab === 'overview' && (
            <div className="text-sm text-slate-400 p-4 rounded-xl bg-slate-800/30">
              <p className="mb-2">📊 Select a tab above to view detailed data:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Students:</strong> All student IDs with their DIDs and credential counts</li>
                <li><strong>Issuers:</strong> All institutions with their issuance statistics</li>
                <li><strong>Credentials:</strong> All issued credentials with hashes and blockchain status</li>
                <li><strong>Documents:</strong> All uploaded files stored in the database</li>
              </ul>
            </div>
          )}

          {adminActiveTab === 'students' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-white/10">
                    <th className="pb-2 text-slate-300">Student ID</th>
                    <th className="pb-2 text-slate-300">DID</th>
                    <th className="pb-2 text-slate-300">Credentials</th>
                    <th className="pb-2 text-slate-300">Documents</th>
                    <th className="pb-2 text-slate-300">Created</th>
                    <th className="pb-2 text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminStudents.map((s) => (
                    <tr key={s.student_id} className="border-b border-white/5">
                      <td className="py-2 font-mono text-slate-200">{s.student_id}</td>
                      <td className="py-2 font-mono text-xs text-slate-400">{s.did}</td>
                      <td className="py-2 text-center">
                        <span className="px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs">
                          {s.credential_count || 0}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        <span className="px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs">
                          {s.document_count || 0}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="py-2">
                        <button
                          onClick={async () => {
                            if (confirm(`Delete student ${s.student_id} and all their data?`)) {
                              try {
                                const res = await fetch(`${apiBaseUrl}/api/admin/students/${encodeURIComponent(s.student_id)}`, { method: 'DELETE' });
                                if (res.ok) {
                                  loadDashboardData();
                                } else {
                                  alert('Failed to delete student');
                                }
                              } catch (err) {
                                alert('Error deleting student');
                              }
                            }
                          }}
                          className="px-2 py-1 bg-rose-500 hover:bg-rose-400 text-white rounded text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {adminActiveTab === 'issuers' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-white/10">
                    <th className="pb-2 text-slate-300">Issuer ID</th>
                    <th className="pb-2 text-slate-300">Issued</th>
                    <th className="pb-2 text-slate-300">On Chain</th>
                    <th className="pb-2 text-slate-300">Success Rate</th>
                    <th className="pb-2 text-slate-300">Revocations</th>
                    <th className="pb-2 text-slate-300">Avg Risk</th>
                    <th className="pb-2 text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminIssuers.map((i) => (
                    <tr key={i.issuer_id} className="border-b border-white/5">
                      <td className="py-2 font-mono text-slate-200">{i.issuer_id}</td>
                      <td className="py-2 text-slate-300">{i.total_issued_attempts || 0}</td>
                      <td className="py-2 text-emerald-400">{i.total_issued_on_chain || 0}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          (i.chain_success_rate || 0) >= 0.9 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {((i.chain_success_rate || 0) * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2 text-rose-400">{i.total_revocations || 0}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          (i.avg_risk || 0) <= 30 ? 'bg-emerald-500/20 text-emerald-300' : 
                          (i.avg_risk || 0) <= 60 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {(i.avg_risk || 0).toFixed(0)}
                        </span>
                      </td>
                      <td className="py-2">
                        <button
                          onClick={async () => {
                            if (confirm(`Delete issuer ${i.issuer_id} stats?`)) {
                              try {
                                const res = await fetch(`${apiBaseUrl}/api/admin/issuers/${encodeURIComponent(i.issuer_id)}`, { method: 'DELETE' });
                                if (res.ok) {
                                  loadDashboardData();
                                } else {
                                  alert('Failed to delete issuer');
                                }
                              } catch (err) {
                                alert('Error deleting issuer');
                              }
                            }
                          }}
                          className="px-2 py-1 bg-rose-500 hover:bg-rose-400 text-white rounded text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {adminActiveTab === 'credentials' && (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-left border-b border-white/10">
                    <th className="pb-2 text-slate-300">Credential Hash</th>
                    <th className="pb-2 text-slate-300">Student</th>
                    <th className="pb-2 text-slate-300">Issuer</th>
                    <th className="pb-2 text-slate-300">On Chain</th>
                    <th className="pb-2 text-slate-300">Risk Score</th>
                    <th className="pb-2 text-slate-300">Date</th>
                    <th className="pb-2 text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminCredentials.map((c) => (
                    <tr key={c.credential_hash} className="border-b border-white/5">
                      <td className="py-2 font-mono text-xs text-slate-400">{c.credential_hash?.slice(0, 16)}...</td>
                      <td className="py-2 font-mono text-xs text-slate-300">{c.student_id}</td>
                      <td className="py-2 font-mono text-xs text-slate-300">{c.issuer_id}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          c.on_chain ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {c.on_chain ? '✓' : '✗'}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          (c.risk_score || 0) <= 30 ? 'bg-emerald-500/20 text-emerald-300' : 
                          (c.risk_score || 0) <= 60 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {c.risk_score || '-'}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
                      <td className="py-2">
                        <button
                          onClick={async () => {
                            if (confirm(`Delete credential ${c.credential_hash?.slice(0, 16)}...?`)) {
                              try {
                                const res = await fetch(`${apiBaseUrl}/api/admin/credentials/${encodeURIComponent(c.credential_hash)}`, { method: 'DELETE' });
                                if (res.ok) {
                                  loadDashboardData();
                                } else {
                                  alert('Failed to delete credential');
                                }
                              } catch (err) {
                                alert('Error deleting credential');
                              }
                            }
                          }}
                          className="px-2 py-1 bg-rose-500 hover:bg-rose-400 text-white rounded text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {adminActiveTab === 'documents' && (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-left border-b border-white/10">
                    <th className="pb-2 text-slate-300">File Name</th>
                    <th className="pb-2 text-slate-300">Credential Hash</th>
                    <th className="pb-2 text-slate-300">Student</th>
                    <th className="pb-2 text-slate-300">Size</th>
                    <th className="pb-2 text-slate-300">Type</th>
                    <th className="pb-2 text-slate-300">Uploaded</th>
                    <th className="pb-2 text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminDocuments.map((d) => (
                    <tr key={d.credential_hash || d.id} className="border-b border-white/5">
                      <td className="py-2 text-slate-200">{d.filename}</td>
                      <td className="py-2 font-mono text-xs text-slate-400">{d.credential_hash?.slice(0, 16)}...</td>
                      <td className="py-2 font-mono text-xs text-slate-300">{d.student_id}</td>
                      <td className="py-2 text-slate-400">{(d.file_size / 1024).toFixed(1)} KB</td>
                      <td className="py-2 text-xs text-slate-400">{d.content_type}</td>
                      <td className="py-2 text-xs text-slate-400">{new Date(d.uploaded_at || d.created_at).toLocaleDateString()}</td>
                      <td className="py-2">
                        <button
                          onClick={async () => {
                            if (confirm(`Delete document ${d.filename}?`)) {
                              try {
                                const res = await fetch(`${apiBaseUrl}/api/admin/documents/${d.id}`, { method: 'DELETE' });
                                if (res.ok) {
                                  loadDashboardData();
                                } else {
                                  alert('Failed to delete document');
                                }
                              } catch (err) {
                                alert('Error deleting document');
                              }
                            }
                          }}
                          className="px-2 py-1 bg-rose-500 hover:bg-rose-400 text-white rounded text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function AppContent({ user, onLogout }) {
  const [apiBaseUrl, setApiBaseUrlState] = useState(getApiBaseUrl());
  const [tab, setTab] = useState(() => {
    if (user.role === 'student') return 'student';
    if (user.role === 'institution') return 'institution';
    if (user.role === 'employer') return 'employer';
    return 'employer'; // default for admin
  });
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
  const [studentDocuments, setStudentDocuments] = useState([]);
  const [studentVerificationHistory, setStudentVerificationHistory] = useState([]);

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
  const [institutionBatchName, setInstitutionBatchName] = useState('');
  const [institutionCredentials, setInstitutionCredentials] = useState('');
  const [institutionDocument, setInstitutionDocument] = useState(null);
  const [institutionIssueStudentId, setInstitutionIssueStudentId] = useState('');
  const [institutionIssueData, setInstitutionIssueData] = useState('');
  const [institutionGenerateZkp, setInstitutionGenerateZkp] = useState(false);
  const [institutionStats, setInstitutionStats] = useState(null);
  const [institutionBatches, setInstitutionBatches] = useState([]);
  const [institutionStudents, setInstitutionStudents] = useState([]);
  const [institutionCredentialsList, setInstitutionCredentialsList] = useState([]);
  const [institutionActivity, setInstitutionActivity] = useState([]);

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

  async function onLoadStudent(e) {
    e.preventDefault();
    setStudentError('');
    setStudentProfile(null);
    setStudentDocuments([]);
    setStudentVerificationHistory([]);
    if (!studentLookupId.trim()) {
      setStudentError('Enter a student ID.');
      return;
    }

    setStudentLoading(true);
    try {
      const profile = await getStudentProfile(studentLookupId.trim());
      setStudentProfile(profile);
      
      // Fetch documents for this student
      const docsRes = await fetch(`${getApiBaseUrl()}/api/documents/student/${encodeURIComponent(studentLookupId.trim())}`);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setStudentDocuments(docsData.documents || []);
      }
      
      // Fetch verification history (simulated for now - would need backend endpoint)
      setStudentVerificationHistory([
        { date: new Date().toISOString(), verifier: 'Employer A', result: 'Valid' },
        { date: new Date(Date.now() - 86400000).toISOString(), verifier: 'Employer B', result: 'Valid' }
      ]);
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
      // Load batches for this issuer
      const batchesRes = await fetch(`${getApiBaseUrl()}/api/admin/batches`);
      if (batchesRes.ok) {
        const batchesData = await batchesRes.json();
        setInstitutionBatches((batchesData.batches || []).filter(b => b.issuer_id === issuerId));
      }

      // Load students for this issuer (from credentials)
      const credsRes = await fetch(`${getApiBaseUrl()}/api/admin/credentials`);
      if (credsRes.ok) {
        const credsData = await credsRes.json();
        console.log('[Load Institution Data] Credentials response:', credsData);
        const issuerStudents = {};
        const issuerCredentials = [];
        (credsData.credentials || []).forEach(c => {
          console.log('[Load Institution Data] Processing credential:', c);
          if (c.issuer_id === issuerId && c.student_id) {
            issuerStudents[c.student_id] = (issuerStudents[c.student_id] || 0) + 1;
            issuerCredentials.push(c);
          }
        });
        console.log('[Load Institution Data] Filtered credentials:', issuerCredentials);
        setInstitutionStudents(Object.entries(issuerStudents).map(([studentId, count]) => ({ studentId, count })));
        setInstitutionCredentialsList(issuerCredentials);
      } else {
        console.error('[Load Institution Data] Failed to fetch credentials:', credsRes.status);
      }

      // Simulate activity log
      setInstitutionActivity([
        { date: new Date().toISOString(), action: 'Credential issued', details: `Student: TEST-STUDENT-001` },
        { date: new Date(Date.now() - 3600000).toISOString(), action: 'Credential issued', details: `Student: TEST-STUDENT-002` }
      ]);
    } catch (err) {
      console.error('Failed to load institution data:', err);
    }
  }

  const riskScore = data?.risk?.ok ? data.risk.riskScore : null;
  const riskTone = riskScore == null ? 'slate' : riskScore >= 70 ? 'red' : riskScore >= 40 ? 'amber' : 'green';

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="bg-slate-900/90 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-white">DECAID</h1>
              <span className="text-xs text-slate-400">Decentralized Academic Identity</span>
              <span className="text-xs text-slate-500">|</span>
              <span className="text-xs text-slate-400">Logged in as: {user?.username} ({user?.role})</span>
            </div>
            <button
              onClick={onLogout}
              className="rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
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
              className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
                tab === 'employer' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
              }`}
            >
              Employer Verify
            </button>
          )}
          
          {(user.role === 'student' || user.role === 'admin') && (
            <button
              type="button"
              onClick={() => setTab('student')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
                tab === 'student' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
              }`}
            >
              Student Identity
            </button>
          )}
          
          {(user.role === 'institution' || user.role === 'admin') && (
            <button
              type="button"
              onClick={() => setTab('institution')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
                tab === 'institution' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
              }`}
            >
              Institution Portal
            </button>
          )}
          
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => setTab('zkp')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
                tab === 'zkp' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
              }`}
            >
              ZKP Tools
            </button>
          )}

          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => setTab('admin')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-white/10 ${
                tab === 'admin' ? 'bg-slate-200 text-slate-900' : 'bg-slate-900/60 text-slate-200'
              }`}
            >
              Admin Dashboard
            </button>
          )}
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
                        className="rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
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
                        <div className="flex items-center gap-3">
                          {data?.risk?.riskLevel && (
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              data.risk.riskLevel === 'HIGH' ? 'bg-rose-500/20 text-rose-300' :
                              data.risk.riskLevel === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {data.risk.riskLevel}
                            </span>
                          )}
                          <span className={`text-2xl font-bold ${riskScore >= 70 ? 'text-rose-400' : riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {riskScore ?? '--'}/100
                          </span>
                        </div>
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
                      {data?.risk?.reasons && data.risk.reasons.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-slate-400 mb-2">Risk Factors:</div>
                          <div className="space-y-1">
                            {data.risk.reasons.map((reason, idx) => (
                              <div key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                {reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {data?.risk?.aiScore !== undefined && data?.risk?.ruleScore !== undefined && (
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
              <Card title="Student Profile">
                {!studentProfile ? (
                  <div className="text-sm text-slate-400">Load a student profile to view DID and aggregated credentials.</div>
                ) : (
                  <div className="space-y-6">
                    {/* Profile Header */}
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

                    {/* Credentials Cards */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">My Credentials</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(studentProfile.credentials || []).map((c) => (
                          <div key={c.credentialHash} className="p-4 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-slate-200">{c.issuerId}</span>
                              <div className="flex gap-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  c.blockchain?.exists ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                                }`}>
                                  {c.blockchain?.exists ? '✓ On-chain' : '✗ Off-chain'}
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  c.risk?.ok && c.risk.riskScore <= 30 ? 'bg-emerald-500/20 text-emerald-300' : 
                                  c.risk?.ok && c.risk.riskScore <= 60 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
                                }`}>
                                  Risk: {c.risk?.ok ? c.risk.riskScore : '-'}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-400 mb-1 font-mono break-all">{c.credentialHash}</div>
                            <div className="text-xs text-slate-500">Trust: {c.trustRank}/5</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Documents */}
                    {studentDocuments.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">My Documents</h4>
                        <div className="space-y-2">
                          {studentDocuments.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div>
                                  <div className="text-sm text-slate-200">{doc.filename}</div>
                                  <div className="text-xs text-slate-500">{(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.uploaded_at || doc.created_at).toLocaleDateString()}</div>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  const byteCharacters = atob(doc.file_data);
                                  const byteNumbers = new Array(byteCharacters.length);
                                  for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                  }
                                  const byteArray = new Uint8Array(byteNumbers);
                                  const blob = new Blob([byteArray], { type: doc.content_type });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = doc.filename;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="px-3 py-1 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg text-xs font-medium"
                              >
                                Download
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Verification History */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Verification History</h4>
                      <div className="space-y-2">
                        {studentVerificationHistory.map((entry, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <div className="text-sm text-slate-200">Verified by {entry.verifier}</div>
                                <div className="text-xs text-slate-500">{new Date(entry.date).toLocaleString()}</div>
                              </div>
                            </div>
                            <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs">{entry.result}</span>
                          </div>
                        ))}
                      </div>
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
                        let ipfsCid = null;
                        
                        // Upload document directly (no IPFS needed - stores in PostgreSQL)
                        if (institutionDocument) {
                          try {
                            const formData = new FormData();
                            formData.append('file', institutionDocument);
                            
                            const uploadResponse = await fetch(`${getApiBaseUrl()}/api/ipfs/upload`, {
                              method: 'POST',
                              body: formData
                            });
                            
                            if (uploadResponse.ok) {
                              const uploadResult = await uploadResponse.json();
                              ipfsCid = uploadResult.cid;
                            } else {
                              console.warn('File upload failed, continuing without document');
                            }
                          } catch (uploadErr) {
                            console.warn('File upload error:', uploadErr);
                          }
                        }

                        const response = await fetch(`${getApiBaseUrl()}/api/credentials/issue`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            studentId: institutionIssueStudentId,
                            issuerId: institutionIssuerId,
                            credentialData: institutionIssueData,
                            ipfsCid: ipfsCid
                          })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Issue failed');
                        
                        // Save document metadata if uploaded
                        if (ipfsCid && result.credentialHash) {
                          await fetch(`${getApiBaseUrl()}/api/documents/upload`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              credentialHash: result.credentialHash,
                              studentId: institutionIssueStudentId,
                              issuerId: institutionIssuerId,
                              filename: institutionDocument.name,
                              content_type: institutionDocument.type,
                              file_size: institutionDocument.size,
                              ipfs_cid: ipfsCid
                            })
                          });
                        }
                        
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
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Document (Optional)</label>
                        <input
                          type="file"
                          onChange={(e) => setInstitutionDocument(e.target.files[0])}
                          className="w-full rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                          accept=".pdf,.jpg,.jpeg,.png"
                        />
                        {institutionDocument && (
                          <div className="text-xs text-slate-400 mt-1">
                            Selected: {institutionDocument.name}
                          </div>
                        )}
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
                        const response = await fetch(`${getApiBaseUrl()}/api/institutions/batches`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
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
                        const response = await fetch(`${getApiBaseUrl()}/api/institutions/stats/${encodeURIComponent(institutionIssuerId)}`);
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Stats fetch failed');
                        setInstitutionStats(result);
                        loadInstitutionData(institutionIssuerId);
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
                  </div>

                  {/* Load Credentials for Revocation */}
                  <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-semibold text-slate-200 mb-3">Manage Credentials (Revoke)</h4>
                    <div className="flex gap-2">
                      <input
                        value={institutionIssuerId}
                        onChange={(e) => setInstitutionIssuerId(e.target.value)}
                        className="flex-1 rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100"
                        placeholder="UNI-DEMO"
                      />
                      <button
                        onClick={async () => {
                          if (!institutionIssuerId) {
                            alert('Please enter an Issuer ID');
                            return;
                          }
                          setInstitutionLoading(true);
                          setInstitutionError('');
                          try {
                            await loadInstitutionData(institutionIssuerId);
                          } catch (err) {
                            setInstitutionError(err.message);
                          } finally {
                            setInstitutionLoading(false);
                          }
                        }}
                        disabled={institutionLoading}
                        className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold"
                      >
                        {institutionLoading ? 'Loading...' : 'Load Credentials'}
                      </button>
                    </div>
                  </div>

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

                  {/* Enhanced Institution Dashboard Sections */}
                  {institutionStats && (
                    <div className="mt-6 space-y-6">
                      {/* Batch History */}
                      {institutionBatches.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Batch History</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left border-b border-white/10">
                                  <th className="pb-2 text-slate-300">Batch Name</th>
                                  <th className="pb-2 text-slate-300">Status</th>
                                  <th className="pb-2 text-slate-300">Credentials</th>
                                  <th className="pb-2 text-slate-300">Created</th>
                                </tr>
                              </thead>
                              <tbody>
                                {institutionBatches.map((b) => (
                                  <tr key={b.batch_id || b.id} className="border-b border-white/5">
                                    <td className="py-2 text-slate-200">{b.batch_name || b.name}</td>
                                    <td className="py-2">
                                      <span className={`px-2 py-1 rounded-full text-xs ${
                                        b.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                                        b.status === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
                                      }`}>
                                        {b.status || 'Unknown'}
                                      </span>
                                    </td>
                                    <td className="py-2 text-slate-300">{b.credential_count || b.credentials?.length || 0}</td>
                                    <td className="py-2 text-slate-400 text-xs">{new Date(b.created_at).toLocaleDateString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Student List */}
                      {institutionStudents.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Students Issued</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {institutionStudents.map((s) => (
                              <div key={s.studentId} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="text-sm text-slate-200 font-mono">{s.studentId}</div>
                                    <div className="text-xs text-slate-500">{s.count} credential(s)</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Credentials with Revoke */}
                      {institutionCredentialsList.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Issued Credentials</h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {institutionCredentialsList.map((c) => (
                              <div key={c.credential_hash} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-slate-400 font-mono truncate">{c.credential_hash?.substring(0, 16)}...</div>
                                  <div className="text-xs text-slate-500">{c.student_id}</div>
                                </div>
                                <button
                                  onClick={() => onRevokeCredential(c.credential_hash)}
                                  disabled={institutionLoading}
                                  className="ml-3 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-medium disabled:opacity-50"
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Activity Log */}
                      {institutionActivity.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Activity</h4>
                          <div className="space-y-2">
                            {institutionActivity.map((activity, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 ring-1 ring-white/10">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="text-sm text-slate-200">{activity.action}</div>
                                    <div className="text-xs text-slate-500">{activity.details}</div>
                                  </div>
                                </div>
                                <div className="text-xs text-slate-400">{new Date(activity.date).toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {institutionError && (
                      <div className={`text-sm rounded-xl p-3 border ${institutionError.includes('already') || institutionError.includes('duplicate') ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{institutionError.includes('already') || institutionError.includes('duplicate') ? '⚠️' : '❌'}</span>
                          <span>{institutionError}</span>
                        </div>
                        {(institutionError.includes('already') || institutionError.includes('duplicate')) && (
                          <div className="mt-2 text-xs text-amber-300/70">
                            This credential hash already exists on the blockchain. Use the Verify tab to check its status.
                          </div>
                        )}
                      </div>
                    )}
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AppContent user={user} onLogout={logout} />;
}
