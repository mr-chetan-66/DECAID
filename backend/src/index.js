import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { ethers } from 'ethers';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

import {
  initDatabase,
  createBatch,
  completeBatch,
  addBatchResult,
  getBatch,
  getBatchResults,
  getAllBatches,
  getIssuerStats,
  initIssuerStats,
  updateIssuerStats,
  findResultsByHash,
  findResultsByStudent,
  getStudentDid,
  createStudentDid,
  saveDocument,
  getDocumentByCredentialHash,
  getDocumentsByStudent,
  getDocumentsByIssuer,
  getAllDocuments,
  deleteDocument,
  getAllStudents,
  getAllIssuers,
  getAllCredentials,
  deleteStudent,
  deleteCredential,
  deleteDocumentById,
  deleteIssuer
} from './database.js';

import {
  limiter,
  strictLimiter,
  authenticateToken,
  optionalAuth,
  generateToken,
  initDemoUsers,
  authenticateUser,
  verifyGoogleToken,
  authenticateGoogleUser,
  requireRole,
  requireInstitutionAccess,
  requireStudentAccess,
  requireAdmin
} from './auth.js';

import {
  updateUserRoleByEmail
} from './database.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// app.use(limiter); // Rate limiting disabled

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Initialize demo users
initDemoUsers();

// In-memory stores for backward compatibility during migration
const batchStore = new Map();
const issuerStats = new Map();
const studentDidStore = new Map();
const individualCredentialStore = new Map(); // Store individual credentials
const documentsStore = new Map(); // Store document metadata

// Feature flag: use PostgreSQL if available
const useDatabase = process.env.DB_HOST !== undefined;

