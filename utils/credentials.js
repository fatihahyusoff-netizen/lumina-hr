const crypto = require('crypto');

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).join('.');
}

async function generateUniqueEmail(db, name) {
  const base = slugify(name) || 'employee';
  let candidate = `${base}@lumina.com`;
  let n = 1;
  const exists = async (email) =>
    (await db.prepare('SELECT 1 FROM employees WHERE email = ?').get(email)) ||
    (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(email));
  while (await exists(candidate)) {
    n += 1;
    candidate = `${base}${n}@lumina.com`;
  }
  return candidate;
}

// Human-friendly random password: e.g. "Fj4-Km9-Tq2"
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const block = () => Array.from({ length: 3 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `${block()}-${block()}-${block()}`;
}

module.exports = { generateUniqueEmail, generatePassword };
