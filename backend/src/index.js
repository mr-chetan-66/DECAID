import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import ethers from 'ethers';
import { create } from 'ipfs-http-client';
import crypto from 'node:crypto';

import {
  initDatabase,
  createBatch,
  completeBatch,
  addBatchResult,
  getBatch,
  getBatchResults,
  getIssuerStats,
  updateIssuerStats,
  findResultsByHash,
  getStudentDid,
  createOrUpdateStudentDid
} from './database.js';

import {
  limiter,
  strictLimiter,
  authenticateToken,
  optionalAuth,
  generateToken,
  initDemoUsers,
  authenticateUser
} from './auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(limiter); // Apply rate limiting to all requests

// Initialize demo users
initDemoUsers();

// In-memory stores for backward compatibility during migration
const batchStore = new Map();
const issuerStats = new Map();
const studentDidStore = new Map();

// Feature flag: use PostgreSQL if available
const useDatabase = process.env.DB_HOST !== undefined;

async function getOrCreateStudentDid(studentId) {
  const id = String(studentId || '').trim();
  if (!id) return null;
  
  if (useDatabase) {
    const existing = await getStudentDid(id);
    if (existing) return existing.did;
    const created = await createStudentDid(id);
    return created.did;
  }
  
  // Fallback to in-memory
  if (!studentDidStore.has(id)) {
    studentDidStore.set(id, `did:decaid:${crypto.randomUUID()}`);
  }
  return studentDidStore.get(id);
}

async function getOrInitIssuerStats(issuerId) {
  const id = String(issuerId || '').trim();
  if (!id) return null;
  
  if (useDatabase) {
    let stats = await getIssuerStats(id);
    if (!stats) {
      stats = await initIssuerStats(id);
    }
    return {
      issuerId: stats.issuer_id,
      totalIssuedAttempts: stats.total_issued_attempts,
      totalIssuedOnChain: stats.total_issued_on_chain,
      chainErrors: stats.chain_errors,
      totalRevocations: stats.total_revocations,
      riskScoreCount: stats.risk_score_count,
      riskScoreSum: Number(stats.risk_score_sum),
      lastUpdatedAt: stats.last_updated_at
    };
  }
  
  // Fallback to in-memory
  if (!issuerStats.has(id)) {
    issuerStats.set(id, {
      issuerId: id,
      totalIssuedAttempts: 0,
      totalIssuedOnChain: 0,
      chainErrors: 0,
      totalRevocations: 0,
      riskScoreCount: 0,
      riskScoreSum: 0,
      lastUpdatedAt: new Date().toISOString()
    });
  }
  return issuerStats.get(id);
}

async function saveIssuerStats(issuerId, updates) {
  if (useDatabase) {
    const dbUpdates = {};
    if (updates.totalIssuedAttempts !== undefined) dbUpdates.total_issued_attempts = updates.totalIssuedAttempts;
    if (updates.totalIssuedOnChain !== undefined) dbUpdates.total_issued_on_chain = updates.totalIssuedOnChain;
    if (updates.chainErrors !== undefined) dbUpdates.chain_errors = updates.chainErrors;
    if (updates.totalRevocations !== undefined) dbUpdates.total_revocations = updates.totalRevocations;
    if (updates.riskScoreCount !== undefined) dbUpdates.risk_score_count = updates.riskScoreCount;
    if (updates.riskScoreSum !== undefined) dbUpdates.risk_score_sum = updates.riskScoreSum;
    await updateIssuerStats(issuerId, dbUpdates);
  }
  // Also update in-memory for consistency
  const stats = issuerStats.get(issuerId);
  if (stats) {
    Object.assign(stats, updates);
    stats.lastUpdatedAt = new Date().toISOString();
  }
}