async function getOrCreateStudentDid(studentId) {
  const id = String(studentId || '').trim();
  if (!id) return null;
  
  if (useDatabase) {
    const existing = await getStudentDid(id);
    if (existing) return existing.did;
    const created = await createStudentDid(id);
    if (created) return created.did;
    // If database fails, fall through to in-memory
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
    if (stats) {
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
    // If database unavailable, fall through to in-memory
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

// Built-in risk scoring function (replaces external AI service)
function calculateRiskScore({ studentId, issuerId, credentialHash }) {
  let risk = 0;
  
  // Check hash validity
  const h = String(credentialHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) {
    return { ok: true, riskScore: 100, model: 'heuristic_builtin' };
  }
  
  // Check for suspicious patterns
  if (h.length !== 64) {
    risk += 20;
  }
  
  // Check if hash is all zeros or all same character
  if (/^0+$/.test(h) || /^([0-9a-f])\\1+$/.test(h)) {
    risk += 50;
  }
  
  // Short IDs can be suspicious
  if (studentId && studentId.length < 5) {
    risk += 10;
  }
  
  if (issuerId && issuerId.length < 3) {
    risk += 10;
  }
  
  // Very short or very long issuer IDs
  if (issuerId && (issuerId.length > 50)) {
    risk += 5;
  }
  
  // Clamp to 0-100
  risk = Math.max(0, Math.min(100, risk));
  
  return { ok: true, riskScore: risk, model: 'heuristic_builtin' };
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

// Google OAuth authentication routes
const GoogleAuthRequest = z.object({
  token: z.string().min(1)
});

app.post('/api/auth/google', async (req, res) => {
  const parsed = GoogleAuthRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid Google token' });
  }

  try {
    // Check if this is a demo token
    if (parsed.data.token.startsWith('demo-token-')) {
      const role = parsed.data.token.split('-')[2];
      const demoUsers = {
        institution: {
          email: 'institution@decaid.com',
          name: 'Demo Institution',
          role: 'institution',
          issuerId: 'DEMO-UNIVERSITY',
          studentId: null
        },
        employer: {
          email: 'employer@decaid.com',
          name: 'Demo Employer',
          role: 'employer',
          issuerId: null,
          studentId: null
        },
        student: {
          email: 'student@decaid.com',
          name: 'Demo Student',
          role: 'student',
          issuerId: null,
          studentId: 'DEMO-STUDENT-001'
        }
      };

      const demoUser = demoUsers[role];
      if (!demoUser) {
        return res.status(400).json({ ok: false, error: 'Invalid demo role' });
      }

      const user = await authenticateGoogleUser({
        email: demoUser.email,
        name: demoUser.name,
        picture: null,
        googleId: `demo-google-${role}`
      });

      // Update user with role-specific data
      if (role === 'institution') {
        await updateUserRoleByEmail(user.email, { issuerId: demoUser.issuerId });
      } else if (role === 'student') {
        await updateUserRoleByEmail(user.email, { studentId: demoUser.studentId });
      } else {
        await updateUserRoleByEmail(user.email, { role: demoUser.role });
      }

      // Get updated user data
      const updatedUser = await getUserByEmail(user.email);
      const token = generateToken({
        userId: updatedUser.user_id,
        email: updatedUser.email,
        role: updatedUser.role,
        issuerId: updatedUser.issuer_id,
        studentId: updatedUser.student_id
      });

      return res.json({
        ok: true,
        token,
        user: {
          userId: updatedUser.user_id,
          email: updatedUser.email,
          name: updatedUser.name,
          picture: updatedUser.picture,
          role: updatedUser.role,
          issuerId: updatedUser.issuer_id,
          studentId: updatedUser.student_id,
          needsOnboarding: false
        }
      });
    }

    // Real Google OAuth flow
    const googleData = await verifyGoogleToken(parsed.data.token);
    const user = await authenticateGoogleUser(googleData);
    const token = generateToken(user);
    
    return res.json({
      ok: true,
      token,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        issuerId: user.issuerId,
        studentId: user.studentId,
        needsOnboarding: user.needsOnboarding
      }
    });
  } catch (error) {
    return res.status(401).json({ ok: false, error: error.message });
  }
});

const RoleOnboardingRequest = z.object({
  role: z.enum(['student', 'institution', 'employer']),
  issuerId: z.string().optional(),
  studentId: z.string().optional()
});

app.post('/api/auth/onboarding', authenticateToken, async (req, res) => {
  const parsed = RoleOnboardingRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { role, issuerId, studentId } = parsed.data;
  
  // Validate role-specific requirements
  if (role === 'institution' && !issuerId) {
    return res.status(400).json({ ok: false, error: 'Issuer ID required for institution role' });
  }
  
  if (role === 'student' && !studentId) {
    return res.status(400).json({ ok: false, error: 'Student ID required for student role' });
  }

  try {
    const updatedUser = await updateUserRoleByEmail(req.user.email, {
      role,
      issuerId: role === 'institution' ? issuerId : null,
      studentId: role === 'student' ? studentId : null
    });

    const newToken = generateToken({
      userId: updatedUser.user_id,
      email: updatedUser.email,
      role: updatedUser.role,
      issuerId: updatedUser.issuer_id,
      studentId: updatedUser.student_id
    });

    return res.json({
      ok: true,
      token: newToken,
      user: {
        userId: updatedUser.user_id,
        email: updatedUser.email,
        role: updatedUser.role,
        issuerId: updatedUser.issuer_id,
        studentId: updatedUser.student_id,
        needsOnboarding: false
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Failed to update user role' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  return res.json({
    ok: true,
    user: {
      userId: req.user.userId,
      email: req.user.email,
      role: req.user.role,
      issuerId: req.user.issuerId,
      studentId: req.user.studentId
    }
  });
});

// Blockchain issuer management - Admin only
app.post('/api/blockchain/authorize-issuer', strictLimiter, authenticateToken, requireAdmin, async (req, res) => {
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

app.post('/api/blockchain/deauthorize-issuer', strictLimiter, authenticateToken, requireAdmin, async (req, res) => {
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

// Direct file add endpoint (replaces IPFS - stores in temp storage)
app.post('/api/ipfs/add', async (req, res) => {
  const parsed = IpfsAddRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  try {
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tempFileStore.set(fileId, {
      fileData: parsed.data.contentBase64,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      uploadedAt: new Date()
    });
    return res.json({ 
      ok: true, 
      cid: fileId,
      size: parsed.data.contentBase64.length,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType
    });
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

app.post('/api/institutions/batches', strictLimiter, async (req, res) => {
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

    // Include studentId and issuerId in hash to make it unique per student
    const credentialHashHex = sha256Hex(`${c.studentId}:${c.issuerId}:${c.credentialData}`);
    const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + credentialHashHex));

    let txHash = null;
    let chainError = null;
    let ipfsCid = c.ipfsCid || null;
    let ipfsError = null;
    let riskScore = null;
    let riskModel = null;
    let aiError = null;

    if (!ipfsCid && c.documentBase64) {
      // Store document directly in temp storage (no IPFS needed)
      const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      tempFileStore.set(fileId, {
        fileData: c.documentBase64,
        filename: c.documentFilename,
        contentType: c.documentContentType,
        uploadedAt: new Date()
      });
      ipfsCid = fileId;
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

app.post('/api/students/:studentId/did', authenticateToken, requireStudentAccess, async (req, res) => {
  const studentId = req.user.studentId; // Use authenticated user's student ID
  const did = await getOrCreateStudentDid(studentId);
  return res.json({ ok: true, studentId, did });
});

app.get('/api/students/:studentId/profile', async (req, res) => {
  const studentId = req.params.studentId;
  
  const did = await getOrCreateStudentDid(studentId);
  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

  let matches = [];
  
  // Check individual credential store first (for individually issued credentials)
  for (const [hash, cred] of individualCredentialStore.entries()) {
    if (cred.studentId === studentId) {
      matches.push({
        batchId: 'individual-credential',
        credentialHash: hash,
        issuerId: cred.issuerId,
        certificateNumber: null,
        ipfsCid: null,
        ipfsError: null,
        txHash: cred.txHash || null,
        chainError: null,
        riskScore: null,
        riskModel: null,
        aiError: null,
        createdAt: cred.issuedAt || cred.createdAt
      });
    }
  }
  
  if (useDatabase) {
    const dbResults = await findResultsByStudent(studentId);
    matches.push(...dbResults.map(r => ({
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
    })));
  } else {
    // Fallback to in-memory batch store
    for (const record of batchStore.values()) {
      for (const r of record.results || []) {
        if (r.studentId === studentId) {
          matches.push({
            batchId: record.batchId,
            credentialHash: r.credentialHash,
            issuerId: r.issuerId,
            certificateNumber: r.certificateNumber || null,
            ipfsCid: r.ipfsCid || null,
            ipfsError: r.ipfsError || null,
            txHash: r.txHash || null,
            chainError: r.chainError || null,
            riskScore: r.riskScore || null,
            riskModel: r.riskModel || null,
            aiError: r.aiError || null,
            createdAt: record.startedAt
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
      // Use same cache key as verification endpoint
      const cacheKey = `${studentId}:${c.issuerId}:${hashHex}`;
      if (riskScoreCache.has(cacheKey)) {
        risk = riskScoreCache.get(cacheKey);
      } else {
        try {
          // Get issuer trust and stats (same as verification endpoint)
          const issuerStats = await getOrInitIssuerStats(c.issuerId);
          const issuerTrustScore = issuerStats ? issuerStats.trustRank || 3 : 3;
          const credentialCount = issuerStats ? issuerStats.totalIssuedAttempts || 1 : 1;
          
          // Get student credential count
          let studentCredentialCount = 1;
          if (useDatabase) {
            const studentResults = await findResultsByStudent(studentId);
            studentCredentialCount = studentResults.length || 1;
          }
          
          const r = await fetch(`${aiUrl}/score`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ 
              studentId, 
              issuerId: c.issuerId, 
              credentialHash: hashHex, 
              batchId: 'individual-credential-batch',
              issuerTrustScore,
              credentialCount,
              studentCredentialCount,
              timeGap: 86400.0,
              duplicateFlag: 0,
              batchSize: 1
            })
          });
          const body = await r.json();
          if (r.ok && body?.ok) {
            risk = { 
              ok: true, 
              riskScore: body.riskScore, 
              model: body.model,
              riskLevel: body.riskLevel,
              reasons: body.reasons,
              aiScore: body.aiScore,
              ruleScore: body.ruleScore
            };
            // Cache the result
            riskScoreCache.set(cacheKey, risk);
          } else {
            risk = { ok: false, error: body?.error || `AI error (${r.status})` };
          }
        } catch (e) {
          risk = { ok: false, error: String(e?.message || e) };
        }
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

  // Calculate risk score - use provided IDs or try to find from batch data
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
  let storedStudentId = null;
  let storedIssuerId = null;
  if (!useDatabase) {
    for (const record of batchStore.values()) {
      const found = (record.results || []).find((r) => String(r.credentialHash || '').toLowerCase() === h);
      if (found) {
        storedStudentId = found.studentId;
        storedIssuerId = found.issuerId;
        effectiveStudentId = effectiveStudentId || found.studentId;
        effectiveIssuerId = effectiveIssuerId || found.issuerId;
        break;
      }
    }
    // Check individual credential store too
    if (!storedStudentId) {
      const individualCred = individualCredentialStore.get(h);
      if (individualCred) {
        storedStudentId = individualCred.studentId;
        storedIssuerId = individualCred.issuerId;
        effectiveStudentId = effectiveStudentId || individualCred.studentId;
        effectiveIssuerId = effectiveIssuerId || individualCred.issuerId;
      }
    }
  }

  // Validate student ID if provided - check if it matches the stored credential
  if (studentId && storedStudentId && studentId !== storedStudentId) {
    return res.status(403).json({
      ok: false,
      error: `Student ID mismatch: The credential was issued to '${storedStudentId}', not '${studentId}'. Please verify the correct Student ID.`,
      code: "STUDENT_ID_MISMATCH",
      providedStudentId: studentId,
      expectedStudentId: storedStudentId,
      credentialHash: h
    });
  }

  // Calculate risk using AI service with behavioral features
  if (effectiveStudentId && effectiveIssuerId) {
    // Check cache first
    const cacheKey = `${effectiveStudentId}:${effectiveIssuerId}:${h}`;
    if (riskScoreCache.has(cacheKey)) {
      risk = riskScoreCache.get(cacheKey);
    } else {
      try {
        // Get issuer trust and stats
        const issuerStats = await getOrInitIssuerStats(effectiveIssuerId);
        const issuerTrustScore = issuerStats ? issuerStats.trustRank || 3 : 3;
        const credentialCount = issuerStats ? issuerStats.totalIssuedAttempts || 1 : 1;
        
        // Get student credential count
        let studentCredentialCount = 1;
        if (useDatabase) {
          const studentResults = await findResultsByStudent(effectiveStudentId);
          studentCredentialCount = studentResults.length || 1;
        }
        
        // Calculate time gap (simplified - would need timestamp tracking)
        const timeGap = 86400.0; // Default to 1 day
        
        // Check for duplicate hash
        const duplicateDetected = await isDuplicateHashInBatches(h);
        console.log(`[Duplicate Check] Hash: ${h.substring(0, 8)}..., DuplicateDetected: ${duplicateDetected}`);

        // Check for content duplicate (same credential data issued to different students)
        let contentDuplicateDetected = false;
        if (useDatabase) {
          // Check if this issuer has issued the same credential data to other students
          const allIssuerResults = await findResultsByIssuer(effectiveIssuerId);
          // This is a simplified check - in production, you'd store credential data separately
          // For now, we'll flag if the issuer has many credentials to different students
          const uniqueStudents = new Set(allIssuerResults.map(r => r.student_id));
          if (uniqueStudents.size > 5 && credentialCount > uniqueStudents.size) {
            contentDuplicateDetected = true;
          }
        }
        
        // Get batch size if available
        const batchSize = 1; // Default to individual issuance
        
        const duplicateFlag = duplicateDetected || contentDuplicateDetected ? 1 : 0;
        console.log(`[AI Service Request] duplicateFlag: ${duplicateFlag}, duplicateDetected: ${duplicateDetected}, contentDuplicateDetected: ${contentDuplicateDetected}`);

        const r = await fetch(`${aiUrl}/score`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            studentId: effectiveStudentId,
            issuerId: effectiveIssuerId,
            credentialHash: h,
            batchId: 'verification-batch',
            issuerTrustScore,
            credentialCount,
            studentCredentialCount,
            timeGap,
            duplicateFlag,
            batchSize
          })
        });
        const body = await r.json();
        if (r.ok && body?.ok) {
          risk = { 
            ok: true, 
            riskScore: body.riskScore, 
            model: body.model,
            riskLevel: body.riskLevel,
            reasons: body.reasons,
            aiScore: body.aiScore,
            ruleScore: body.ruleScore
          };
          // Cache the result
          riskScoreCache.set(cacheKey, risk);
        } else {
          // Fallback to heuristic if AI service fails
          risk = calculateRiskScore({
            studentId: effectiveStudentId,
            issuerId: effectiveIssuerId,
            credentialHash: h
          });
          risk.aiError = body?.error || `AI error (${r.status})`;
          riskScoreCache.set(cacheKey, risk);
        }
      } catch (e) {
        // Fallback to heuristic if AI service is unavailable
        risk = calculateRiskScore({
          studentId: effectiveStudentId,
          issuerId: effectiveIssuerId,
          credentialHash: h
        });
        risk.aiError = String(e?.message || e);
        riskScoreCache.set(cacheKey, risk);
      }
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

app.post('/api/credentials/issue', async (req, res) => {
  const parsed = IssueRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  // Include studentId and issuerId in hash to make it unique per student
  const credentialHashHex = sha256Hex(`${parsed.data.studentId}:${parsed.data.issuerId}:${parsed.data.credentialData}`);
  const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + credentialHashHex));

  try {
    // Duplicate checks removed for testing duplicate score detection
    // Check if credential already exists in database (before blockchain check)
    // if (useDatabase) {
    //   const existingResults = await findResultsByHash(credentialHashHex);
    //   if (existingResults.length > 0) {
    //     return res.status(409).json({
    //       ok: false,
    //       error: "Credential already exists in database",
    //       code: "ALREADY_ISSUED",
    //       credentialHash: credentialHashHex,
    //       duplicate: true
    //     });
    //   }
    // }

    // Check if credential already exists on blockchain
    const registry = getRegistry();
    const [exists] = await registry.verify(credentialHashBytes32);
    if (exists) {
      // Allow re-issuing for testing - will be caught by duplicate detection in risk scoring
      // return res.status(409).json({
      //   ok: false,
      //   error: "Credential already exists on blockchain",
      //   code: "ALREADY_ISSUED",
      //   credentialHash: credentialHashHex,
      //   duplicate: true
      // });
    }

    const tx = await registry.issue(credentialHashBytes32);
    const receipt = await tx.wait();

    const issuedAt = parsed.data.issuedAt || new Date().toISOString();

    // Store individual credential for student profile lookup
    individualCredentialStore.set(credentialHashHex, {
      studentId: parsed.data.studentId,
      issuerId: parsed.data.issuerId,
      credentialData: parsed.data.credentialData,
      issuedAt,
      txHash: receipt?.hash || tx.hash,
      createdAt: new Date().toISOString()
    });

    // Also save to database for persistence
    if (useDatabase) {
      // Create a special batch for individual credentials
      const individualBatchId = `individual-${parsed.data.studentId}-${Date.now()}`;
      await createBatch({
        batchId: individualBatchId,
        issuerId: parsed.data.issuerId,
        startedAt: issuedAt,
        totalCount: 1
      });
      await addBatchResult({
        batchId: individualBatchId,
        studentId: parsed.data.studentId,
        issuerId: parsed.data.issuerId,
        credentialHash: credentialHashHex,
        txHash: receipt?.hash || tx.hash,
        chainError: null,
        ipfsCid: null,
        ipfsError: null
      });
      await completeBatch(individualBatchId, {
        completedAt: issuedAt,
        successCount: 1,
        failureCount: 0
      });
    }

    return res.json({
      ok: true,
      credentialHash: credentialHashHex,
      txHash: receipt?.hash || tx.hash
    });
  } catch (e) {
    const msg = String(e?.message || e);
    // Detect specific blockchain revert errors
    if (msg.includes("already issued") || msg.includes("ALREADY_ISSUED")) {
      return res.status(409).json({
        ok: false,
        error: "This credential has already been issued. Each credential can only be issued once on the blockchain.",
        code: "ALREADY_ISSUED",
        credentialHash: credentialHashHex,
        duplicate: true
      });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
});

const RevokeRequest = z.object({
  credentialHash: z.string().regex(/^[0-9a-fA-F]{64}$/)
});

app.post('/api/credentials/revoke', strictLimiter, async (req, res) => {
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

    // Find issuer ID from individual credential store
    const credentialIssuerId = await findIssuerIdByHash(hash);
    if (credentialIssuerId) {
      const istats = await getOrInitIssuerStats(credentialIssuerId);
      if (istats) {
        await saveIssuerStats(credentialIssuerId, {
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

// Document upload endpoint - stores file data directly (no IPFS)
app.post('/api/documents/upload', async (req, res) => {
  try {
    const { credentialHash, studentId, issuerId, filename, content_type, file_size, ipfs_cid } = req.body;
    
    if (!credentialHash || !studentId || !issuerId || !filename || !content_type || !file_size) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Get file data from temp storage (fileId is passed as ipfs_cid for compatibility)
    const fileId = ipfs_cid;
    let fileData = null;
    
    if (fileId && tempFileStore.has(fileId)) {
      const tempFile = tempFileStore.get(fileId);
      fileData = tempFile.fileData;
      // Clean up temp storage after retrieval
      tempFileStore.delete(fileId);
    }

    if (useDatabase) {
      const document = await saveDocument({
        credentialHash,
        ipfsCid: fileId, // Store fileId as reference
        fileData: fileData, // Store actual file content as base64
        filename,
        contentType: content_type,
        fileSize: file_size,
        studentId,
        issuerId
      });
      return res.json({ ok: true, document });
    } else {
      // Fallback to in-memory storage
      documentsStore.set(credentialHash.toLowerCase(), {
        credentialHash,
        ipfsCid: fileId,
        fileData: fileData,
        filename,
        contentType: content_type,
        fileSize: file_size,
        studentId,
        issuerId,
        uploadedAt: new Date()
      });
      return res.json({ ok: true, document: documentsStore.get(credentialHash.toLowerCase()) });
    }
  } catch (error) {
    console.error('Document upload error:', error);
    return res.status(500).json({ ok: false, error: 'Document upload failed' });
  }
});

// Document retrieval endpoint
app.get('/api/documents/:credentialHash', async (req, res) => {
  try {
    const { credentialHash } = req.params;
    
    if (useDatabase) {
      const document = await getDocumentByCredentialHash(credentialHash);
      if (!document) {
        return res.status(404).json({ ok: false, error: 'Document not found' });
      }
      return res.json({ ok: true, document });
    } else {
      // Fallback to in-memory storage
      const document = documentsStore.get(credentialHash.toLowerCase());
      if (!document) {
        return res.status(404).json({ ok: false, error: 'Document not found' });
      }
      return res.json({ ok: true, document });
    }
  } catch (error) {
    console.error('Document retrieval error:', error);
    return res.status(500).json({ ok: false, error: 'Document retrieval failed' });
  }
});

// Admin Dashboard API Endpoints

// Get all students
app.get('/api/admin/students', async (req, res) => {
  try {
    if (useDatabase) {
      const students = await getAllStudents();
      return res.json({ ok: true, students });
    } else {
      // Fallback to in-memory
      const students = Array.from(studentDidStore.entries()).map(([student_id, did]) => ({
        student_id,
        did,
        credential_count: 0,
        document_count: 0
      }));
      return res.json({ ok: true, students });
    }
  } catch (error) {
    console.error('Admin students error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get students' });
  }
});

// Get all issuers
app.get('/api/admin/issuers', async (req, res) => {
  try {
    if (useDatabase) {
      const issuers = await getAllIssuers();
      return res.json({ ok: true, issuers });
    } else {
      // Fallback to in-memory
      const issuers = Array.from(issuerStats.entries()).map(([issuer_id, stats]) => ({
        issuer_id,
        ...stats
      }));
      return res.json({ ok: true, issuers });
    }
  } catch (error) {
    console.error('Admin issuers error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get issuers' });
  }
});

// Get all credentials
app.get('/api/admin/credentials', async (req, res) => {
  try {
    if (useDatabase) {
      const credentials = await getAllCredentials();
      return res.json({ ok: true, credentials });
    } else {
      // Fallback to in-memory - combine individual and batch credentials
      const credentials = [];
      for (const [hash, cred] of individualCredentialStore.entries()) {
        credentials.push({
          credential_hash: hash,
          student_id: cred.studentId,
          issuer_id: cred.issuerId,
          on_chain: true,
          created_at: cred.createdAt
        });
      }
      return res.json({ ok: true, credentials });
    }
  } catch (error) {
    console.error('Admin credentials error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get credentials' });
  }
});

// Get all batches
app.get('/api/admin/batches', async (req, res) => {
  try {
    if (useDatabase) {
      const batches = await getAllBatches();
      return res.json({ ok: true, batches });
    } else {
      // Fallback to in-memory
      const batches = Array.from(batchStore.values());
      return res.json({ ok: true, batches });
    }
  } catch (error) {
    console.error('Admin batches error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get batches' });
  }
});
app.delete('/api/admin/students/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Clear in-memory individual credential store
    for (const [hash, cred] of individualCredentialStore.entries()) {
      if (cred.studentId === studentId) {
        individualCredentialStore.delete(hash);
      }
    }
    
    if (useDatabase) {
      const success = await deleteStudent(studentId);
      if (success) {
        return res.json({ ok: true });
      } else {
        return res.status(500).json({ ok: false, error: 'Failed to delete student' });
      }
    } else {
      // In-memory deletion
      studentDidStore.delete(studentId);
      for (const batch of batchStore.values()) {
        batch.results = batch.results.filter(r => r.studentId !== studentId);
      }
      return res.json({ ok: true });
    }
  } catch (error) {
    console.error('Delete student error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to delete student' });
  }
});

// Delete credential
app.delete('/api/admin/credentials/:credentialHash', async (req, res) => {
  try {
    const { credentialHash } = req.params;
    if (useDatabase) {
      const success = await deleteCredential(credentialHash);
      if (success) {
        return res.json({ ok: true });
      } else {
        return res.status(500).json({ ok: false, error: 'Failed to delete credential' });
      }
    } else {
      // In-memory deletion
      individualCredentialStore.delete(credentialHash);
      for (const batch of batchStore.values()) {
        batch.results = batch.results.filter(r => r.credentialHash !== credentialHash);
      }
      return res.json({ ok: true });
    }
  } catch (error) {
    console.error('Delete credential error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to delete credential' });
  }
});

// Delete document
app.delete('/api/admin/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (useDatabase) {
      const result = await deleteDocumentById(id);
      if (result) {
        return res.json({ ok: true });
      } else {
        return res.status(500).json({ ok: false, error: 'Failed to delete document' });
      }
    } else {
      return res.status(500).json({ ok: false, error: 'Document deletion not supported in in-memory mode' });
    }
  } catch (error) {
    console.error('Delete document error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to delete document' });
  }
});

// Delete issuer
app.delete('/api/admin/issuers/:issuerId', async (req, res) => {
  try {
    const { issuerId } = req.params;
    if (useDatabase) {
      const result = await deleteIssuer(issuerId);
      if (result) {
        return res.json({ ok: true });
      } else {
        return res.status(500).json({ ok: false, error: 'Failed to delete issuer' });
      }
    } else {
      issuerStats.delete(issuerId);
      return res.json({ ok: true });
    }
  } catch (error) {
    console.error('Delete issuer error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to delete issuer' });
  }
});

// Get dashboard stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    let stats = {
      totalStudents: 0,
      totalIssuers: 0,
      totalCredentials: 0,
      totalDocuments: 0,
      totalBatches: 0
    };
    
    if (useDatabase) {
      const students = await getAllStudents();
      const issuers = await getAllIssuers();
      const credentials = await getAllCredentials();
      const documents = await getAllDocuments();
      const batches = await getAllBatches();
      
      stats = {
        totalStudents: students.length,
        totalIssuers: issuers.length,
        totalCredentials: credentials.length,
        totalDocuments: documents.length,
        totalBatches: batches.length
      };
    } else {
      // In-memory stats
      stats = {
        totalStudents: studentDidStore.size,
        totalIssuers: issuerStats.size,
        totalCredentials: individualCredentialStore.size,
        totalDocuments: documentsStore.size,
        totalBatches: batchStore.size
      };
    }
    
    return res.json({ ok: true, stats });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get stats' });
  }
});

// Get all documents endpoint
app.get('/api/documents', async (req, res) => {
  try {
    const { studentId, issuerId } = req.query;
    
    if (useDatabase) {
      let documents;
      if (studentId) {
        documents = await getDocumentsByStudent(studentId);
      } else if (issuerId) {
        documents = await getDocumentsByIssuer(issuerId);
      } else {
        documents = await getAllDocuments();
      }
      return res.json({ ok: true, documents });
    } else {
      // Fallback to in-memory storage
      let documents = Array.from(documentsStore.values());
      if (studentId) {
        documents = documents.filter(d => d.studentId === studentId);
      } else if (issuerId) {
        documents = documents.filter(d => d.issuerId === issuerId);
      }
      return res.json({ ok: true, documents });
    }
  } catch (error) {
    console.error('Get documents error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get documents' });
  }
});

// Direct file upload endpoint (stores in PostgreSQL or memory, no IPFS needed)
app.post('/api/ipfs/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const fileDataBase64 = fileBuffer.toString('base64');
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store file data in memory temporarily (will be saved permanently with credential)
    tempFileStore.set(fileId, {
      fileData: fileDataBase64,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedAt: new Date()
    });
    
    return res.json({ 
      ok: true, 
      cid: fileId,  // Use fileId as reference (like IPFS CID)
      message: 'File stored temporarily. Will be saved permanently with credential.'
    });
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ ok: false, error: 'File upload failed' });
  }
});

// Temporary file storage for uploaded files (before credential is issued)
const tempFileStore = new Map();

// Risk score cache to ensure same credential always returns same score
const riskScoreCache = new Map();

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
