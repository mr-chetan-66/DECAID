import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { getUserByEmail, createUser, updateUserRole } from './database.js';

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// Rate limiting
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { ok: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 sensitive requests per windowMs
  message: { ok: false, error: 'Too many sensitive requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// JWT Authentication middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ ok: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Optional authentication - doesn't fail if no token
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key', (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
}

// Role-based access control middleware
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
    }

    next();
  };
}

// Institution-specific access control
export function requireInstitutionAccess(req, res, next) {
  if (!req.user || req.user.role !== 'institution') {
    return res.status(403).json({ ok: false, error: 'Institution access required' });
  }

  // For institution routes, ensure they can only access their own data
  const requestedIssuerId = req.params.issuerId || req.body.issuerId;
  if (requestedIssuerId && requestedIssuerId !== req.user.issuerId) {
    return res.status(403).json({ ok: false, error: 'Access denied to this institution data' });
  }

  next();
}

// Student-specific access control
export function requireStudentAccess(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ ok: false, error: 'Student access required' });
  }

  // Students can only access their own data
  const requestedStudentId = req.params.studentId || req.body.studentId;
  if (requestedStudentId && requestedStudentId !== req.user.studentId) {
    return res.status(403).json({ ok: false, error: 'Access denied to this student data' });
  }

  next();
}

// Admin-only access control
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
}

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    { 
      userId: user.userId, 
      email: user.email,
      role: user.role,
      issuerId: user.issuerId,
      studentId: user.studentId
    },
    process.env.JWT_SECRET || 'default-secret-key',
    { expiresIn: '24h' }
  );
}

// Verify Google OAuth token
export async function verifyGoogleToken(token) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload.email_verified) {
      throw new Error('Google email not verified');
    }

    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      googleId: payload.sub
    };
  } catch (error) {
    throw new Error('Invalid Google token: ' + error.message);
  }
}

// Authenticate or create user via Google
export async function authenticateGoogleUser(googleData) {
  let user = await getUserByEmail(googleData.email);
  
  if (!user) {
    // Create new user - they'll need to select a role
    user = await createUser({
      email: googleData.email,
      name: googleData.name,
      picture: googleData.picture,
      googleId: googleData.googleId,
      role: 'pending' // Will be updated after onboarding
    });
  } else {
    // Update existing user's Google info if needed
    if (!user.google_id) {
      await updateUserRole(user.user_id, { 
        google_id: googleData.googleId,
        picture: googleData.picture 
      });
    }
  }

  return {
    userId: user.user_id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    role: user.role,
    issuerId: user.issuer_id,
    studentId: user.student_id,
    needsOnboarding: user.role === 'pending'
  };
}

// Legacy demo user support (for backward compatibility)
export function initDemoUsers() {
  // Demo users are now handled in database
  console.log('Demo users initialized in database');
}

// Legacy email/password auth (for backward compatibility)
export function authenticateUser(email, password) {
  // This is deprecated - use Google OAuth instead
  console.warn('Legacy email/password authentication is deprecated');
  return null;
}
