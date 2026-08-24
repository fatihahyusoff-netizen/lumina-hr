# LUMINA HR System — Backend + Database

A real HR system: Node.js/Express API, SQLite database, JWT authentication,
and the LUMINA frontend wired up to it. No demo data, no built-in accounts —
you create your own HR account the first time you open it.

## What's inside

```
lumina-backend/
  server.js              → Express app entry point
  db/
    index.js              → SQLite connection + schema (auto-creates tables, no seeding)
  middleware/
    auth.js                → JWT sign/verify + role-based access control
  utils/
    credentials.js          → generates unique emails + random passwords for new employees
  routes/
    auth.routes.js           → setup, login, change-password
    api.routes.js             → everything else (employees, payroll, leave, hiring, etc.)
  public/
    index.html               → the LUMINA frontend (talks to the API, no fake data)
```

## Run it locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open **http://localhost:4000** in your browser.

**The database starts genuinely empty.** The first time you open the app, you'll see
a "Create your HR account" screen instead of a login form. Fill in your name, work
email, and a password — that becomes your real HR administrator account. Everything
from that point on (employees, jobs, candidates, leave, payroll) is real data in your
own database.

To wipe everything and start fresh, delete `db/lumina.db*` and restart the server —
you'll land back on the setup screen.

## How employee accounts work

- **HR creates every employee account.** Adding an employee (Employee Database →
  "+ Add employee") auto-generates a unique email and a random temporary password,
  shown once in a popup right after creation. Copy it and send it to the employee —
  it's stored only as a bcrypt hash, never in plain text, and won't be shown again.
- **Anyone can change their own password** from "My Account" — no admin needed.
- **Offboarding** — open an employee's profile and click "Offboard" to mark them as
  leaving and auto-generate an exit checklist (access revocation, asset return, final
  payroll settlement).
- **Hiring** — post jobs and add candidates from the Hiring (ATS) page; move
  candidates through stages with one click.

## How it works under the hood

- Passwords are hashed with bcrypt — never stored in plain text.
- Login returns a JWT, stored in the browser's `localStorage`, sent as
  `Authorization: Bearer <token>` on every request.
- Every write endpoint checks the role in the token — an employee token cannot hit
  HR-only routes (add employee, approve leave, mark payroll paid, etc.), even by
  calling the API directly.
- All data lives in `db/lumina.db`, a real SQLite file — restart the server, refresh
  the browser, come back tomorrow: everything is still there.

## Before this goes live with real employee data, you should still:

1. **Change the JWT secret.** Set a real `JWT_SECRET` environment variable
   (see `.env.example`) — don't use the default dev value in production.
2. **Add HTTPS.** Whichever host you deploy to should terminate TLS — never send
   login credentials over plain HTTP.
3. **Add rate limiting** on login and setup endpoints to prevent brute-force attempts.
4. **Back up `db/lumina.db` regularly** — it's one file, convenient but a single
   point of failure without backups.
5. **Plan for scale.** SQLite is genuinely fine for a small team. If you outgrow a
   single file, migrate to PostgreSQL (the query style here translates easily) —
   ask me when you're ready and I'll do the conversion.

## Deploying it live

Any Node.js host that runs a persistent server works (this does **not** run on
Vercel/Netlify as-is — those are serverless and don't support a local SQLite file;
ask me if you want it converted for that).

**Render.com (free tier available)**
1. Push this folder to a GitHub repo.
2. Create a new "Web Service" on Render, connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Add an environment variable `JWT_SECRET` with a long random value.
5. Render gives you a public HTTPS URL. Open it — you'll see the setup screen,
   same as running locally. Create your real HR account there.

**Railway.app** works the same way — connect the repo, it auto-detects Node,
add the `JWT_SECRET` environment variable.

Note: on most free hosting tiers, the filesystem (and therefore `lumina.db`) may
reset on redeploys. Fine while testing; for real ongoing use, move to a managed
Postgres database (Render, Railway, and Supabase all offer free tiers) — ask me
when you're ready for that step.

## API reference (quick)

| Method | Path                          | Who       | What                          |
|--------|--------------------------------|-----------|-------------------------------|
| GET    | /api/auth/status               | anyone    | check if setup is needed      |
| POST   | /api/auth/setup                | anyone*   | create the first HR account   |
| POST   | /api/auth/login                 | anyone    | log in, get a token           |
| PUT    | /api/auth/change-password        | logged in | change your own password      |
| GET    | /api/bootstrap                    | logged in | role-aware data snapshot      |
| POST   | /api/employees                     | HR        | add an employee (auto login)  |
| PUT    | /api/employees/:id                  | HR        | update an employee            |
| PUT    | /api/employees/:id/generate-login    | HR        | create login for existing emp |
| POST   | /api/employees/:id/offboard           | HR        | start offboarding + checklist |
| PUT    | /api/payroll/:empId/pay                | HR        | mark payroll as paid          |
| POST   | /api/leave                              | logged in | submit a leave request        |
| PUT    | /api/leave/:id/decision                  | HR        | approve/reject leave          |
| POST   | /api/attendance/clock                     | logged in | clock in/out                  |
| POST   | /api/jobs                                  | HR        | post a job                    |
| POST   | /api/candidates                             | HR        | add a candidate                |
| PUT    | /api/candidates/:id/advance                  | HR        | move candidate to next stage  |
| PUT    | /api/onboarding/:ref/task                     | HR        | toggle a checklist item       |

\* `/api/auth/setup` only works once — it returns an error if any account already exists.
