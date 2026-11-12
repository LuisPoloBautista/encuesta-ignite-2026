const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 10000);
const databaseUrl = process.env.DATABASE_URL;
const adminToken = process.env.ADMIN_TOKEN;
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD;

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/submit', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8' }));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

let pool;
if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  pool.on('error', (error) => console.error('database_pool_error', error));
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id UUID PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      country TEXT NOT NULL,
      role TEXT NOT NULL,
      contact_phone TEXT,
      answers JSONB NOT NULL,
      questionnaire_version TEXT NOT NULL DEFAULT '2026.1'
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS survey_responses_submitted_at_idx ON survey_responses (submitted_at DESC)');
  await pool.query('ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY');
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.survey_responses FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.survey_responses FROM authenticated';
      END IF;
    END
    $$
  `);
}

function cleanText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validatePayload(body) {
  const answers = body && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
  const identity = answers.identity && typeof answers.identity === 'object' ? answers.identity : {};
  const required = ['full_name', 'email', 'institution_name', 'country', 'role'];
  const missing = required.filter((key) => !cleanText(identity[key]));
  if (missing.length) return { error: 'Faltan datos obligatorios de identificación.' };
  if (!/^\S+@\S+\.\S+$/.test(cleanText(identity.email))) return { error: 'El correo no tiene un formato válido.' };
  if (!Array.isArray(answers.products) || answers.products.length === 0) return { error: 'Selecciona al menos un producto o la opción “Ninguno”.' };
  return {
    answers,
    identity: {
      full_name: cleanText(identity.full_name, 160),
      email: cleanText(identity.email, 254).toLowerCase(),
      institution_name: cleanText(identity.institution_name, 200),
      country: cleanText(identity.country, 100),
      role: cleanText(identity.role, 160),
      contact_phone: cleanText(identity.contact_phone, 50) || null
    }
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: pool ? 'postgresql' : 'not-configured' });
});

app.post('/api/submit', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'El almacenamiento aún no está configurado. Agrega DATABASE_URL en Render.' });
  const parsed = validatePayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const id = crypto.randomUUID();
  const startedAt = new Date(req.body.startedAt || Date.now());
  const safeStartedAt = Number.isNaN(startedAt.getTime()) ? new Date() : startedAt;
  const { identity, answers } = parsed;

  try {
    await pool.query(
      `INSERT INTO survey_responses
       (id, started_at, full_name, email, institution_name, country, role, contact_phone, answers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, safeStartedAt, identity.full_name, identity.email, identity.institution_name, identity.country, identity.role, identity.contact_phone, answers]
    );
    res.status(201).json({ ok: true, id });
  } catch (error) {
    console.error('submit_error', error);
    res.status(500).json({ error: 'No fue posible guardar la respuesta. Inténtalo nuevamente.' });
  }
});

function requireAdmin(req, res, next) {
  if (!adminPassword && !adminToken) return res.status(503).json({ error: 'Las credenciales administrativas no están configuradas.' });
  const authorization = req.get('authorization') || '';
  let valid = false;
  if (adminPassword && authorization.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const suppliedUser = separator >= 0 ? decoded.slice(0, separator) : '';
      const suppliedPassword = separator >= 0 ? decoded.slice(separator + 1) : '';
      valid = safeEqual(suppliedUser, adminUser) && safeEqual(suppliedPassword, adminPassword);
    } catch { valid = false; }
  } else if (adminToken && authorization.startsWith('Bearer ')) {
    valid = safeEqual(authorization.slice(7), adminToken);
  }
  if (!valid) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Administración Ignite", charset="UTF-8"');
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  next();
}

function safeEqual(supplied, expected) {
  const left = Buffer.from(String(supplied));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function flatten(value, prefix = '', output = {}) {
  if (Array.isArray(value)) {
    output[prefix] = value.join(' | ');
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => flatten(nested, prefix ? `${prefix}.${key}` : key, output));
  } else if (prefix) {
    output[prefix] = value ?? '';
  }
  return output;
}

app.get('/api/export.xlsx', requireAdmin, async (_req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL no está configurado.' });
  try {
    const { rows } = await pool.query('SELECT * FROM survey_responses ORDER BY submitted_at DESC');
    const flattened = rows.map((row) => ({
      ID: row.id,
      'Hora de inicio': row.started_at,
      'Hora de finalización': row.submitted_at,
      'Correo de la cuenta': '',
      'Nombre de la cuenta': '',
      'Hora de la última modificación': row.updated_at,
      'Nombre completo': row.full_name,
      Correo: row.email,
      'Nombre de la institución': row.institution_name,
      País: row.country,
      Cargo: row.role,
      'Número de contacto': row.contact_phone || '',
      ...flatten(row.answers)
    }));
    const keys = [...new Set(flattened.flatMap((row) => Object.keys(row)))];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ignite Online';
    const sheet = workbook.addWorksheet('Respuestas', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = keys.map((key) => ({ header: key, key, width: Math.min(42, Math.max(14, key.length + 2)) }));
    flattened.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6900' } };
    sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(keys.length || 1).letter}1` };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="respuestas-ignite-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('export_error', error);
    res.status(500).json({ error: 'No fue posible generar el Excel.' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL no está configurado.' });
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS total, MAX(submitted_at) AS last_submission FROM survey_responses');
    res.json({ total: rows[0].total, lastSubmission: rows[0].last_submission });
  } catch (error) {
    console.error('admin_stats_error', error);
    res.status(500).json({ error: 'No fue posible consultar las respuestas.' });
  }
});

ensureSchema()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`Ignite survey listening on ${port}`)))
  .catch((error) => {
    console.error('database_startup_error', error);
    process.exit(1);
  });
