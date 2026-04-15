import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'decaid',
  user: process.env.DB_USER || 'decaid',
  password: process.env.DB_PASSWORD || 'decaid',
});

export async function initDatabase() {
  const client = await pool.connect();
  try {
    // Issuer stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS issuer_stats (
        issuer_id VARCHAR(255) PRIMARY KEY,
        total_issued_attempts INTEGER DEFAULT 0,
        total_issued_on_chain INTEGER DEFAULT 0,
        chain_errors INTEGER DEFAULT 0,
        total_revocations INTEGER DEFAULT 0,
        risk_score_count INTEGER DEFAULT 0,
        risk_score_sum BIGINT DEFAULT 0,
        last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Batches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id VARCHAR(255) PRIMARY KEY,
        issuer_id VARCHAR(255) NOT NULL,
        started_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        total_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0
      )
    `);

    // Batch results table (individual credentials)
    await client.query(`
      CREATE TABLE IF NOT EXISTS batch_results (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(255) REFERENCES batches(batch_id) ON DELETE CASCADE,
        student_id VARCHAR(255) NOT NULL,
        issuer_id VARCHAR(255) NOT NULL,
        certificate_number VARCHAR(255),
        ipfs_cid VARCHAR(255),
        ipfs_error TEXT,
        credential_hash VARCHAR(64) NOT NULL,
        tx_hash VARCHAR(255),
        chain_error TEXT,
        risk_score INTEGER,
        risk_model VARCHAR(255),
        ai_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Student DIDs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_dids (
        student_id VARCHAR(255) PRIMARY KEY,
        did VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table for Google OAuth authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        picture TEXT,
        google_id VARCHAR(255) UNIQUE,
        role VARCHAR(50) NOT NULL DEFAULT 'pending',
        issuer_id VARCHAR(255),
        student_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_role CHECK (role IN ('student', 'institution', 'employer', 'admin', 'pending'))
      )
    `);

    // Insert demo users if they don't exist
    await client.query(`
      INSERT INTO users (email, name, role, issuer_id, student_id) 
      VALUES 
        ('institution@decaid.com', 'Demo Institution', 'institution', 'DEMO-UNIVERSITY', NULL),
        ('employer@decaid.com', 'Demo Employer', 'employer', NULL, NULL),
        ('student@decaid.com', 'Demo Student', 'student', NULL, 'DEMO-STUDENT-001')
      ON CONFLICT (email) DO NOTHING
    `);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Issuer Stats operations
export async function getIssuerStats(issuerId) {
  const result = await pool.query(
    'SELECT * FROM issuer_stats WHERE issuer_id = $1',
    [issuerId]
  );
  return result.rows[0] || null;
}

export async function initIssuerStats(issuerId) {
  const result = await pool.query(
    `INSERT INTO issuer_stats (issuer_id) VALUES ($1)
     ON CONFLICT (issuer_id) DO UPDATE SET issuer_id = $1
     RETURNING *`,
    [issuerId]
  );
  return result.rows[0];
}

export async function updateIssuerStats(issuerId, updates) {
  const setClause = Object.keys(updates)
    .map((key, i) => `${key} = $${i + 2}`)
    .join(', ');
  const values = [issuerId, ...Object.values(updates)];
  
  const result = await pool.query(
    `UPDATE issuer_stats SET ${setClause}, last_updated_at = CURRENT_TIMESTAMP
     WHERE issuer_id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

// Batch operations
export async function createBatch({ batchId, issuerId, startedAt, totalCount }) {
  const result = await pool.query(
    `INSERT INTO batches (batch_id, issuer_id, started_at, total_count)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [batchId, issuerId, startedAt, totalCount]
  );
  return result.rows[0];
}

export async function completeBatch({ batchId, completedAt, successCount, failedCount }) {
  const result = await pool.query(
    `UPDATE batches 
     SET completed_at = $2, success_count = $3, failed_count = $4
     WHERE batch_id = $1 RETURNING *`,
    [batchId, completedAt, successCount, failedCount]
  );
  return result.rows[0];
}

export async function addBatchResult(result) {
  const {
    batchId, studentId, issuerId, certificateNumber, ipfsCid, ipfsError,
    credentialHash, txHash, chainError, riskScore, riskModel, aiError
  } = result;
  
  await pool.query(
    `INSERT INTO batch_results 
     (batch_id, student_id, issuer_id, certificate_number, ipfs_cid, ipfs_error,
      credential_hash, tx_hash, chain_error, risk_score, risk_model, ai_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [batchId, studentId, issuerId, certificateNumber, ipfsCid, ipfsError,
     credentialHash, txHash, chainError, riskScore, riskModel, aiError]
  );
}

export async function getBatch(batchId) {
  const result = await pool.query(
    'SELECT * FROM batches WHERE batch_id = $1',
    [batchId]
  );
  return result.rows[0] || null;
}

export async function getBatchResults(batchId) {
  const result = await pool.query(
    'SELECT * FROM batch_results WHERE batch_id = $1 ORDER BY created_at',
    [batchId]
  );
  return result.rows;
}

export async function getAllBatches() {
  const result = await pool.query('SELECT * FROM batches ORDER BY started_at DESC');
  return result.rows;
}

export async function findResultsByHash(credentialHash) {
  const result = await pool.query(
    `SELECT br.*, b.started_at as batch_started_at 
     FROM batch_results br
     JOIN batches b ON br.batch_id = b.batch_id
     WHERE br.credential_hash = $1`,
    [credentialHash.toLowerCase()]
  );
  return result.rows;
}

export async function findResultsByStudent(studentId) {
  const result = await pool.query(
    `SELECT br.*, b.started_at as batch_started_at, b.completed_at
     FROM batch_results br
     JOIN batches b ON br.batch_id = b.batch_id
     WHERE br.student_id = $1
     ORDER BY b.started_at DESC`,
    [studentId]
  );
  return result.rows;
}

// Student DID operations
export async function getStudentDid(studentId) {
  const result = await pool.query(
    'SELECT * FROM student_dids WHERE student_id = $1',
    [studentId]
  );
  return result.rows[0] || null;
}

export async function createStudentDid(studentId) {
  const did = `did:decaid:${crypto.randomUUID()}`;
  try {
    const result = await pool.query(
      `INSERT INTO student_dids (student_id, did) VALUES ($1, $2)
       ON CONFLICT (student_id) DO UPDATE SET did = student_dids.did
       RETURNING *`,
      [studentId, did]
    );
    return result.rows[0];
  } catch (err) {
    // If insert failed due to conflict, fetch existing
    const existing = await getStudentDid(studentId);
    return existing;
  }
}

// User management functions
export async function getUserByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

export async function createUser(userData) {
  const { email, name, picture, googleId, role, issuerId, studentId } = userData;
  const result = await pool.query(
    `INSERT INTO users (email, name, picture, google_id, role, issuer_id, student_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [email, name, picture, googleId, role, issuerId, studentId]
  );
  return result.rows[0];
}

export async function updateUserRole(userId, updates) {
  const setClause = Object.keys(updates)
    .map((key, i) => `${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${i + 2}`)
    .join(', ');
  const values = [userId, ...Object.values(updates)];
  
  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function updateUserRoleByEmail(email, updates) {
  const setClause = Object.keys(updates)
    .map((key, i) => `${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${i + 2}`)
    .join(', ');
  const values = [email, ...Object.values(updates)];
  
  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP
     WHERE email = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function getAllUsers() {
  const result = await pool.query(
    'SELECT user_id, email, name, role, issuer_id, student_id, created_at FROM users ORDER BY created_at DESC'
  );
  return result.rows;
}

// For migration from in-memory to DB
export async function migrateFromMemory({ issuerStats, batchStore, studentDidStore }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Migrate issuer stats
    for (const [issuerId, stats] of issuerStats.entries()) {
      await client.query(
        `INSERT INTO issuer_stats 
         (issuer_id, total_issued_attempts, total_issued_on_chain, chain_errors, 
          total_revocations, risk_score_count, risk_score_sum, last_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (issuer_id) DO UPDATE SET
         total_issued_attempts = EXCLUDED.total_issued_attempts,
         total_issued_on_chain = EXCLUDED.total_issued_on_chain,
         chain_errors = EXCLUDED.chain_errors,
         total_revocations = EXCLUDED.total_revocations,
         risk_score_count = EXCLUDED.risk_score_count,
         risk_score_sum = EXCLUDED.risk_score_sum,
         last_updated_at = EXCLUDED.last_updated_at`,
        [issuerId, stats.totalIssuedAttempts, stats.totalIssuedOnChain, 
         stats.chainErrors, stats.totalRevocations, stats.riskScoreCount,
         stats.riskScoreSum, stats.lastUpdatedAt]
      );
    }
    
    // Migrate student DIDs
    for (const [studentId, did] of studentDidStore.entries()) {
      await client.query(
        `INSERT INTO student_dids (student_id, did) VALUES ($1, $2)
         ON CONFLICT (student_id) DO NOTHING`,
        [studentId, did]
      );
    }
    
    await client.query('COMMIT');
    console.log('Migration from memory to PostgreSQL completed');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
