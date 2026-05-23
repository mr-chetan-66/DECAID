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
  findResultsByContentSignature,
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
  deleteIssuer,
  createCertificateRequest,
  getCertificateRequests,
  getCertificateRequestById,
  updateCertificateRequestReview,
  saveZkpCommitment,
  getZkpCommitment
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
const certificateRequestStore = new Map();
let certificateRequestSequence = 1;

const CERTIFICATE_ROUTES = {
  normal_certificate: {
    label: 'Normal Certificate',
    issuerId: 'TEACHER-STUDENT-INCHARGE',
    role: 'teacher_student_incharge'
  },
  courses: {
    label: 'NPTEL / Courses',
    issuerId: 'NPTEL-TNP-INCHARGE',
    role: 'nptel_incharge'
  },
  internship: {
    label: 'Internship',
    issuerId: 'III-INTERNSHIP-INCHARGE',
    role: 'iii_incharge'
  },
  sport: {
    label: 'Sport',
    issuerId: 'FORUM-SPORT-EVENT-INCHARGE',
    role: 'forum_incharge'
  },
  other_event: {
    label: 'Other Event / Hackathon',
    issuerId: 'FORUM-SPORT-EVENT-INCHARGE',
    role: 'forum_incharge'
  }
};

const INCHARGE_ROLE_ISSUER = {
  teacher_student_incharge: 'TEACHER-STUDENT-INCHARGE',
  forum_incharge: 'FORUM-SPORT-EVENT-INCHARGE',
  nptel_incharge: 'NPTEL-TNP-INCHARGE',
  iii_incharge: 'III-INTERNSHIP-INCHARGE',
  institution: null
};

function canReviewForIssuer(user, issuerId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'institution') return true;
  return INCHARGE_ROLE_ISSUER[user.role] === issuerId;
}

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

