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

        content_signature VARCHAR(64),

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

    await client.query(`

      ALTER TABLE batch_results

      ADD COLUMN IF NOT EXISTS content_signature VARCHAR(64)

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

        CONSTRAINT valid_role CHECK (role IN ('student', 'institution', 'teacher_student_incharge', 'forum_incharge', 'nptel_incharge', 'iii_incharge', 'employer', 'admin', 'pending'))

      )

    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'valid_role'
            AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT valid_role;
        END IF;
        ALTER TABLE users ADD CONSTRAINT valid_role
          CHECK (role IN ('student', 'institution', 'teacher_student_incharge', 'forum_incharge', 'nptel_incharge', 'iii_incharge', 'employer', 'admin', 'pending'));
      END $$;
    `);

    // Documents table for credential documents

    await client.query(`

      CREATE TABLE IF NOT EXISTS documents (

        id SERIAL PRIMARY KEY,

        credential_hash VARCHAR(64) NOT NULL,

        ipfs_cid VARCHAR(255),

        file_data TEXT,

        filename VARCHAR(255) NOT NULL,

        content_type VARCHAR(100) NOT NULL,

        file_size BIGINT NOT NULL,

        student_id VARCHAR(255) NOT NULL,

        issuer_id VARCHAR(255) NOT NULL,

        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(credential_hash)

      )

    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS certificate_requests (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(255) NOT NULL,
        certificate_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        assigned_issuer_id VARCHAR(255) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        credential_hash VARCHAR(64),
        tx_hash VARCHAR(255),
        rejection_reason TEXT,
        file_data TEXT,
        filename VARCHAR(255),
        content_type VARCHAR(100),
        file_size BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS zkp_commitments (
        commitment VARCHAR(64) PRIMARY KEY,
        credential_hash VARCHAR(64) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        nonce TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

  try {

    const result = await pool.query(

      'SELECT * FROM issuer_stats WHERE issuer_id = $1',

      [issuerId]

    );

    return result.rows[0] || null;

  } catch (error) {

    return null;

  }

}



export async function initIssuerStats(issuerId) {

  try {

    const result = await pool.query(

      `INSERT INTO issuer_stats (issuer_id) VALUES ($1)

       ON CONFLICT (issuer_id) DO UPDATE SET issuer_id = $1

       RETURNING *`,

      [issuerId]

    );

    return result.rows[0];

  } catch (error) {

    return null;

  }

}



export async function updateIssuerStats(issuerId, updates) {

  try {

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

  } catch (error) {

    return null;

  }

}



// Batch operations

export async function createBatch({ batchId, issuerId, startedAt, totalCount }) {

  try {

    const result = await pool.query(

      `INSERT INTO batches (batch_id, issuer_id, started_at, total_count)

       VALUES ($1, $2, $3, $4) RETURNING *`,

      [batchId, issuerId, startedAt, totalCount]

    );

    return result.rows[0];

  } catch (error) {

    return null;

  }

}



export async function completeBatch({ batchId, completedAt, successCount, failedCount }) {

  try {

    const result = await pool.query(

      `UPDATE batches 

       SET completed_at = $2, success_count = $3, failed_count = $4

       WHERE batch_id = $1 RETURNING *`,

      [batchId, completedAt, successCount, failedCount]

    );

    return result.rows[0];

  } catch (error) {

    return null;

  }

}



export async function addBatchResult(result) {

  try {

    const {

      batchId, studentId, issuerId, certificateNumber, ipfsCid, ipfsError,

      contentSignature, credentialHash, txHash, chainError, riskScore, riskModel, aiError

    } = result;

    

    await pool.query(

      `INSERT INTO batch_results 

       (batch_id, student_id, issuer_id, certificate_number, content_signature, ipfs_cid, ipfs_error,

        credential_hash, tx_hash, chain_error, risk_score, risk_model, ai_error)

       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,

      [batchId, studentId, issuerId, certificateNumber, contentSignature, ipfsCid, ipfsError,

       credentialHash, txHash, chainError, riskScore, riskModel, aiError]

    );

  } catch (error) {

    // Silently fail if database unavailable

  }

}



export async function getBatch(batchId) {

  try {

    const result = await pool.query(

      'SELECT * FROM batches WHERE batch_id = $1',

      [batchId]

    );

    return result.rows[0] || null;

  } catch (error) {

    return null;

  }

}



export async function getBatchResults(batchId) {

  try {

    const result = await pool.query(

      'SELECT * FROM batch_results WHERE batch_id = $1 ORDER BY created_at',

      [batchId]

    );

    return result.rows;

  } catch (error) {

    return [];

  }

}



