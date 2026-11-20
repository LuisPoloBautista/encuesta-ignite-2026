const path = require('node:path');
const fs = require('node:fs');
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
const productAdminUser = process.env.PRODUCT_ADMIN_USER;
const productAdminPassword = process.env.PRODUCT_ADMIN_PASSWORD;
const questionLabels = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'question-labels.json'), 'utf8'));
const targetInstitutions = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'institutions.json'), 'utf8'));
const COVERAGE_GOAL = 0.90;
const MX_HIDE = new Set(['cloudlabs', 'digitalia', 'ebsco', 'eds', 'sage']);
const MX_HIDDEN_PRODUCT_NAMES = ['CloudLabs', 'Digitalia', 'EBSCO', 'EDS (EBSCO Discovery Service)', 'Sage'];
const FORMATION_PRIORITY_KEYS = new Set(
  Object.entries(questionLabels)
    .filter(([key, label]) => key.startsWith('bank.priorities.') && label.includes('Ruta 4PROT · CloudLabs'))
    .map(([key]) => key.split('.').at(-1))
);

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

function mentionsMexicoHiddenProduct(value) {
  const text = normalized(value);
  return MX_HIDDEN_PRODUCT_NAMES.some((product) => text.includes(normalized(product)));
}

function stripMexicoHiddenProducts(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item !== 'string' || !mentionsMexicoHiddenProduct(item))
      .map(stripMexicoHiddenProducts);
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !MX_HIDE.has(normalized(key).replaceAll(' ', '')))
      .map(([key, nested]) => [key, stripMexicoHiddenProducts(nested)])
  );
}

function enforceMexicoRules(answers) {
  if (normalized(answers.identity?.country) !== 'mexico') return answers;
  const sanitized = stripMexicoHiddenProducts(answers);
  const has4Prot = Array.isArray(sanitized.products) && sanitized.products.includes('4PROT');
  if (!has4Prot && sanitized.bank?.priorities) {
    FORMATION_PRIORITY_KEYS.forEach((key) => { delete sanitized.bank.priorities[key]; });
  }
  return sanitized;
}

function sanitizedStoredAnswers(rawAnswers, country) {
  const answers = JSON.parse(JSON.stringify(rawAnswers || {}));
  if (!answers.identity || typeof answers.identity !== 'object') answers.identity = {};
  if (!answers.identity.country) answers.identity.country = country;
  return enforceMexicoRules(answers);
}

function validatePayload(body) {
  const rawAnswers = body && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
  const answers = enforceMexicoRules(JSON.parse(JSON.stringify(rawAnswers)));
  const identity = answers.identity && typeof answers.identity === 'object' ? answers.identity : {};
  const required = ['full_name', 'email', 'institution_name', 'country', 'role'];
  const missing = required.filter((key) => !cleanText(identity[key]));
  if (missing.length) return { error: 'Faltan datos obligatorios de identificación.' };
  if (!/^\S+@\S+\.\S+$/.test(cleanText(identity.email))) return { error: 'El correo no tiene un formato válido.' };
  if (!Array.isArray(answers.products) || answers.products.length === 0) return { error: 'Selecciona al menos un producto o la opción “Ninguno”.' };
  const selectedNone = answers.products.includes('Ninguno de los anteriores');
  const unlistedProduct = cleanText(answers.other_solution?.name, 200);
  if (selectedNone && !unlistedProduct) return { error: 'Indica qué producto o servicio tiene con Ignite.' };
  answers.other_solution = selectedNone ? { name: unlistedProduct } : {};
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
  const productAdminConfigured = Boolean(productAdminUser && productAdminPassword);
  if (!adminPassword && !adminToken && !productAdminConfigured) return res.status(503).json({ error: 'Las credenciales administrativas no están configuradas.' });
  const authorization = req.get('authorization') || '';
  let scope = '';
  if (adminPassword && authorization.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const suppliedUser = separator >= 0 ? decoded.slice(0, separator) : '';
      const suppliedPassword = separator >= 0 ? decoded.slice(separator + 1) : '';
      if (safeEqual(suppliedUser, adminUser) && safeEqual(suppliedPassword, adminPassword)) scope = 'full';
      else if (productAdminConfigured && safeEqual(suppliedUser, productAdminUser) && safeEqual(suppliedPassword, productAdminPassword)) scope = '4prot-cloudlabs';
    } catch { scope = ''; }
  } else if (productAdminConfigured && authorization.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const suppliedUser = separator >= 0 ? decoded.slice(0, separator) : '';
      const suppliedPassword = separator >= 0 ? decoded.slice(separator + 1) : '';
      if (safeEqual(suppliedUser, productAdminUser) && safeEqual(suppliedPassword, productAdminPassword)) scope = '4prot-cloudlabs';
    } catch { scope = ''; }
  } else if (adminToken && authorization.startsWith('Bearer ')) {
    if (safeEqual(authorization.slice(7), adminToken)) scope = 'full';
  }
  if (!scope) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Administración Ignite", charset="UTF-8"');
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  req.adminScope = scope;
  res.setHeader('Cache-Control', 'no-store');
  next();
}

