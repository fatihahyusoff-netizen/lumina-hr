const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function daysBetween(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
}

/* ---------------- BOOTSTRAP ---------------- */
router.get('/bootstrap', async (req, res) => {
  if (req.user.role === 'hr') {
    const employees = await db.prepare(`
      SELECT e.*, CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END AS has_login
      FROM employees e LEFT JOIN users u ON u.employee_id = e.id
    `).all();
    const payroll = await db.prepare(`
      SELECT p.*, e.name FROM payroll p JOIN employees e ON e.id = p.emp_id
    `).all();
    const leave = await db.prepare(`
      SELECT l.*, e.name FROM leave_requests l JOIN employees e ON e.id = l.emp_id ORDER BY l.id
    `).all();
    const attendance = await db.prepare(`
      SELECT a.*, e.name FROM attendance a JOIN employees e ON e.id = a.emp_id
    `).all();
    const jobs = await db.prepare('SELECT * FROM jobs').all();
    const candidates = await db.prepare('SELECT * FROM candidates').all();
    const performanceRows = await db.prepare('SELECT * FROM performance').all();
    const performance = performanceRows.map(p => ({ ...p, kpis: JSON.parse(p.kpis) }));
    const onboardingRows = await db.prepare("SELECT * FROM onboarding WHERE kind = 'onboarding'").all();
    const onboarding = onboardingRows.map(o => ({ ...o, tasks: JSON.parse(o.tasks) }));
    const offboardingRows = await db.prepare("SELECT * FROM onboarding WHERE kind = 'offboarding'").all();
    const offboarding = offboardingRows.map(o => ({ ...o, tasks: JSON.parse(o.tasks) }));
    return res.json({ role: 'hr', employees, payroll, leave, attendance, jobs, candidates, performance, onboarding, offboarding });
  } else {
    const empId = req.user.employee_id;
    const me = await db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
    const payroll = await db.prepare('SELECT * FROM payroll WHERE emp_id = ?').get(empId);
    const leave = await db.prepare('SELECT * FROM leave_requests WHERE emp_id = ? ORDER BY id').all(empId);
    const attendance = await db.prepare('SELECT * FROM attendance WHERE emp_id = ?').all(empId);
    const performanceRow = await db.prepare('SELECT * FROM performance WHERE emp_id = ?').get(empId);
    const performance = performanceRow ? { ...performanceRow, kpis: JSON.parse(performanceRow.kpis) } : null;
    return res.json({ role: 'employee', me, payroll, leave, attendance, performance });
  }
});

/* ---------------- EMPLOYEES ---------------- */
const bcrypt = require('bcryptjs');
const { generateUniqueEmail, generatePassword } = require('../utils/credentials');

