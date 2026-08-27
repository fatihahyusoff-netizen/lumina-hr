const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Tells the frontend whether this is a brand-new install with no accounts yet.
router.get('/status', async (req, res) => {
  const row = await db.prepare('SELECT COUNT(*) c FROM users').get();
  res.json({ needsSetup: row.c === 0 });
});

// One-time: creates the first HR administrator account. Locked once any user exists.
router.post('/setup', async (req, res) => {
  const row = await db.prepare('SELECT COUNT(*) c FROM users').get();
  if (row.c > 0) return res.status(403).json({ error: 'Setup has already been completed for this system.' });

  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are all required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const cleanEmail = String(email).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  const id = 'EMP-1001';
  const avatar = name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const joined = new Date().toISOString().slice(0, 10);
  await db.prepare(`INSERT INTO employees (id,name,email,role,dept,type,status,joined,manager,salary,tax_id,leave_balance,avatar)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, cleanEmail, 'HR Administrator', 'People', 'Full-time', 'Active', joined, '—', 0, '', 0, avatar);

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = await db.prepare('INSERT INTO users (email, password_hash, role, employee_id) VALUES (?,?,?,?)')
    .run(cleanEmail, passwordHash, 'hr', id);

  const user = { id: result.lastInsertRowid, email: cleanEmail, role: 'hr', employee_id: id };
  const token = signToken(user);
  res.status(201).json({ token, user: { role: 'hr', email: cleanEmail, name, employee_id: id } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').get(user.employee_id);
  const token = signToken(user);
  res.json({
    token,
    user: { role: user.role, email: user.email, name: employee ? employee.name : user.email, employee_id: user.employee_id },
  });
});

router.put('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(req.user.email);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  const ok = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  const newHash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  res.json({ ok: true });
});

module.exports = router;