async function computeIssuerTrustRank(issuerId) {
  const id = String(issuerId || '').trim();
  if (!id) return { rank: 3, signals: { reason: 'missing_issuerId' } };

  const s = await getOrInitIssuerStats(id);
  if (!s) {
    const lowered = id.toLowerCase();
    const rank = lowered.includes('top') || lowered.includes('gov') ? 5 : 3;
    return { rank, signals: { reason: 'no_stats' } };
  }

  const issued = Math.max(0, s.totalIssuedAttempts);
  const onChain = Math.max(0, s.totalIssuedOnChain);
  const err = Math.max(0, s.chainErrors);

  const chainSuccessRate = issued > 0 ? onChain / issued : 1.0;
  const chainErrorRate = issued > 0 ? err / issued : 0.0;
  const avgRisk = s.riskScoreCount > 0 ? s.riskScoreSum / s.riskScoreCount : 0.0;
  const revocations = Math.max(0, s.totalRevocations);

  let score = 5;
  score -= chainErrorRate >= 0.2 ? 2 : chainErrorRate >= 0.05 ? 1 : 0;
  score -= avgRisk >= 70 ? 2 : avgRisk >= 40 ? 1 : 0;
  score -= revocations >= 5 ? 2 : revocations >= 1 ? 1 : 0;
  if (issued < 5) score = Math.min(score, 4);

  const rank = Math.max(1, Math.min(5, Math.round(score)));
  return {
    rank,
    signals: {
      totalIssuedAttempts: issued,
      totalIssuedOnChain: onChain,
      chainSuccessRate,
      chainErrorRate,
      avgRisk,
      revocations
    }
  };
}

async function findIssuerIdByHash(hashHex) {
  const h = String(hashHex || '').trim().toLowerCase();
  
  if (useDatabase) {
    const results = await findResultsByHash(h);
    if (results.length > 0) {
      return results[0].issuer_id;
    }
    return null;
  }
  
  // Fallback to in-memory
  for (const record of batchStore.values()) {
    for (const r of record.results || []) {
      if (String(r.credentialHash || '').toLowerCase() === h) {
        return String(r.issuerId || '').trim() || null;
      }
    }
  }
  return null;
}

async function isDuplicateHashInBatches(hashHex) {
  const h = String(hashHex || '').toLowerCase();
  
  if (useDatabase) {
    const results = await findResultsByHash(h);
    return results.length > 1;
  }
  
  // Fallback to in-memory
  let count = 0;
  for (const record of batchStore.values()) {
    for (const r of record.results || []) {
      if (String(r.credentialHash || '').toLowerCase() === h) {
        count += 1;
        if (count > 1) return true;
      }
    }
  }
  return false;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function getIpfsClient() {
  const url = process.env.IPFS_API_URL;
  if (!url) {
    throw new Error('IPFS_API_URL not set');
  }
  return createIpfsClient({ url });
}

async function addToIpfs({ content, filename, contentType }) {
  const client = getIpfsClient();
  const res = await client.add(
    { content, path: filename || undefined },
    {
      cidVersion: 1,
      wrapWithDirectory: false,
      pin: false,
      progress: undefined,
      mtime: undefined
    }
  );
  return {
    cid: res.cid.toString(),
    size: res.size,
    filename: filename || null,
    contentType: contentType || null
  };
}

function loadRegistryArtifact() {
  const p = path.resolve(process.cwd(), 'src', 'contract', 'CredentialRegistry.json');
  const raw = fs.readFileSync(p, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed?.address || !parsed?.abi) {
    throw new Error('Invalid CredentialRegistry.json');
  }
  return parsed;
}

function getRegistry() {
  const rpcUrl = process.env.CHAIN_RPC_URL || 'http://127.0.0.1:8545';
  const pk = process.env.ISSUER_PRIVATE_KEY;
  if (!pk) {
    throw new Error('ISSUER_PRIVATE_KEY not set');
  }
  const { address, abi } = loadRegistryArtifact();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const signer = new ethers.NonceManager(wallet);
  return new ethers.Contract(address, abi, signer);
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'backend', ts: new Date().toISOString() });
});

// Authentication routes
const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = LoginRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid email or password' });
  }

  const user = authenticateUser(parsed.data.email, parsed.data.password);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  return res.json({
    ok: true,
    token,
    user: {
      userId: user.userId,
      email: user.email,
      role: user.role,
      issuerId: user.issuerId
    }
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  return res.json({
    ok: true,
    user: {
      userId: req.user.userId,
      role: req.user.role,
      issuerId: req.user.issuerId
    }
  });
});