function normalizeCredentialData(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractUniqueCredentialIdentifiers(credentialData, certificateNumber = null) {
  const normalized = normalizeCredentialData(credentialData);
  const identifiers = [];

  const pushIdentifier = (label, rawValue) => {
    const value = String(rawValue || '')
      .trim()
      .toLowerCase()
      .replace(/^[#: -]+|[#: -]+$/g, '')
      .replace(/\s+/g, '');
    if (value && value.length >= 4) {
      identifiers.push(`${label}:${value}`);
    }
  };

  pushIdentifier('certificate', certificateNumber);

  const patterns = [
    ['certificate', /\b(?:certificate|cert)\s*(?:number|no|id|#)?\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{2,})/gi],
    ['registration', /\b(?:registration|reg)\s*(?:number|no|id|#)?\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{2,})/gi],
    ['enrollment', /\b(?:enrollment|enrolment)\s*(?:number|no|id|#)?\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{2,})/gi],
    ['roll', /\broll\s*(?:number|no|id|#)?\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{2,})/gi],
    ['transcript', /\btranscript\s*(?:number|no|id|#)?\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{2,})/gi],
    ['document', /\bdocument\s*(?:hash|id|number|no|#)?\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{5,})/gi],
    ['serial', /\bserial\s*(?:number|no|id|#)?\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{2,})/gi]
  ];

  for (const [label, pattern] of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      pushIdentifier(label, match[1]);
    }
  }

  return Array.from(new Set(identifiers)).sort();
}

function buildContentSignature(credentialData, certificateNumber = null) {
  const identifiers = extractUniqueCredentialIdentifiers(credentialData, certificateNumber);
  if (identifiers.length === 0) {
    return null;
  }
  return sha256Hex(identifiers.join('|'));
}

async function hasCrossStudentContentDuplicate(contentSignature, studentId, excludedHash = null) {
  const signature = String(contentSignature || '').trim().toLowerCase();
  const currentStudentId = String(studentId || '').trim();
  const excluded = String(excludedHash || '').trim().toLowerCase();

  if (!signature || !currentStudentId) {
    return false;
  }

  if (useDatabase) {
    const results = await findResultsByContentSignature(signature);
    return results.some((row) => {
      const existingStudentId = String(row.student_id || '').trim();
      const existingHash = String(row.credential_hash || '').trim().toLowerCase();
      return existingStudentId && existingStudentId !== currentStudentId && existingHash !== excluded;
    });
  }

  for (const credential of individualCredentialStore.values()) {
    const existingStudentId = String(credential.studentId || '').trim();
    const existingSignature = String(credential.contentSignature || '').trim().toLowerCase();
    const existingHash = String(credential.credentialHash || '').trim().toLowerCase();
    if (
      existingSignature === signature &&
      existingStudentId &&
      existingStudentId !== currentStudentId &&
      existingHash !== excluded
    ) {
      return true;
    }
  }

  for (const record of batchStore.values()) {
    for (const result of record.results || []) {
      const existingStudentId = String(result.studentId || '').trim();
      const existingSignature = String(result.contentSignature || '').trim().toLowerCase();
      const existingHash = String(result.credentialHash || '').trim().toLowerCase();
      if (
        existingSignature === signature &&
        existingStudentId &&
        existingStudentId !== currentStudentId &&
        existingHash !== excluded
      ) {
        return true;
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
  credentialData: z.string().min(1).optional(),
  contentSignature: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
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
    const contentSignature = buildContentSignature(c.credentialData, c.certificateNumber);
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
      const contentDuplicateFlag = await hasCrossStudentContentDuplicate(
        contentSignature,
        c.studentId,
        credentialHashHex
      ) ? 1 : 0;
      const r = await fetch(`${aiUrl}/score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          studentId: c.studentId,
          issuerId: c.issuerId,
          credentialHash: credentialHashHex,
          contentSignature,
          issuedAt: c.issuedAt,
          batchId,
          contentDuplicateFlag
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
      contentSignature,
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

    individualCredentialStore.set(credentialHashHex, {
      studentId: c.studentId,
      issuerId: c.issuerId,
      credentialData: c.credentialData,
      certificateNumber: c.certificateNumber || null,
      contentSignature,
      credentialHash: credentialHashHex,
      issuedAt: c.issuedAt || new Date().toISOString(),
      txHash,
      createdAt: new Date().toISOString()
    });
    
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
          const issuerTrust = await computeIssuerTrustRank(c.issuerId);
          const issuerTrustScore = issuerTrust.rank || 3;
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
              chainExists: chain?.exists ? 1 : 0,
              revokedFlag: chain?.revoked ? 1 : 0,
              issuedAt: chain?.issuedAt ? new Date(Number(chain.issuedAt) * 1000).toISOString() : undefined,
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
              ruleScore: body.ruleScore,
              llmReview: body.llmReview || null,
              llmError: body.llmError || null
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
  let storedStudentId = null;
  let storedIssuerId = null;
  let contentDuplicateDetected = false;
  
  // If studentId or issuerId missing, try to find from batch data
  if ((!studentId || !issuerId) && useDatabase) {
    const dbResults = await findResultsByHash(h);
    if (dbResults.length > 0) {
      storedStudentId = dbResults[0].student_id;
      storedIssuerId = dbResults[0].issuer_id;
      effectiveStudentId = effectiveStudentId || dbResults[0].student_id;
      effectiveIssuerId = effectiveIssuerId || dbResults[0].issuer_id;
    }
  }
  
  // Fallback to in-memory if database doesn't have the data
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

  if (issuerId && storedIssuerId && issuerId !== storedIssuerId) {
    return res.status(403).json({
      ok: false,
      error: `Issuer ID mismatch: The credential was issued by '${storedIssuerId}', not '${issuerId}'. Please verify the correct Issuer ID.`,
      code: "ISSUER_ID_MISMATCH",
      providedIssuerId: issuerId,
      expectedIssuerId: storedIssuerId,
      credentialHash: h
    });
  }

  // Calculate risk using AI service with behavioral features
  const riskAssessmentAvailable = Boolean(studentId && effectiveStudentId && effectiveIssuerId);
  if (riskAssessmentAvailable) {
    // Check cache first
    const cacheKey = `${effectiveStudentId}:${effectiveIssuerId}:${h}`;
    if (riskScoreCache.has(cacheKey)) {
      risk = riskScoreCache.get(cacheKey);
    } else {
      try {
        // Get issuer trust and stats
        const issuerStats = await getOrInitIssuerStats(effectiveIssuerId);
        const issuerTrust = await computeIssuerTrustRank(effectiveIssuerId);
        const issuerTrustScore = issuerTrust.rank || 3;
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

        const knownCredential = individualCredentialStore.get(h);
        const contentSignature =
          knownCredential?.contentSignature ||
          (knownCredential?.credentialData ? buildContentSignature(knownCredential.credentialData) : null);
        contentDuplicateDetected = contentSignature
          ? await hasCrossStudentContentDuplicate(contentSignature, effectiveStudentId, h)
          : false;
        
        // Get batch size if available
        const batchSize = 1; // Default to individual issuance
        
        const duplicateFlag = duplicateDetected ? 1 : 0;
        const contentDuplicateFlag = contentDuplicateDetected ? 1 : 0;
        console.log(`[AI Service Request] duplicateFlag: ${duplicateFlag}, contentDuplicateFlag: ${contentDuplicateFlag}, duplicateDetected: ${duplicateDetected}, contentDuplicateDetected: ${contentDuplicateDetected}`);

        const r = await fetch(`${aiUrl}/score`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            studentId: effectiveStudentId,
            issuerId: effectiveIssuerId,
            credentialHash: h,
            contentSignature,
            batchId: 'verification-batch',
            issuerTrustScore,
            credentialCount,
            studentCredentialCount,
            timeGap,
            duplicateFlag,
            contentDuplicateFlag,
            batchSize,
            chainExists: chain.exists ? 1 : 0,
            revokedFlag: chain.revoked ? 1 : 0,
            hasDocument: ipfsCid ? 1 : 0,
            issuedAt: chain.issuedAt ? new Date(chain.issuedAt * 1000).toISOString() : undefined
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
            ruleScore: body.ruleScore,
            llmReview: body.llmReview || null,
            llmError: body.llmError || null
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
    contentDuplicateDetected,
    zkp,
    verificationContext: {
      mode: riskAssessmentAvailable ? 'contextual' : 'hash_only',
      riskAssessmentAvailable,
      studentIdProvided: Boolean(studentId),
      issuerIdProvided: Boolean(issuerId),
      matchedStoredStudent: Boolean(storedStudentId && (!studentId || studentId === storedStudentId)),
      matchedStoredIssuer: Boolean(storedIssuerId && (!issuerId || issuerId === storedIssuerId))
    }
  });
});

const IssueRequest = z.object({
  studentId: z.string().min(1),
  issuerId: z.string().min(1),
  credentialData: z.string().min(1),
  issuedAt: z.string().datetime().optional(),
  batchId: z.string().optional(),
  generateZkp: z.boolean().optional()
});

async function issueCredentialRecord({ studentId, issuerId, credentialData, issuedAt, certificateNumber, ipfsCid }) {
  const credentialHashHex = sha256Hex(`${studentId}:${issuerId}:${credentialData}`);
  const contentSignature = buildContentSignature(credentialData, certificateNumber);
  const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + credentialHashHex));
  const issuedAtValue = issuedAt || new Date().toISOString();

  const istats = await getOrInitIssuerStats(issuerId);
  if (istats) {
    await saveIssuerStats(issuerId, {
      totalIssuedAttempts: istats.totalIssuedAttempts + 1
    });
  }

  const registry = getRegistry();
  const tx = await registry.issue(credentialHashBytes32);
  const receipt = await tx.wait();
  const txHash = receipt?.hash || tx.hash;

  if (istats) {
    await saveIssuerStats(issuerId, {
      totalIssuedOnChain: istats.totalIssuedOnChain + 1
    });
  }

  individualCredentialStore.set(credentialHashHex, {
    studentId,
    issuerId,
    credentialData,
    certificateNumber: certificateNumber || null,
    contentSignature,
    credentialHash: credentialHashHex,
    issuedAt: issuedAtValue,
    txHash,
    createdAt: new Date().toISOString()
  });

  if (useDatabase) {
    const individualBatchId = `individual-${studentId}-${Date.now()}`;
    await createBatch({
      batchId: individualBatchId,
      issuerId,
      startedAt: issuedAtValue,
      totalCount: 1
    });
    await addBatchResult({
      batchId: individualBatchId,
      studentId,
      issuerId,
      certificateNumber: certificateNumber || null,
      contentSignature,
      credentialHash: credentialHashHex,
      txHash,
      chainError: null,
      ipfsCid: ipfsCid || null,
      ipfsError: null
    });
    await completeBatch({
      batchId: individualBatchId,
      completedAt: issuedAtValue,
      successCount: 1,
      failedCount: 0
    });
  }

  return { credentialHash: credentialHashHex, txHash, contentSignature };
}

app.post('/api/credentials/issue', async (req, res) => {
  const parsed = IssueRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  // Include studentId and issuerId in hash to make it unique per student
  const credentialHashHex = sha256Hex(`${parsed.data.studentId}:${parsed.data.issuerId}:${parsed.data.credentialData}`);
  const contentSignature = buildContentSignature(parsed.data.credentialData);
  const credentialHashBytes32 = ethers.hexlify(ethers.getBytes('0x' + credentialHashHex));

  // Generate ZKP commitment if requested
  let zkpCommitment = null;
  let zkpNonce = null;
  if (parsed.data.generateZkp) {
    zkpNonce = crypto.randomBytes(32).toString('hex');
    zkpCommitment = sha256Hex(`${credentialHashHex}:${zkpNonce}`);
  }

  try {
    const contentDuplicateDetected = await hasCrossStudentContentDuplicate(
      contentSignature,
      parsed.data.studentId,
      credentialHashHex
    );

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
      contentSignature,
      credentialHash: credentialHashHex,
      issuedAt,
      txHash: receipt?.hash || tx.hash,
      createdAt: new Date().toISOString(),
      zkpCommitment,
      zkpNonce
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
        contentSignature,
        credentialHash: credentialHashHex,
        txHash: receipt?.hash || tx.hash,
        chainError: null,
        ipfsCid: null,
        ipfsError: null
      });
      await completeBatch({
        batchId: individualBatchId,
        completedAt: issuedAt,
        successCount: 1,
        failedCount: 0
      });
    }

    return res.json({
      ok: true,
      credentialHash: credentialHashHex,
      txHash: receipt?.hash || tx.hash,
      contentDuplicateDetected,
      zkpCommitment,
      zkpNonce
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

const CertificateRequestBody = z.object({
  studentId: z.string().min(1),
  certificateType: z.enum(['normal_certificate', 'courses', 'internship', 'sport', 'other_event']),
  title: z.string().min(1),
  description: z.string().min(1)
});

function normalizeRequest(row, { includeFileData = false } = {}) {
  if (!row) return null;
  const fileData = row.file_data || row.fileData || null;
  return {
    id: row.id,
    studentId: row.student_id || row.studentId,
    certificateType: row.certificate_type || row.certificateType,
    title: row.title,
    description: row.description,
    assignedIssuerId: row.assigned_issuer_id || row.assignedIssuerId,
    status: row.status,
    credentialHash: row.credential_hash || row.credentialHash || null,
    txHash: row.tx_hash || row.txHash || null,
    rejectionReason: row.rejection_reason || row.rejectionReason || null,
    filename: row.filename || null,
    contentType: row.content_type || row.contentType || null,
    fileSize: row.file_size || row.fileSize || null,
    hasDocument: Boolean(fileData && row.filename),
    ...(includeFileData ? { fileData } : {}),
    createdAt: row.created_at || row.createdAt,
    reviewedAt: row.reviewed_at || row.reviewedAt || null
  };
}

app.get('/api/certificate-routes', (req, res) => {
  return res.json({
    ok: true,
    routes: Object.entries(CERTIFICATE_ROUTES).map(([value, route]) => ({
      value,
      ...route
    }))
  });
});

app.post('/api/certificate-requests', authenticateToken, upload.single('file'), async (req, res) => {
  const parsed = CertificateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  if (req.user.role !== 'student' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Only students can create certificate requests' });
  }
  if (req.user.role === 'student' && parsed.data.studentId !== req.user.username) {
    return res.status(403).json({ ok: false, error: 'Students can only create requests for their own ID' });
  }

  const route = CERTIFICATE_ROUTES[parsed.data.certificateType];
  if (!route) {
    return res.status(400).json({ ok: false, error: 'Unsupported certificate type' });
  }

  const fileData = req.file ? req.file.buffer.toString('base64') : null;
  const request = {
    ...parsed.data,
    assignedIssuerId: route.issuerId,
    status: 'pending',
    fileData,
    filename: req.file?.originalname || null,
    contentType: req.file?.mimetype || null,
    fileSize: req.file?.size || null,
    createdAt: new Date().toISOString()
  };

  let saved;
  if (useDatabase) {
    saved = await createCertificateRequest(request);
    if (!saved) {
      return res.status(500).json({ ok: false, error: 'Failed to create certificate request' });
    }
  } else {
    saved = { id: certificateRequestSequence++, ...request };
    certificateRequestStore.set(saved.id, saved);
  }

  await getOrCreateStudentDid(parsed.data.studentId);
  return res.json({ ok: true, request: normalizeRequest(saved), route });
});

app.get('/api/certificate-requests', authenticateToken, async (req, res) => {
  const studentId = String(req.query.studentId || '').trim();
  const issuerId = String(req.query.issuerId || '').trim();

  if (req.user.role === 'student' && studentId !== req.user.username) {
    return res.status(403).json({ ok: false, error: 'Students can only view their own requests' });
  }
  if (issuerId && !canReviewForIssuer(req.user, issuerId)) {
    return res.status(403).json({ ok: false, error: 'Access denied for this incharge queue' });
  }
  if (!studentId && !issuerId && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin access required for all requests' });
  }

  let requests;
  if (useDatabase) {
    requests = await getCertificateRequests({
      studentId: studentId || undefined,
      issuerId: issuerId || undefined
    });
  } else {
    requests = Array.from(certificateRequestStore.values()).filter((request) => {
      return (!studentId || request.studentId === studentId) &&
        (!issuerId || request.assignedIssuerId === issuerId);
    });
  }

  return res.json({ ok: true, requests: requests.map(normalizeRequest) });
});

app.get('/api/certificate-requests/:id/document', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  const request = useDatabase
    ? await getCertificateRequestById(id)
    : certificateRequestStore.get(id);

  const normalized = normalizeRequest(request, { includeFileData: true });
  if (!normalized) {
    return res.status(404).json({ ok: false, error: 'Request not found' });
  }

  const canViewAsStudent = req.user.role === 'student' && normalized.studentId === req.user.username;
  const canViewAsReviewer = canReviewForIssuer(req.user, normalized.assignedIssuerId);
  if (!canViewAsStudent && !canViewAsReviewer) {
    return res.status(403).json({ ok: false, error: 'Access denied for this request document' });
  }

  if (!normalized.fileData || !normalized.filename) {
    return res.status(404).json({ ok: false, error: 'No document uploaded for this request' });
  }

  const fileBuffer = Buffer.from(normalized.fileData, 'base64');
  const safeFilename = String(normalized.filename).replace(/["\r\n]/g, '_');
  res.setHeader('Content-Type', normalized.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', fileBuffer.length);
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  return res.send(fileBuffer);
});

const CertificateReviewRequest = z.object({
  decision: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional()
});

app.post('/api/certificate-requests/:id/review', authenticateToken, async (req, res) => {
  const parsed = CertificateReviewRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const id = Number(req.params.id);
  const request = useDatabase
    ? await getCertificateRequestById(id)
    : certificateRequestStore.get(id);

  const normalized = normalizeRequest(request, { includeFileData: true });
  if (!normalized) {
    return res.status(404).json({ ok: false, error: 'Request not found' });
  }
  if (normalized.status !== 'pending') {
    return res.status(409).json({ ok: false, error: 'Request has already been reviewed' });
  }
  if (!canReviewForIssuer(req.user, normalized.assignedIssuerId)) {
    return res.status(403).json({ ok: false, error: 'Access denied for this incharge queue' });
  }

  if (parsed.data.decision === 'rejected') {
    const updates = {
      status: 'rejected',
      rejectionReason: parsed.data.rejectionReason || 'Not accepted'
    };
    const updated = useDatabase
      ? await updateCertificateRequestReview(id, updates)
      : { ...request, ...updates, reviewedAt: new Date().toISOString() };
    if (!useDatabase) certificateRequestStore.set(id, updated);
    return res.json({ ok: true, request: normalizeRequest(updated) });
  }

  try {
    const credentialData = [
      normalized.certificateType,
      normalized.title,
      normalized.description,
      normalized.filename || ''
    ].join('|');
    const issued = await issueCredentialRecord({
      studentId: normalized.studentId,
      issuerId: normalized.assignedIssuerId,
      credentialData
    });

    if (normalized.fileData && normalized.filename) {
      if (useDatabase) {
        await saveDocument({
          credentialHash: issued.credentialHash,
          ipfsCid: null,
          fileData: normalized.fileData,
          filename: normalized.filename,
          contentType: normalized.contentType || 'application/octet-stream',
          fileSize: normalized.fileSize || 0,
          studentId: normalized.studentId,
          issuerId: normalized.assignedIssuerId
        });
      } else {
        documentsStore.set(issued.credentialHash, {
          credentialHash: issued.credentialHash,
          ipfsCid: null,
          fileData: normalized.fileData,
          filename: normalized.filename,
          contentType: normalized.contentType || 'application/octet-stream',
          fileSize: normalized.fileSize || 0,
          studentId: normalized.studentId,
          issuerId: normalized.assignedIssuerId,
          uploadedAt: new Date()
        });
      }
    }

    const updates = {
      status: 'approved',
      credentialHash: issued.credentialHash,
      txHash: issued.txHash
    };
    const updated = useDatabase
      ? await updateCertificateRequestReview(id, updates)
      : { ...request, ...updates, reviewedAt: new Date().toISOString() };
    if (!useDatabase) certificateRequestStore.set(id, updated);
    return res.json({ ok: true, request: normalizeRequest(updated) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
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

// New commitment-only verification (no credentialHash or studentId required)
const ZkpCommitmentVerifyRequest = z.object({
  commitment: z.string().regex(/^[0-9a-fA-F]{64}$/),
  nonce: z.string().min(1)
});

app.post('/api/zkp/verify-by-commitment', async (req, res) => {
  const parsed = ZkpCommitmentVerifyRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { commitment, nonce } = parsed.data;
  console.log(`[Verify by Commitment] commitment: ${commitment.substring(0, 8)}..., nonce: ${nonce.substring(0, 8)}...`);

  // Look up credential by commitment in individual store
  let foundCredential = null;
  for (const [hash, cred] of individualCredentialStore.entries()) {
    if (cred.zkpCommitment === commitment) {
      foundCredential = { hash, ...cred };
      break;
    }
  }

  if (!foundCredential && useDatabase) {
    const storedCommitment = await getZkpCommitment(commitment);
    if (storedCommitment) {
      foundCredential = {
        hash: storedCommitment.credential_hash,
        studentId: storedCommitment.student_id,
        zkpCommitment: storedCommitment.commitment,
        zkpNonce: storedCommitment.nonce
      };
    }
  } else if (chain?.exists) {
    risk = {
      ok: false,
      reason: 'hash_only_verification',
      error: 'Risk analysis requires Student ID context. Hash-only verification reports blockchain status only.'
    };
  }

  if (!foundCredential) {
    console.log(`[Verify by Commitment] Commitment not found`);
    return res.status(404).json({
      ok: false,
      error: "Commitment not found",
      valid: false
    });
  }

  // Verify the commitment by recomputing it (must match generation formula: credentialHash:studentId:nonce)
  const computedCommitment = sha256Hex(`${foundCredential.hash}:${foundCredential.studentId}:${nonce}`);
  const valid = computedCommitment === commitment;
  console.log(`[Verify by Commitment] computed: ${computedCommitment.substring(0, 8)}..., provided: ${commitment.substring(0, 8)}..., valid: ${valid}`);

  // Check blockchain verification
  let blockchain = null;
  try {
    const registry = getRegistry();
    const [exists, issuerAddress, issuedAt, revoked] = await registry.verify(
      ethers.hexlify(ethers.getBytes('0x' + foundCredential.hash))
    );
    blockchain = {
      exists,
      issuerAddress,
      issuedAt: Number(issuedAt),
      revoked
    };
  } catch (e) {
    blockchain = { error: String(e?.message || e) };
  }

  return res.json({
    ok: true,
    valid,
    commitment,
    blockchain,
    // Do NOT return credentialHash, studentId, or credentialData for privacy
    verifiedAt: new Date().toISOString()
  });
});

// Store ZKP commitment for an existing credential
const StoreZkpCommitmentRequest = z.object({
  credentialHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  studentId: z.string().min(1),
  commitment: z.string().regex(/^[0-9a-fA-F]{64}$/),
  nonce: z.string().min(1)
});

app.post('/api/zkp/store-commitment', async (req, res) => {
  const parsed = StoreZkpCommitmentRequest.safeParse(req.body);
  if (!parsed.success) {
    console.log('[Store Commitment] Validation error:', parsed.error.flatten());
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { credentialHash, studentId, commitment, nonce } = parsed.data;
  console.log(`[Store Commitment] credentialHash: ${credentialHash.substring(0, 8)}..., studentId: ${studentId}, commitment: ${commitment.substring(0, 8)}...`);

  let credential = individualCredentialStore.get(credentialHash);
  if (!credential && useDatabase) {
    const matches = await findResultsByHash(credentialHash);
    const match = matches.find((row) => row.student_id === studentId);
    if (match) {
      credential = {
        studentId: match.student_id,
        credentialHash: match.credential_hash
      };
    }
  }

  if (!credential) {
    console.log(`[Store Commitment] Credential not found`);
    return res.status(404).json({
      ok: false,
      error: "Credential not found"
    });
  }

  // Verify the commitment is correct (must match generation formula: credentialHash:studentId:nonce)
  const computedCommitment = sha256Hex(`${credentialHash}:${studentId}:${nonce}`);
  if (computedCommitment !== commitment) {
    console.log(`[Store Commitment] Commitment mismatch: computed ${computedCommitment.substring(0, 8)}... != provided ${commitment.substring(0, 8)}...`);
    return res.status(400).json({
      ok: false,
      error: "Invalid commitment for this credential hash and nonce"
    });
  }

  // Store the commitment
  if (individualCredentialStore.has(credentialHash)) {
    credential.zkpCommitment = commitment;
    credential.zkpNonce = nonce;
  }
  if (useDatabase) {
    await saveZkpCommitment({ credentialHash, studentId, commitment, nonce });
  }
  console.log(`[Store Commitment] Stored successfully`);

  return res.json({
    ok: true,
    message: "ZKP commitment stored successfully"
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
