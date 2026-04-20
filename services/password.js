// services/password.js
//
// Lightweight password hashing using Node's built-in crypto.scrypt.
// scrypt is a memory-hard KDF designed for password storage and is
// production-suitable. No native compilation needed.
const crypto = require('node:crypto');

function hash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verify(password, stored) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(derived, 'hex'));
}

module.exports = { hash, verify };
