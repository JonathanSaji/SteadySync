const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const app = express();
const port = process.env.PORT || 5050;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to Website/.env or root .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let accountTableCache = null;

async function resolveAccountTable() {
  if (accountTableCache) return accountTableCache;

  if (process.env.AUTH_USERS_TABLE) {
    accountTableCache = process.env.AUTH_USERS_TABLE;
    return accountTableCache;
  }

  const usersTable = await pool.query("SELECT to_regclass('public.users') AS table_name");
  if (usersTable.rows[0].table_name) {
    accountTableCache = 'users';
    return accountTableCache;
  }

  const accountsTable = await pool.query("SELECT to_regclass('public.accounts') AS table_name");
  if (accountsTable.rows[0].table_name) {
    accountTableCache = 'accounts';
    return accountTableCache;
  }

  throw new Error('Neither public.users nor public.accounts exists.');
}

app.use(express.json());

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;

  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;

  const attemptedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const originalBuffer = Buffer.from(originalHash, 'hex');
  const attemptedBuffer = Buffer.from(attemptedHash, 'hex');

  if (originalBuffer.length !== attemptedBuffer.length) return false;
  return crypto.timingSafeEqual(originalBuffer, attemptedBuffer);
}

function sanitizeUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name || row.username
  };
}

app.post('/api/login', async (req, res) => {
  const identity = (req.body?.identity || '').trim();
  const password = req.body?.password || '';

  if (!identity || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  try {
    const accountTable = await resolveAccountTable();
    const query = `
      SELECT id, username, email, display_name, password_hash
      FROM ${accountTable}
      WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)
      LIMIT 1
    `;

    const result = await pool.query(query, [identity]);

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const user = result.rows[0];
    const isValid = verifyPassword(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    await pool.query(`UPDATE ${accountTable} SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    return res.json({ user: sanitizeUserRow(user) });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Unable to log in right now.' });
  }
});

app.post('/api/signup', async (req, res) => {
  const username = (req.body?.username || '').trim();
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const accountTable = await resolveAccountTable();
    const passwordHash = hashPassword(password);
    const query = `
      INSERT INTO ${accountTable} (username, email, password_hash, display_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, display_name
    `;

    const result = await pool.query(query, [username, email, passwordHash, username]);
    return res.status(201).json({ user: sanitizeUserRow(result.rows[0]) });
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    console.error('Signup error:', error.message);
    return res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

app.use(express.static(__dirname));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`SteadySync Website running on http://127.0.0.1:${port}`);
});