// Blockchain issuer management
app.post('/api/blockchain/authorize-issuer', strictLimiter, authenticateToken, async (req, res) => {
  const { issuerAddress } = req.body;
  
  if (!issuerAddress || !ethers.isAddress(issuerAddress)) {
    return res.status(400).json({ ok: false, error: 'Invalid issuer address' });
  }

  try {
    const registry = getRegistry();
    const tx = await registry.authorizeIssuer(issuerAddress);
    const receipt = await tx.wait();
    
    return res.json({
      ok: true,
      txHash: receipt?.hash || tx.hash,
      issuerAddress
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/api/blockchain/deauthorize-issuer', strictLimiter, authenticateToken, async (req, res) => {
  const { issuerAddress } = req.body;
  
  if (!issuerAddress || !ethers.isAddress(issuerAddress)) {
    return res.status(400).json({ ok: false, error: 'Invalid issuer address' });
  }

  try {
    const registry = getRegistry();
    const tx = await registry.deauthorizeIssuer(issuerAddress);
    const receipt = await tx.wait();
    
    return res.json({
      ok: true,
      txHash: receipt?.hash || tx.hash,
      issuerAddress
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/api/blockchain/is-authorized/:issuerAddress', async (req, res) => {
  const { issuerAddress } = req.params;
  
  if (!issuerAddress || !ethers.isAddress(issuerAddress)) {
    return res.status(400).json({ ok: false, error: 'Invalid issuer address' });
  }

  try {
    const registry = getRegistry();
    const isAuthorized = await registry.isAuthorizedIssuer(issuerAddress);
    
    return res.json({
      ok: true,
      issuerAddress,
      isAuthorized
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const RiskRequest = z.object({
  studentId: z.string().min(1),
  issuerId: z.string().min(1),
  credentialHash: z.string().min(16),
  issuedAt: z.string().datetime().optional(),
  batchId: z.string().optional()
});

app.post('/api/risk/score', async (req, res) => {
  const parsed = RiskRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

  try {
    const r = await fetch(`${aiUrl}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data)
    });

    const body = await r.json();
    return res.status(r.status).json(body);
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'AI service unavailable' });
  }
});

const IpfsAddRequest = z.object({
  filename: z.string().optional(),
  contentBase64: z.string().min(1),
  contentType: z.string().optional()
});

app.post('/api/ipfs/add', async (req, res) => {
  const parsed = IpfsAddRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  try {
    const buf = Buffer.from(parsed.data.contentBase64, 'base64');
    const out = await addToIpfs({
      content: buf,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType
    });
    return res.json({ ok: true, ...out });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

const BatchCredential = z.object({
  studentId: z.string().min(1),
  issuerId: z.string().min(1),
  credentialData: z.string().min(1),
  issuedAt: z.string().datetime().optional(),
  certificateNumber: z.string().optional(),
  ipfsCid: z.string().optional(),
  documentBase64: z.string().optional(),
  documentFilename: z.string().optional(),
  documentContentType: z.string().optional()
});

const CreateBatchRequest = z.object({
  issuerId: z.string().min(1),
  batchId: z.string().optional(),
  credentials: z.array(BatchCredential).min(1).max(500)
});

app.post('/api/institutions/batches', strictLimiter, authenticateToken, async (req, res) => {
  const parsed = CreateBatchRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const batchId = parsed.data.batchId || crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

  const results = [];
  const registry = getRegistry();

  // Create batch record in database
  if (useDatabase) {
    await createBatch({
      batchId,
      issuerId: parsed.data.issuerId,
      startedAt,
      totalCount: parsed.data.credentials.length
    });
  }

  for (const c of parsed.data.credentials) {
    const istats = await getOrInitIssuerStats(c.issuerId);
    if (istats) {
      await saveIssuerStats(c.issuerId, {
        totalIssuedAttempts: istats.totalIssuedAttempts + 1
      });
    }

    const credentialHashHex = sha256Hex(c.credentialData);
    const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + credentialHashHex));

    let txHash = null;
    let chainError = null;
    let ipfsCid = c.ipfsCid || null;
    let ipfsError = null;
    let riskScore = null;
    let riskModel = null;
    let aiError = null;

    if (!ipfsCid && c.documentBase64) {
      try {
        const buf = Buffer.from(c.documentBase64, 'base64');
        const added = await addToIpfs({
          content: buf,
          filename: c.documentFilename,
          contentType: c.documentContentType
        });
        ipfsCid = added.cid;
      } catch (e) {
        ipfsError = String(e?.message || e);
      }
    }

    try {
      const tx = await registry.issue(credentialHashBytes32);
      const receipt = await tx.wait();
      txHash = receipt?.hash || tx.hash;
      if (istats) {
        await saveIssuerStats(c.issuerId, {
          totalIssuedOnChain: istats.totalIssuedOnChain + 1
        });
      }
    } catch (e) {
      chainError = String(e?.message || e);
      if (istats) {
        await saveIssuerStats(c.issuerId, {
          chainErrors: istats.chainErrors + 1
        });
      }
    }

    try {
      const r = await fetch(`${aiUrl}/score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          studentId: c.studentId,
          issuerId: c.issuerId,
          credentialHash: credentialHashHex,
          issuedAt: c.issuedAt,
          batchId
        })
      });
      const body = await r.json();
      if (r.ok && body?.ok) {
        riskScore = body.riskScore;
        riskModel = body.model;
        if (istats && typeof riskScore === 'number') {
          await saveIssuerStats(c.issuerId, {
            riskScoreCount: istats.riskScoreCount + 1,
            riskScoreSum: istats.riskScoreSum + riskScore
          });
        }
      } else {
        aiError = body?.error || `AI error (${r.status})`;
      }
    } catch (e) {
      aiError = String(e?.message || e);
    }

    const result = {
      studentId: c.studentId,
      issuerId: c.issuerId,
      certificateNumber: c.certificateNumber || null,
      ipfsCid,
      ipfsError,
      credentialHash: credentialHashHex,
      txHash,
      chainError,
      riskScore,
      riskModel,
      aiError
    };
    
    results.push(result);
    
    // Save to database
    if (useDatabase) {
      await addBatchResult({ batchId, ...result });
    }
  }

  const completedAt = new Date().toISOString();
  const successCount = results.filter(r => r.txHash && !r.chainError).length;
  const failedCount = results.length - successCount;

  // Complete batch in database
  if (useDatabase) {
    await completeBatch({
      batchId,
      completedAt,
      successCount,
      failedCount
    });
  }

  const record = {
    batchId,
    issuerId: parsed.data.issuerId,
    startedAt,
    completedAt,
    count: results.length,
    results
  };

  batchStore.set(batchId, record);
  return res.json({ ok: true, batchId, count: results.length });
});

app.get('/api/institutions/batches/:batchId', async (req, res) => {
  const batchId = String(req.params.batchId || '');
  
  if (useDatabase) {
    const batch = await getBatch(batchId);
    if (!batch) {
      return res.status(404).json({ ok: false, error: 'Batch not found' });
    }
    const results = await getBatchResults(batchId);
    return res.json({ 
      ok: true, 
      batch: {
        batchId: batch.batch_id,
        issuerId: batch.issuer_id,
        startedAt: batch.started_at,
        completedAt: batch.completed_at,
        count: results.length,
        results: results.map(r => ({
          studentId: r.student_id,
          issuerId: r.issuer_id,
          certificateNumber: r.certificate_number,
          ipfsCid: r.ipfs_cid,
          ipfsError: r.ipfs_error,
          credentialHash: r.credential_hash,
          txHash: r.tx_hash,
          chainError: r.chain_error,
          riskScore: r.risk_score,
          riskModel: r.risk_model,
          aiError: r.ai_error
        }))
      }
    });
  }
  
  // Fallback to in-memory
  const record = batchStore.get(batchId);
  if (!record) {
    return res.status(404).json({ ok: false, error: 'Batch not found' });
  }
  return res.json({ ok: true, batch: record });
});

app.get('/api/issuers/:issuerId/trust-rank', async (req, res) => {
  const issuerId = String(req.params.issuerId || '').trim();
  if (!issuerId) return res.status(400).json({ ok: false, error: 'issuerId required' });
  const r = await computeIssuerTrustRank(issuerId);
  return res.json({ ok: true, issuerId, trustRank: r.rank, signals: r.signals });
});

app.get('/api/issuers', async (req, res) => {
  if (useDatabase) {
    // Return empty array for now - would need a list function in database.js
    return res.json({ ok: true, issuers: [] });
  }
  return res.json({ ok: true, issuers: Array.from(issuerStats.values()) });
});

app.post('/api/students/:studentId/did', async (req, res) => {
  const studentId = String(req.params.studentId || '').trim();
  if (!studentId) return res.status(400).json({ ok: false, error: 'studentId required' });
  const did = await getOrCreateStudentDid(studentId);
  return res.json({ ok: true, studentId, did });
});

app.get('/api/students/:studentId/profile', async (req, res) => {
  const studentId = String(req.params.studentId || '').trim();
  if (!studentId) return res.status(400).json({ ok: false, error: 'studentId required' });

  const did = await getOrCreateStudentDid(studentId);
  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

  let matches = [];
  if (useDatabase) {
    const dbResults = await findResultsByStudent(studentId);
    matches = dbResults.map(r => ({
      batchId: r.batch_id,
      credentialHash: r.credential_hash,
      issuerId: r.issuer_id,
      certificateNumber: r.certificate_number || null,
      ipfsCid: r.ipfs_cid || null,
      ipfsError: r.ipfs_error || null,
      txHash: r.tx_hash || null,
      chainError: r.chain_error || null,
      riskScore: typeof r.risk_score === 'number' ? r.risk_score : null,
      riskModel: r.risk_model || null,
      aiError: r.ai_error || null,
      createdAt: r.batch_started_at
    }));
  } else {
    // Fallback to in-memory
    for (const record of batchStore.values()) {
      for (const r of record.results || []) {
        if (String(r.studentId || '').trim() === studentId) {
          matches.push({
            batchId: record.batchId,
            credentialHash: r.credentialHash,
            issuerId: r.issuerId,
            certificateNumber: r.certificateNumber || null,
            ipfsCid: r.ipfsCid || null,
            ipfsError: r.ipfsError || null,
            txHash: r.txHash || null,
            chainError: r.chainError || null,
            riskScore: typeof r.riskScore === 'number' ? r.riskScore : null,
            riskModel: r.riskModel || null,
            aiError: r.aiError || null,
            createdAt: record.completedAt
          });
        }
      }
    }
  }

  let registry;
  try {
    registry = getRegistry();
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }

  const credentials = [];
  for (const c of matches) {
    const hashHex = String(c.credentialHash || '').trim().toLowerCase();
    let blockchain = null;
    try {
      const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + hashHex));
      const [exists, issuerAddress, issuedAt, revoked] = await registry.verify(credentialHashBytes32);
      blockchain = {
        exists,
        issuerAddress,
        issuedAt: Number(issuedAt),
        revoked
      };
    } catch (e) {
      blockchain = { error: String(e?.message || e) };
    }

    // If batch scoring failed/missing, compute a fresh risk score
    let risk = null;
    if (c.riskScore != null && c.riskModel) {
      risk = { ok: true, riskScore: c.riskScore, model: c.riskModel };
    } else {
      try {
        const r = await fetch(`${aiUrl}/score`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ studentId, issuerId: c.issuerId, credentialHash: hashHex })
        });
        const body = await r.json();
        if (r.ok && body?.ok) {
          risk = { ok: true, riskScore: body.riskScore, model: body.model };
        } else {
          risk = { ok: false, error: body?.error || `AI error (${r.status})` };
        }
      } catch (e) {
        risk = { ok: false, error: String(e?.message || e) };
      }
    }

    const trust = await computeIssuerTrustRank(c.issuerId);
    const duplicateDetected = await isDuplicateHashInBatches(hashHex);
    credentials.push({
      ...c,
      credentialHash: hashHex,
      blockchain,
      risk,
      trustRank: trust.rank,
      trustSignals: trust.signals,
      duplicateDetected
    });
  }

  // Student level risk: max of known risk scores
  const numericRisks = credentials.map((x) => (x?.risk?.ok ? x.risk.riskScore : null)).filter((v) => typeof v === 'number');
  const studentRiskScore = numericRisks.length ? Math.max(...numericRisks) : null;

  return res.json({
    ok: true,
    studentId,
    did,
    credentialCount: credentials.length,
    studentRiskScore,
    credentials
  });
});

const VerifyByHashQuery = z.object({
  studentId: z.string().min(1).optional(),
  issuerId: z.string().min(1).optional()
});

app.get('/api/verify/by-hash/:hash', optionalAuth, async (req, res) => {
  const h = String(req.params.hash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) {
    return res.status(400).json({ ok: false, error: 'Invalid hash' });
  }

  const q = VerifyByHashQuery.safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ ok: false, error: q.error.flatten() });
  }

  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + h));

  let chain = null;
  try {
    const registry = getRegistry();
    const [exists, issuerAddress, issuedAt, revoked] = await registry.verify(credentialHashBytes32);
    chain = {
      exists,
      issuerAddress,
      issuedAt: Number(issuedAt),
      revoked
    };
  } catch (e) {
    return res.status(502).json({ ok: false, error: `Blockchain unavailable: ${String(e?.message || e)}` });
  }

  const issuerId = q.data.issuerId || null;
  const studentId = q.data.studentId || null;

  // Best-effort IPFS CID lookup from prior batch uploads
  let ipfsCid = null;
  if (useDatabase) {
    const dbResults = await findResultsByHash(h);
    if (dbResults.length > 0 && dbResults[0].ipfs_cid) {
      ipfsCid = dbResults[0].ipfs_cid;
    }
  } else {
    // Fallback to in-memory
    for (const record of batchStore.values()) {
      const found = (record.results || []).find((r) => String(r.credentialHash || '').toLowerCase() === h);
      if (found?.ipfsCid) {
        ipfsCid = found.ipfsCid;
        break;
      }
    }
  }

  // Calculate risk score - try to find missing IDs from batch data if not provided
  let risk = { ok: false, error: 'Insufficient data for risk assessment' };
  let effectiveStudentId = studentId;
  let effectiveIssuerId = issuerId;
  
  // If studentId or issuerId missing, try to find from batch data
  if ((!studentId || !issuerId) && useDatabase) {
    const dbResults = await findResultsByHash(h);
    if (dbResults.length > 0) {
      effectiveStudentId = effectiveStudentId || dbResults[0].student_id;
      effectiveIssuerId = effectiveIssuerId || dbResults[0].issuer_id;
    }
  }
  
  // Fallback to in-memory if database doesn't have the data
  if ((!effectiveStudentId || !effectiveIssuerId) && !useDatabase) {
    for (const record of batchStore.values()) {
      const found = (record.results || []).find((r) => String(r.credentialHash || '').toLowerCase() === h);
      if (found) {
        effectiveStudentId = effectiveStudentId || found.studentId;
        effectiveIssuerId = effectiveIssuerId || found.issuerId;
        break;
      }
    }
  }
  
  // Calculate risk if we have the required data
  if (effectiveStudentId && effectiveIssuerId) {
    try {
      const r = await fetch(`${aiUrl}/score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          studentId: effectiveStudentId, 
          issuerId: effectiveIssuerId, 
          credentialHash: h 
        })
      });
      const body = await r.json();
      if (r.ok && body?.ok) {
        risk = { ok: true, riskScore: body.riskScore, model: body.model };
      } else {
        risk = { ok: false, error: body?.error || `AI error (${r.status})` };
      }
    } catch (e) {
      risk = { ok: false, error: String(e?.message || e) };
    }
  }

  const duplicateDetected = await isDuplicateHashInBatches(h);
  const computedIssuerId = issuerId || await findIssuerIdByHash(h);
  const trust = await computeIssuerTrustRank(computedIssuerId);

  let zkp = { status: 'not_provided' };
  if (q.data?.zkpCommitment && q.data?.nonce) {
    const valid = verifyZkpProof(h, studentId, q.data.nonce, q.data.zkpCommitment);
    zkp = {
      status: valid ? 'verified' : 'invalid',
      commitment: q.data.zkpCommitment,
      valid
    };
  }

  return res.json({
    ok: true,
    credentialHash: h,
    ipfsCid,
    blockchain: chain,
    risk,
    trustRank: trust.rank,
    trustSignals: trust.signals,
    duplicateDetected,
    zkp
  });
});

const IssueRequest = z.object({
  studentId: z.string().min(1),
  issuerId: z.string().min(1),
  credentialData: z.string().min(1),
  issuedAt: z.string().datetime().optional(),
  batchId: z.string().optional()
});

app.post('/api/credentials/issue', strictLimiter, authenticateToken, async (req, res) => {
  const parsed = IssueRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const credentialHashHex = sha256Hex(parsed.data.credentialData);
  const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + credentialHashHex));

  try {
    const registry = getRegistry();
    const tx = await registry.issue(credentialHashBytes32);
    const receipt = await tx.wait();
    return res.json({
      ok: true,
      credentialHash: credentialHashHex,
      txHash: receipt?.hash || tx.hash
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const RevokeRequest = z.object({
  credentialHash: z.string().regex(/^[0-9a-fA-F]{64}$/)
});

app.post('/api/credentials/revoke', strictLimiter, authenticateToken, async (req, res) => {
  const parsed = RevokeRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const hash = String(parsed.data.credentialHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return res.status(400).json({ ok: false, error: 'Invalid hash' });
  }

  const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + hash));

  try {
    const registry = getRegistry();
    const tx = await registry.revoke(credentialHashBytes32);
    const receipt = await tx.wait();

    const issuerId = await findIssuerIdByHash(hash);
    if (issuerId) {
      const istats = await getOrInitIssuerStats(issuerId);
      if (istats) {
        await saveIssuerStats(issuerId, {
          totalRevocations: istats.totalRevocations + 1
        });
      }
    }

    return res.json({ ok: true, txHash: receipt?.hash || tx.hash });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/api/credentials/verify/:hash', async (req, res) => {
  const h = String(req.params.hash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) {
    return res.status(400).json({ ok: false, error: 'Invalid hash' });
  }

  const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + h));

  try {
    const registry = getRegistry();
    const [exists, issuer, issuedAt, revoked] = await registry.verify(credentialHashBytes32);
    return res.json({
      ok: true,
      credentialHash: h,
      exists,
      issuer,
      issuedAt: Number(issuedAt),
      revoked
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const ZkpProofRequest = z.object({
  credentialHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  studentId: z.string().min(1),
  nonce: z.string().min(1).optional()
});

function generateZkpCommitment(credentialHash, studentId, nonce) {
  const effectiveNonce = nonce || crypto.randomUUID();
  const preimage = `${credentialHash}:${studentId}:${effectiveNonce}`;
  const commitment = sha256Hex(preimage);
  return { commitment, nonce: effectiveNonce, preimage };
}

function verifyZkpProof(credentialHash, studentId, nonce, commitment) {
  const expected = generateZkpCommitment(credentialHash, studentId, nonce);
  return expected.commitment === commitment;
}

app.post('/api/zkp/generate', (req, res) => {
  const parsed = ZkpProofRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { credentialHash, studentId, nonce } = parsed.data;
  const { commitment, nonce: usedNonce } = generateZkpCommitment(credentialHash, studentId, nonce);

  return res.json({
    ok: true,
    credentialHash,
    commitment,
    nonce: usedNonce,
    algorithm: 'SHA-256-commitment-v1'
  });
});

const ZkpVerifyRequest = z.object({
  credentialHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  studentId: z.string().min(1),
  nonce: z.string().min(1),
  commitment: z.string().regex(/^[0-9a-fA-F]{64}$/)
});

app.post('/api/zkp/verify', (req, res) => {
  const parsed = ZkpVerifyRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { credentialHash, studentId, nonce, commitment } = parsed.data;
  const valid = verifyZkpProof(credentialHash, studentId, nonce, commitment);

  return res.json({
    ok: true,
    valid,
    credentialHash,
    commitment,
    verifiedAt: new Date().toISOString()
  });
});

const port = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    if (useDatabase) {
      await initDatabase();
      console.log('PostgreSQL database initialized');
    } else {
      console.log('Running with in-memory storage (DB_HOST not set)');
    }
  } catch (err) {
    console.error('Failed to initialize database:', err);
    console.log('Falling back to in-memory storage');
  }
  
  app.listen(port, () => {
    console.log(`Backend listening on http://127.0.0.1:${port}`);
  });
}

startServer();
