const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
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
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'steadysync-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function verifyPasswordAsync(password, hash) {
  const [salt, storedHash] = hash.split(':');
  const derivedHash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, hash) => {
      if (err) reject(err);
      resolve(hash.toString('hex'));
    });
  });
  return crypto.timingSafeEqual(Buffer.from(derivedHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function sanitizeUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name || row.username
  };
}

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ----------------------------------------------------------------
// AUTH ROUTES
// ----------------------------------------------------------------

app.post('/api/login', async (req, res) => {
  const identity = (req.body?.identity || '').trim().toLowerCase();
  const password = req.body?.password || '';

  if (!identity || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  try {
    const accountTable = await resolveAccountTable();
    const query = `
      SELECT id, username, email, display_name, password_hash
      FROM ${accountTable}
      WHERE LOWER(username) = $1 OR LOWER(email) = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [identity]);

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const user = result.rows[0];
    const isValid = await verifyPasswordAsync(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.email = user.email;

    await pool.query(`UPDATE ${accountTable} SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    return res.json({ success: true, user: sanitizeUserRow(user) });
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
    const user = result.rows[0];

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.email = user.email;

    return res.status(201).json({ success: true, user: sanitizeUserRow(user) });
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    console.error('Signup error:', error.message);
    return res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({ username: req.session.username, email: req.session.email });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ----------------------------------------------------------------
// SETTINGS ROUTES
// ----------------------------------------------------------------

/**
 * GET /api/settings
 * Returns the current user's settings from SteadySync.user_settings.
 * If no row exists yet, returns all-false defaults.
 */
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT steady_mouse, hitbox_enabled, snap_enabled, voice_enabled
       FROM "SteadySync".user_settings
       WHERE user_id = $1`,
      [req.session.userId]
    );

    if (result.rowCount === 0) {
      // No settings saved yet — return defaults
      return res.json({
        pathToggleEnabled: false,
        hitboxEnabled: false,
        snapEnabled: false,
        voiceEnabled: false
      });
    }

    const row = result.rows[0];
    return res.json({
      pathToggleEnabled: row.steady_mouse,
      hitboxEnabled:     row.hitbox_enabled,
      snapEnabled:       row.snap_enabled,
      voiceEnabled:      row.voice_enabled
    });
  } catch (error) {
    console.error('GET /api/settings error:', error.message);
    return res.status(500).json({ error: 'Failed to load settings.' });
  }
});

/**
 * PUT /api/settings
 * Upserts the current user's settings.
 * Body: { pathToggleEnabled, hitboxEnabled, snapEnabled, voiceEnabled }
 */
app.put('/api/settings', requireAuth, async (req, res) => {
  const {
    pathToggleEnabled = false,
    hitboxEnabled     = false,
    snapEnabled       = false,
    voiceEnabled      = false
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO "SteadySync".user_settings
         (user_id, steady_mouse, hitbox_enabled, snap_enabled, voice_enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         steady_mouse   = EXCLUDED.steady_mouse,
         hitbox_enabled = EXCLUDED.hitbox_enabled,
         snap_enabled   = EXCLUDED.snap_enabled,
         voice_enabled  = EXCLUDED.voice_enabled,
         updated_at     = NOW()`,
      [req.session.userId, pathToggleEnabled, hitboxEnabled, snapEnabled, voiceEnabled]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('PUT /api/settings error:', error.message);
    return res.status(500).json({ error: 'Failed to save settings.' });
  }
});

/**
 * PATCH /api/settings
 * Updates a single setting by key.
 * Body: { setting: 'snapEnabled', value: true }
 */
app.patch('/api/settings', requireAuth, async (req, res) => {
  const { setting, value } = req.body;

  const columnMap = {
    pathToggleEnabled: 'steady_mouse',
    hitboxEnabled:     'hitbox_enabled',
    snapEnabled:       'snap_enabled',
    voiceEnabled:      'voice_enabled'
  };

  const column = columnMap[setting];
  if (!column) {
    return res.status(400).json({ error: `Unknown setting: ${setting}` });
  }

  try {
    await pool.query(
      `INSERT INTO "SteadySync".user_settings (user_id, ${column}, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         ${column}    = EXCLUDED.${column},
         updated_at   = NOW()`,
      [req.session.userId, Boolean(value)]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/settings error:', error.message);
    return res.status(500).json({ error: 'Failed to update setting.' });
  }
});

// ----------------------------------------------------------------

app.use(express.static(__dirname));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`SteadySync Website running on http://127.0.0.1:${port}`);
});