function safeEqual(supplied, expected) {
  const left = Buffer.from(String(supplied));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function has4ProtOrCloudLabs(answers) {
  const products = Array.isArray(answers?.products) ? answers.products : [];
  return products.some((product) => ['4prot', 'cloudlabs'].includes(normalized(product).replaceAll(' ', '')));
}

function rowsForAdminScope(rows, scope) {
  if (scope !== '4prot-cloudlabs') return rows;
  return rows.filter((row) => has4ProtOrCloudLabs(sanitizedStoredAnswers(row.answers, row.country)));
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

function labeledAnswers(answers) {
  const flattened = flatten(answers);
  return Object.fromEntries(Object.entries(flattened).map(([key, value]) => [questionLabels[key] || readableFallback(key), value]));
}

function readableFallback(key) {
  return key.split('.').at(-1).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const PRODUCT_INTEREST_ALIASES = [
  ['Learning Space', ['learning space']],
  ['Cursos especializados', ['cursos especializados']],
  ['IG Publishing con IA', ['ig publishing']],
  ['Taylor & Francis', ['taylor francis']],
  ['CloudLabs', ['cloudlabs']],
  ['MyLOFT', ['myloft']],
  ['DSpace', ['dspace']],
  ['Koha', ['koha']],
  ['4PROT', ['4prot']],
  ['OJS', ['ojs']],
  ['Scintra', ['scintra']],
  ['Winkel', ['winkel']],
  ['LEMB', ['lemb']],
  ['Páginas web', ['paginas web', 'pagina web']],
  ['Otra necesidad', ['otra necesidad']]
];

function canonicalProductInterest(value) {
  const text = normalized(value);
  if (!text || text.includes('por ahora no requerimos informacion adicional')) return null;
  const match = PRODUCT_INTEREST_ALIASES.find(([, aliases]) => aliases.some((alias) => text.includes(alias)));
  return match?.[0] || null;
}

function getNested(object, pathValue) {
  return pathValue.split('.').reduce((value, key) => value?.[key], object);
}

function coverageSummary(institutions, respondedNames) {
  const responded = institutions.filter(({ name }) => respondedNames.has(normalized(name))).length;
  const total = institutions.length;
  const goalCount = Math.ceil(total * COVERAGE_GOAL);
  return {
    total,
    responded,
    missing: total - responded,
    percentage: total ? Number(((responded / total) * 100).toFixed(1)) : 0,
    goalPercentage: COVERAGE_GOAL * 100,
    goalCount,
    remainingToGoal: Math.max(0, goalCount - responded)
  };
}

function dashboardAnalytics(rows) {
  const productKeys = Object.entries(questionLabels)
    .filter(([key, label]) => {
      const normalizedLabel = label.toLocaleLowerCase('es');
      return key.startsWith('bank.product.') &&
        !key.startsWith('bank.product.scintra.') &&
        !key.startsWith('bank.product.soporte.') && (
        normalizedLabel.endsWith('— satisfacción general') ||
        normalizedLabel.includes('en general, estamos satisfechos')
      );
    })
    .map(([key, label]) => ({
      key,
      product: label.split(' — ')[0]
    }));
  const productMap = new Map();
  const commercialKeys = Object.entries(questionLabels)
    .filter(([key, label]) => key.startsWith('bank.commercial.m2-') && label.includes('equipo comercial'))
    .map(([key, label]) => ({ key, label: label.split(' — ').at(-1) }));
  const commercialMap = new Map(commercialKeys.map(({ label }) => [label, []]));
  const interestCounts = new Map();

  rows.forEach(({ answers: rawAnswers = {}, country }) => {
    const answers = sanitizedStoredAnswers(rawAnswers, country);
    productKeys.forEach(({ key, product }) => {
      const numeric = Number(getNested(answers, key));
      if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) return;
      if (!productMap.has(product)) productMap.set(product, { product, satisfaction: [] });
      productMap.get(product).satisfaction.push(numeric);
    });
    commercialKeys.forEach(({ key, label }) => {
      const numeric = Number(getNested(answers, key));
      if (Number.isFinite(numeric)) commercialMap.get(label).push(numeric);
    });
    const responseInterests = new Set();
    ['bank.commercial.o3', 'bank.commercial.o4'].forEach((key) => {
      const interests = getNested(answers, key);
      (Array.isArray(interests) ? interests : interests ? [interests] : []).forEach((value) => {
        const product = canonicalProductInterest(value);
        if (product) responseInterests.add(product);
      });
    });
    responseInterests.forEach((product) => interestCounts.set(product, (interestCounts.get(product) || 0) + 1));
  });

  const average = (values) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
  return {
    products: [...productMap.values()].map(({ product, satisfaction }) => ({
      product,
      satisfactionAverage: average(satisfaction),
      responses: satisfaction.length
    })).sort((a, b) => b.responses - a.responses || a.product.localeCompare(b.product, 'es')),
    commercial: [...commercialMap].map(([aspect, values]) => ({ aspect, average: average(values), responses: values.length })),
    interests: [...interestCounts].map(([name, total]) => ({
      name,
      total,
      percentage: rows.length ? Number(((total / rows.length) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
  };
}

app.get('/api/export.xlsx', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL no está configurado.' });
  try {
    const result = await pool.query('SELECT * FROM survey_responses ORDER BY submitted_at DESC');
    const rows = rowsForAdminScope(result.rows, req.adminScope);
    const flattened = rows.map((row) => {
      const answers = sanitizedStoredAnswers(row.answers, row.country);
      const communitySize = answers.identity?.community_size || '';
      const institutionType = answers.identity?.institution_type || '';
      delete answers.identity;
      delete answers.startedAt;
      return {
        ID: row.id,
        'Hora de inicio': row.started_at,
        'Hora de finalización': row.submitted_at,
        'Hora de la última modificación': row.updated_at,
        'Nombre completo': row.full_name,
        Correo: row.email,
        'Nombre de la institución': row.institution_name,
        País: row.country,
        Cargo: row.role,
        'Número de WhatsApp': row.contact_phone || '',
        'Tamaño aproximado de la comunidad': communitySize,
        'Tipo de institución': institutionType,
        ...labeledAnswers(answers)
      };
    });
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
    const exportPrefix = req.adminScope === '4prot-cloudlabs' ? 'respuestas-4prot-cloudlabs' : 'respuestas-ignite';
    res.setHeader('Content-Disposition', `attachment; filename="${exportPrefix}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('export_error', error);
    res.status(500).json({ error: 'No fue posible generar el Excel.' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL no está configurado.' });
  try {
    const result = await pool.query('SELECT institution_name, country, answers, submitted_at FROM survey_responses ORDER BY submitted_at DESC');
    const rows = rowsForAdminScope(result.rows, req.adminScope);
    const responseCounts = new Map();
    rows.forEach(({ institution_name: name }) => responseCounts.set(normalized(name), (responseCounts.get(normalized(name)) || 0) + 1));
    const respondedNames = new Set(responseCounts.keys());
    const limitedScope = req.adminScope === '4prot-cloudlabs';
    const targetByName = new Map(targetInstitutions.map((institution) => [normalized(institution.name), institution]));
    const institutions = limitedScope
      ? [...responseCounts].map(([normalizedName, responses]) => {
          const response = rows.find(({ institution_name: name }) => normalized(name) === normalizedName);
          const target = targetByName.get(normalizedName);
          const country = target?.country || response?.country || '';
          return {
            name: target?.name || response?.institution_name || normalizedName,
            country,
            territory: target?.territory || (normalized(country) === 'mexico' ? 'México' : 'Centro y Sudamérica'),
            responded: true,
            responses
          };
        })
      : targetInstitutions.map((institution) => ({
          ...institution,
          responded: respondedNames.has(normalized(institution.name)),
          responses: responseCounts.get(normalized(institution.name)) || 0
        }));
    const territories = ['México', 'Centro y Sudamérica'].map((territory) => ({
      territory,
      ...coverageSummary(institutions.filter((institution) => institution.territory === territory), respondedNames)
    }));
    const targetNameSet = new Set(targetInstitutions.map(({ name }) => normalized(name)));
    const otherRespondents = limitedScope ? [] : rows
      .filter(({ institution_name: name }) => !targetNameSet.has(normalized(name)))
      .map(({ institution_name: name, country }) => ({ name, country }));
    res.json({
      scope: req.adminScope,
      scopeLabel: limitedScope ? 'Clientes con 4PROT o CloudLabs' : 'Acceso administrativo completo',
      totalResponses: rows.length,
      coverage: { overall: coverageSummary(institutions, respondedNames), territories },
      institutions,
      otherRespondents,
      analytics: dashboardAnalytics(rows),
      updatedAt: new Date().toISOString()
    });
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
