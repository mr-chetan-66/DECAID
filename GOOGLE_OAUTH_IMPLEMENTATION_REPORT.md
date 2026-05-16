# DECAID Authentication And Google OAuth Status Report

This file replaces the older "Google OAuth complete" report with the current authentication context in the workspace.

## Current Status

The active frontend authentication flow is not Google OAuth. The current login page uses the separate FastAPI auth service in `auth-service/main.py`.

Active flow:

```text
frontend LoginPage.jsx
  -> AuthContext.jsx
  -> http://127.0.0.1:8001/login
  -> auth-service/main.py
  -> SQLite auth.db
  -> JWT stored in localStorage as "token"
```

Current default user:

```text
username: admin
password: admin123
role: admin
```

Users can register with one of these roles:

- `student`
- `institution`
- `employer`
- `admin`

The role determines which frontend tabs are visible.

## Google OAuth Code Present In Backend

The backend still contains Google OAuth support:

- `backend/src/auth.js`
  - `OAuth2Client`
  - `verifyGoogleToken`
  - `authenticateGoogleUser`
  - JWT helper functions
  - role guard helpers
- `backend/src/index.js`
  - `POST /api/auth/google`
  - `POST /api/auth/onboarding`
  - `GET /api/auth/me`
- `backend/src/database.js`
  - `users` table with `google_id`, `role`, `issuer_id`, and `student_id`
  - demo Google-style users inserted during database initialization

The backend `.env.example` still includes:

```text
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
FRONTEND_URL=http://localhost:3000
```

## Google OAuth Not Wired In Current Frontend

The current frontend files are:

- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/App.jsx`
- `frontend/src/api.js`

The current frontend does not include a Google Sign-In button, Google identity script, Google token handler, or onboarding page connected to backend `/api/auth/google`.

Older report references such as `frontend/src/Login.jsx`, `frontend/src/auth.jsx`, and `frontend/src/Onboarding.jsx` do not match the current file structure.

## Auth Service Implementation

`auth-service/main.py` provides:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/register` | `POST` | Create username/password user |
| `/login` | `POST` | Verify password and return JWT |
| `/me` | `GET` | Return current user from bearer token |
| `/health` | `GET` | Auth service health |

Implementation details:

- SQLite database file: `auth.db`
- Password hashing: `bcrypt`
- JWT library: `python-jose`
- Token expiry: 24 hours
- Default CORS origins: `http://localhost:3000` and `http://127.0.0.1:3000`

## Backend Authentication Implementation

The Express backend has JWT and role helpers, but many credential demo endpoints are currently open for local testing. Examples:

- `authenticateToken`
- `optionalAuth`
- `requireRole`
- `requireInstitutionAccess`
- `requireStudentAccess`
- `requireAdmin`

Protected backend endpoints currently include:

- `POST /api/auth/onboarding`
- `GET /api/auth/me`
- `POST /api/blockchain/authorize-issuer`
- `POST /api/blockchain/deauthorize-issuer`
- `POST /api/students/:studentId/did`

Most credential issue and verification demo endpoints are intentionally easy to call during local demos.

## Recommended Wording For Project Presentation

Use this wording:

> DECAID currently uses a dedicated FastAPI authentication service for local username/password login and role-based UI access. The backend also contains Google OAuth support, but the current frontend demo is wired to the local auth service. Google OAuth can be reconnected as a future production authentication path.

Avoid saying:

> Google OAuth is fully implemented end-to-end in the current frontend.

That statement is not true for this workspace.

## Steps To Reactivate Google OAuth In The Frontend

1. Add a Google Identity Services button or package to the frontend.
2. Send the returned Google ID token to `POST /api/auth/google` on the Express backend.
3. Store the backend JWT consistently with the current auth context.
4. Add or restore onboarding UI for users whose backend role is `pending`.
5. Align frontend role state with backend fields:
   - `role`
   - `issuerId`
   - `studentId`
6. Confirm backend `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Confirm allowed OAuth origins include `http://localhost:3000`.
8. Add tests for login, onboarding, role tabs, and protected API calls.

## Security Notes

- Replace default JWT secrets before deployment.
- Do not use local Hardhat private keys outside development.
- Use HTTPS for browser authentication in production.
- Persist users in PostgreSQL or another production database.
- Protect institution, admin, and revocation endpoints before public deployment.
- Re-enable or tune rate limiting for production.

## Summary

The project currently has two authentication-related implementations:

1. Active frontend path: FastAPI username/password auth service on port `8001`.
2. Backend support path: Google OAuth/JWT routes in the Express backend, not connected to the current UI.

For local demos and testing, use the auth service. For a production version, either harden the auth service path or reconnect and test the backend Google OAuth path end to end.