router.post('/employees', requireRole('hr'), async (req, res) => {
  const { name, role, dept, type, salary, branch } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Employee name is required.' });
  const annualSalary = Math.max(0, parseInt(salary, 10) || 60000);
  const countRow = await db.prepare('SELECT COUNT(*) c FROM employees').get();
  const id = 'EMP-' + (1000 + countRow.c + 1);
  const avatar = name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const email = await generateUniqueEmail(db, name);
  const joined = new Date().toISOString().slice(0, 10);

  await db.prepare(`INSERT INTO employees (id,name,email,role,dept,type,status,joined,manager,salary,tax_id,leave_balance,avatar,branch)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, email, role || 'Team Member', dept || 'General', type || 'Full-time', 'Active', joined, '—', annualSalary, 'TX-PENDING', 12, avatar, branch || null);

  await db.prepare('INSERT INTO payroll (emp_id, base, tax, benefits, status) VALUES (?,?,?,?,?)')
    .run(id, annualSalary / 12, 0.2, 0, 'Processing');

  const password = generatePassword();
  const passwordHash = bcrypt.hashSync(password, 10);
  await db.prepare('INSERT INTO users (email, password_hash, role, employee_id) VALUES (?,?,?,?)')
    .run(email, passwordHash, 'employee', id);

  const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').get(id);

  const defaultTasks = JSON.stringify([
    { label: 'Sign employment contract', done: false },
    { label: 'Submit tax documentation', done: false },
    { label: 'IT: assign laptop & credentials', done: false },
    { label: 'Complete orientation module', done: false },
    { label: 'Manager 1:1 scheduled', done: false },
  ]);
  await db.prepare(`INSERT INTO onboarding (emp_ref, name, role, kind, date_label, tasks) VALUES (?,?,?,?,?,?)`)
    .run(id, name, role || 'Team Member', 'onboarding', `Starts ${joined}`, defaultTasks);

  res.status(201).json({ employee, credentials: { email, password } });
});

// Create a login for an employee who doesn't have one yet (e.g. seeded employees)
router.put('/employees/:id/generate-login', requireRole('hr'), async (req, res) => {
  const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const existing = await db.prepare('SELECT * FROM users WHERE employee_id = ?').get(req.params.id);
  if (existing) return res.status(400).json({ error: 'This employee already has a login account.' });

  const password = generatePassword();
  const passwordHash = bcrypt.hashSync(password, 10);
  await db.prepare('INSERT INTO users (email, password_hash, role, employee_id) VALUES (?,?,?,?)')
    .run(employee.email, passwordHash, 'employee', employee.id);

  res.status(201).json({ credentials: { email: employee.email, password } });
});

router.put('/employees/:id', requireRole('hr'), async (req, res) => {
  const fields = ['name', 'email', 'role', 'dept', 'type', 'status', 'manager', 'salary', 'branch, 'joined', 'tax_id', 'leave_balance'];
  const updates = [];
  const values = [];
  fields.forEach(f => {
    if (req.body[f] !== undefined) { updates.push(`${f === 'role' ? 'role' : f} = ?`); values.push(req.body[f]); }
  });
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });
  values.push(req.params.id);
  await db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json(await db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id));
});

/* ---------------- PAYROLL ---------------- */
router.put('/payroll/:empId/pay', requireRole('hr'), async (req, res) => {
  await db.prepare(`UPDATE payroll SET status = 'Paid' WHERE emp_id = ?`).run(req.params.empId);
  res.json({ ok: true });
});

/* ---------------- LEAVE ---------------- */
router.post('/leave', async (req, res) => {
  const empId = req.user.role === 'employee' ? req.user.employee_id : req.body.empId;
  const { type, from, to } = req.body || {};
  if (!empId || !type || !from || !to) return res.status(400).json({ error: 'Leave type and both dates are required.' });
  const countRow = await db.prepare('SELECT COUNT(*) c FROM leave_requests').get();
  const id = 'L-' + (countRow.c + 1);
  const days = daysBetween(from, to);
  await db.prepare(`INSERT INTO leave_requests (id, emp_id, type, from_date, to_date, days, status) VALUES (?,?,?,?,?,?,?)`)
    .run(id, empId, type, from, to, days, 'Pending');
  res.status(201).json({ id, empId, type, from, to, days, status: 'Pending' });
});

router.put('/leave/:id/decision', requireRole('hr'), async (req, res) => {
  const { status } = req.body || {};
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
  await db.prepare('UPDATE leave_requests SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

/* ---------------- ATTENDANCE ---------------- */
router.post('/attendance/clock', async (req, res) => {
  const empId = req.user.employee_id;
  const { action } = req.body || {}; // 'in' | 'out'
  const today = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 5);
  let row = await db.prepare('SELECT * FROM attendance WHERE emp_id = ? AND date = ?').get(empId, today);
  if (!row) {
    await db.prepare('INSERT INTO attendance (emp_id, date, clock_in, clock_out, hours, status) VALUES (?,?,?,?,?,?)')
      .run(empId, today, action === 'in' ? time : null, action === 'out' ? time : null, 0, 'On time');
  } else {
    if (action === 'in') await db.prepare('UPDATE attendance SET clock_in = ? WHERE id = ?').run(time, row.id);
    if (action === 'out') await db.prepare('UPDATE attendance SET clock_out = ? WHERE id = ?').run(time, row.id);
  }
  res.json({ ok: true, time });
});

/* ---------------- ATS ---------------- */
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];

router.post('/jobs', requireRole('hr'), async (req, res) => {
  const { title, dept, openings } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Job title is required.' });
  const countRow = await db.prepare('SELECT COUNT(*) c FROM jobs').get();
  const id = 'J-' + (countRow.c + 1);
  const posted = new Date().toISOString().slice(0, 10);
  await db.prepare('INSERT INTO jobs (id, title, dept, openings, posted) VALUES (?,?,?,?,?)')
    .run(id, title, dept || 'General', Math.max(1, parseInt(openings, 10) || 1), posted);
  res.status(201).json(await db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
});

router.post('/candidates', requireRole('hr'), async (req, res) => {
  const { name, role } = req.body || {};
  if (!name || !role) return res.status(400).json({ error: 'Candidate name and role are required.' });
  const countRow = await db.prepare('SELECT COUNT(*) c FROM candidates').get();
  const id = 'C-' + (countRow.c + 1);
  const applied = new Date().toISOString().slice(0, 10);
  await db.prepare('INSERT INTO candidates (id, name, role, stage, applied) VALUES (?,?,?,?,?)')
    .run(id, name, role, 'Applied', applied);
  res.status(201).json(await db.prepare('SELECT * FROM candidates WHERE id = ?').get(id));
});

router.put('/candidates/:id/advance', requireRole('hr'), async (req, res) => {
  const c = await db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidate not found.' });
  const idx = STAGES.indexOf(c.stage);
  if (idx < STAGES.length - 1) {
    const nextStage = STAGES[idx + 1];
    await db.prepare('UPDATE candidates SET stage = ? WHERE id = ?').run(nextStage, c.id);
    return res.json({ ok: true, stage: nextStage });
  }
  res.json({ ok: true, stage: c.stage });
});

/* ---------------- OFFBOARDING ---------------- */
router.post('/employees/:id/offboard', requireRole('hr'), async (req, res) => {
  const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const { lastDate } = req.body || {};
  const last = lastDate || new Date().toISOString().slice(0, 10);

  await db.prepare(`UPDATE employees SET status = 'Offboarding' WHERE id = ?`).run(employee.id);

  const existing = await db.prepare('SELECT * FROM onboarding WHERE emp_ref = ? AND kind = ?').get(employee.id, 'offboarding');
  if (!existing) {
    const defaultTasks = JSON.stringify([
      { label: 'Exit interview scheduled', done: false },
      { label: 'Collect laptop & badge', done: false },
      { label: 'Revoke system access', done: false },
      { label: 'Final payroll settlement', done: false },
    ]);
    await db.prepare(`INSERT INTO onboarding (emp_ref, name, role, kind, date_label, tasks) VALUES (?,?,?,?,?,?)`)
      .run(employee.id, employee.name, employee.role, 'offboarding', `Last day ${last}`, defaultTasks);
  }
  res.json({ ok: true });
});

/* ---------------- ONBOARDING / OFFBOARDING ---------------- */
router.put('/onboarding/:ref/task', requireRole('hr'), async (req, res) => {
  const { index, kind } = req.body || {};
  const checklistKind = kind === 'offboarding' ? 'offboarding' : 'onboarding';
  const row = await db.prepare('SELECT * FROM onboarding WHERE emp_ref = ? AND kind = ?').get(req.params.ref, checklistKind);
  if (!row) return res.status(404).json({ error: 'Checklist not found.' });
  const tasks = JSON.parse(row.tasks);
  if (!tasks[index]) return res.status(400).json({ error: 'Invalid task index.' });
  tasks[index].done = !tasks[index].done;
  await db.prepare('UPDATE onboarding SET tasks = ? WHERE id = ?').run(JSON.stringify(tasks), row.id);
  res.json({ ok: true, tasks });
});

module.exports = router;