export async function getAllBatches() {

  try {

    const result = await pool.query('SELECT * FROM batches ORDER BY started_at DESC');

    return result.rows;

  } catch (error) {

    return [];

  }

}



export async function findResultsByHash(credentialHash) {

  try {

    const result = await pool.query(

      `SELECT br.*, b.started_at as batch_started_at 

       FROM batch_results br

       JOIN batches b ON br.batch_id = b.batch_id

       WHERE br.credential_hash = $1`,

      [credentialHash.toLowerCase()]

    );

    return result.rows;

  } catch (error) {

    // Database unavailable, return empty array

    return [];

  }

}



export async function findResultsByContentSignature(contentSignature) {

  try {

    const result = await pool.query(

      `SELECT br.*, b.started_at as batch_started_at

       FROM batch_results br

       JOIN batches b ON br.batch_id = b.batch_id

       WHERE br.content_signature = $1`,

      [contentSignature.toLowerCase()]

    );

    return result.rows;

  } catch (error) {

    return [];

  }

}



export async function findResultsByStudent(studentId) {

  try {

    const result = await pool.query(

      `SELECT br.*, b.started_at as batch_started_at, b.completed_at

       FROM batch_results br

       JOIN batches b ON br.batch_id = b.batch_id

       WHERE br.student_id = $1

       ORDER BY b.started_at DESC`,

      [studentId]

    );

    return result.rows;

  } catch (error) {

    // Database unavailable, return empty array

    return [];

  }

}



// Student DID operations

