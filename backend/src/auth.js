import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

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

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    { 
      userId: user.userId, 
      role: user.role,
      issuerId: user.issuerId 
    },
    process.env.JWT_SECRET || 'default-secret-key',
    { expiresIn: '24h' }
  );
}

// Simple in-memory user store (in production, use database)
const users = new Map();

// Demo users for testing
export function initDemoUsers() {
  // Institution user
  users.set('institution@decaid.com', {
    userId: 'institution-1',
    email: 'institution@decaid.com',
    password: '$2b$10$demo.hashed.password.here', // In production, hash properly
    role: 'institution',
    issuerId: 'DEMO-UNIVERSITY'
  });

  // Employer user
  users.set('employer@decaid.com', {
    userId: 'employer-1',
    email: 'employer@decaid.com',
    password: '$2b$10$demo.hashed.password.here',
    role: 'employer'
  });

  // Student user
  users.set('student@decaid.com', {
    userId: 'student-1',
    email: 'student@decaid.com',
    password: '$2b$10$demo.hashed.password.here',
    role: 'student'
  });
}

// Authenticate user
export function authenticateUser(email, password) {
  const user = users.get(email);
  if (!user) {
    return null;
  }
  
  // In production, use bcrypt.compare
  // For demo purposes, we'll accept any password for demo users
  if (email.endsWith('@decaid.com')) {
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
      issuerId: user.issuerId
    };
  }
  
  return null;
}