export async function getStudentDid(studentId) {

  try {

    const result = await pool.query(

      'SELECT * FROM student_dids WHERE student_id = $1',

      [studentId]

    );

    return result.rows[0] || null;

  } catch (error) {

    return null;

  }

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



// Document operations

export async function saveDocument({ credentialHash, ipfsCid, fileData, filename, contentType, fileSize, studentId, issuerId }) {
  try {
    const result = await pool.query(
      `INSERT INTO documents (credential_hash, ipfs_cid, file_data, filename, content_type, file_size, student_id, issuer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (credential_hash) DO UPDATE SET
         ipfs_cid = COALESCE(EXCLUDED.ipfs_cid, documents.ipfs_cid),
         file_data = COALESCE(EXCLUDED.file_data, documents.file_data),
         filename = EXCLUDED.filename,
         content_type = EXCLUDED.content_type,
         file_size = EXCLUDED.file_size,
         student_id = EXCLUDED.student_id,
         issuer_id = EXCLUDED.issuer_id
       RETURNING *`,
      [credentialHash.toLowerCase(), ipfsCid, fileData, filename, contentType, fileSize, studentId, issuerId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error saving document:', error);
    return null;
  }
}

export async function getDocumentByCredentialHash(credentialHash) {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE credential_hash = $1',
      [credentialHash.toLowerCase()]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting document:', error);
    return null;
  }
}

export async function getDocumentsByStudent(studentId) {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE student_id = $1 ORDER BY uploaded_at DESC',
      [studentId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting documents by student:', error);
    return [];
  }
}

export async function getDocumentsByIssuer(issuerId) {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE issuer_id = $1 ORDER BY uploaded_at DESC',
      [issuerId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting documents by issuer:', error);
    return [];
  }
}

export async function getAllDocuments() {
  try {
    const result = await pool.query(
      'SELECT * FROM documents ORDER BY uploaded_at DESC'
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all documents:', error);
    return [];
  }
}

export async function createCertificateRequest(request) {
  try {
    const result = await pool.query(
      `INSERT INTO certificate_requests
       (student_id, certificate_type, title, description, assigned_issuer_id,
        file_data, filename, content_type, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        request.studentId,
        request.certificateType,
        request.title,
        request.description,
        request.assignedIssuerId,
        request.fileData,
        request.filename,
        request.contentType,
        request.fileSize
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating certificate request:', error);
    return null;
  }
}

export async function getCertificateRequests({ studentId, issuerId } = {}) {
  try {
    const filters = [];
    const values = [];
    if (studentId) {
      values.push(studentId);
      filters.push(`student_id = $${values.length}`);
    }
    if (issuerId) {
      values.push(issuerId);
      filters.push(`assigned_issuer_id = $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM certificate_requests ${where} ORDER BY created_at DESC`,
      values
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting certificate requests:', error);
    return [];
  }
}

export async function getCertificateRequestById(id) {
  try {
    const result = await pool.query(
      'SELECT * FROM certificate_requests WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting certificate request:', error);
    return null;
  }
}

export async function updateCertificateRequestReview(id, updates) {
  try {
    const result = await pool.query(
      `UPDATE certificate_requests
       SET status = $2,
           credential_hash = $3,
           tx_hash = $4,
           rejection_reason = $5,
           reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        id,
        updates.status,
        updates.credentialHash || null,
        updates.txHash || null,
        updates.rejectionReason || null
      ]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error updating certificate request:', error);
    return null;
  }
}

export async function saveZkpCommitment({ credentialHash, studentId, commitment, nonce }) {
  try {
    const result = await pool.query(
      `INSERT INTO zkp_commitments (commitment, credential_hash, student_id, nonce)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (commitment) DO UPDATE SET
         credential_hash = EXCLUDED.credential_hash,
         student_id = EXCLUDED.student_id,
         nonce = EXCLUDED.nonce
       RETURNING *`,
      [commitment.toLowerCase(), credentialHash.toLowerCase(), studentId, nonce]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error saving ZKP commitment:', error);
    return null;
  }
}

export async function getZkpCommitment(commitment) {
  try {
    const result = await pool.query(
      'SELECT * FROM zkp_commitments WHERE commitment = $1',
      [commitment.toLowerCase()]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting ZKP commitment:', error);
    return null;
  }
}

export async function deleteDocument(credentialHash) {
  try {
    const result = await pool.query(
      'DELETE FROM documents WHERE credential_hash = $1 RETURNING *',
      [credentialHash.toLowerCase()]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error deleting document:', error);
    return null;
  }
}

// Admin Dashboard - Get all students
export async function getAllStudents() {
  try {
    const result = await pool.query(
      `SELECT sd.student_id, sd.did, sd.created_at,
              COUNT(DISTINCT br.credential_hash) as credential_count,
              COUNT(DISTINCT d.id) as document_count
       FROM student_dids sd
       LEFT JOIN batch_results br ON sd.student_id = br.student_id
       LEFT JOIN documents d ON sd.student_id = d.student_id
       GROUP BY sd.student_id, sd.did, sd.created_at
       ORDER BY sd.created_at DESC`
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all students:', error);
    return [];
  }
}

// Admin Dashboard - Get all issuers
export async function getAllIssuers() {
  try {
    const result = await pool.query(
      `SELECT issuer_id, total_issued_attempts, total_issued_on_chain, 
              chain_errors, total_revocations, risk_score_count, risk_score_sum,
              last_updated_at
       FROM issuer_stats
       ORDER BY total_issued_on_chain DESC`
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all issuers:', error);
    return [];
  }
}

// Admin Dashboard - Get all credentials
export async function getAllCredentials() {
  try {
    const result = await pool.query(
      `SELECT br.credential_hash, br.student_id, br.issuer_id, 
              br.certificate_number, br.ipfs_cid, br.tx_hash, br.chain_error,
              br.risk_score, br.risk_model, br.ai_error, br.created_at,
              CASE WHEN br.tx_hash IS NOT NULL THEN true ELSE false END as on_chain
       FROM batch_results br
       ORDER BY br.created_at DESC`
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all credentials:', error);
    return [];
  }
}

// Admin Dashboard - Delete student
export async function deleteStudent(studentId) {
  try {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM documents WHERE student_id = $1', [studentId]);
    await pool.query('DELETE FROM batch_results WHERE student_id = $1', [studentId]);
    await pool.query('DELETE FROM student_dids WHERE student_id = $1', [studentId]);
    await pool.query('COMMIT');
    return true;
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error deleting student:', error);
    return false;
  }
}

// Admin Dashboard - Delete credential
export async function deleteCredential(credentialHash) {
  try {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM documents WHERE credential_hash = $1', [credentialHash.toLowerCase()]);
    await pool.query('DELETE FROM batch_results WHERE credential_hash = $1', [credentialHash.toLowerCase()]);
    await pool.query('COMMIT');
    return true;
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error deleting credential:', error);
    return false;
  }
}

// Admin Dashboard - Delete document by ID
export async function deleteDocumentById(id) {
  try {
    const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error deleting document:', error);
    return null;
  }
}

// Admin Dashboard - Delete issuer stats
export async function deleteIssuer(issuerId) {
  try {
    const result = await pool.query('DELETE FROM issuer_stats WHERE issuer_id = $1 RETURNING *', [issuerId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error deleting issuer:', error);
    return null;
  }
}

export { pool };

