const PRODUCTS = [
  '4PROT', 'CloudLabs', 'Digitalia', 'DSpace', 'EBSCO', 'EDS (EBSCO Discovery Service)',
  'IG Publishing', 'Koha', 'LEMB', 'MyLOFT', 'Odilo', 'OJS', 'Página web', 'Sage',
  'Scintra', 'Servidores', 'Smith Marketing', 'Soporte', 'Taylor & Francis', 'Winkel'
];

const PRODUCT_DETAIL_STEPS = {
  Koha:'koha', LEMB:'lemb', DSpace:'dspace', OJS:'ojs', MyLOFT:'myloft', Winkel:'winkel',
  'Página web':'web', Servidores:'servidores', '4PROT':'4prot', CloudLabs:'cloudlabs',
  'Taylor & Francis':'tf', EBSCO:'ebsco', 'EDS (EBSCO Discovery Service)':'eds',
  Digitalia:'digitalia', Sage:'sage', Odilo:'odilo', 'IG Publishing':'ig', 'Smith Marketing':'marketing',
  Scintra:'scintra', Soporte:'soporte'
};
const DATABASE_PRODUCTS = ['Taylor & Francis','EBSCO','EDS (EBSCO Discovery Service)','Digitalia','Sage','Odilo'];
const MEXICO_HIDDEN_PRODUCTS = new Set(['Digitalia','EBSCO','EDS (EBSCO Discovery Service)','CloudLabs','Sage']);
const INSTITUTIONS = window.IGNITE_INSTITUTIONS || [];
const PRODUCT_BLOCK_ORDER = ['koha','lemb','dspace','ojs','myloft','winkel','web','servidores','4prot','cloudlabs','tf','ebsco','eds','digitalia','sage','odilo','bd','ig','marketing','scintra','soporte'];
const PRODUCT_BY_BLOCK = Object.fromEntries(Object.entries(PRODUCT_DETAIL_STEPS).map(([product, block]) => [block, product]));
const BANK_RERENDER_KEYS = new Set([
  'bank.product.koha.m8-2', 'bank.product.koha.o10', 'bank.product.dspace.o29',
  'bank.product.winkel.o56', 'bank.product.ig.o135', 'bank.product.marketing.o145'
]);

const COUNTRIES = ['Argentina','Bolivia','Brasil','Chile','Colombia','Costa Rica','Ecuador','El Salvador','España','Guatemala','Honduras','México','Nicaragua','Panamá','Paraguay','Perú','Puerto Rico','República Dominicana','Uruguay','Venezuela','Otro'];
const DRAFT_KEY = 'ignite-survey-2026-draft-v6';
const NONE = 'Ninguno de los anteriores';
const DEMO_MODE = false;

const emptyState = () => ({
  startedAt: new Date().toISOString(),
  identity: {}, products: [], satisfaction: {}, innovation: {}, product_details: {},
  other_solution: {}, priorities: [], priority_results: {}, support: {}, reports: {},
  communication: {}, renewal: {}, sales: {}, future: {}, consent: {}, bank: {}
});

let state = loadDraft();
let currentIndex = 0;
let isSubmitted = false;
let saveTimer;

const stage = document.getElementById('step-stage');
const backButton = document.getElementById('back-button');
const nextButton = document.getElementById('next-button');
const actions = document.getElementById('form-actions');
const errorBox = document.getElementById('form-error');
const saveState = document.getElementById('save-state');

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return saved && saved.answers ? { ...emptyState(), ...saved.answers, startedAt: saved.startedAt || saved.answers.startedAt } : emptyState();
  } catch { return emptyState(); }
}

function saveDraft() {
  if (isSubmitted) return;
  saveState.classList.add('saving');
  saveState.querySelector('span:last-child').textContent = 'Guardando…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ startedAt: state.startedAt, answers: state }));
    saveState.classList.remove('saving');
    saveState.querySelector('span:last-child').textContent = 'Borrador guardado';
  }, 240);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

function getPath(path) {
  return path.split('.').reduce((value, key) => value?.[key], state);
}

function setPath(path, value) {
  const keys = path.split('.');
  let target = state;
  keys.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  });
  target[keys.at(-1)] = value;
}

function slug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function optionCards(path, options, { type = 'radio', compact = false, required = true, rerender = false } = {}) {
  const current = getPath(path);
  return `<div class="choice-grid${compact ? ' compact' : ''}" data-required-group="${required ? escapeHtml(path) : ''}">
    ${options.map((option) => {
      const item = typeof option === 'string' ? { value: option, label: option } : option;
      const checked = type === 'checkbox' ? (current || []).includes(item.value) : current === item.value;
      return `<label class="choice">
        <input type="${type}" name="${escapeHtml(path)}" value="${escapeHtml(item.value)}" data-key="${escapeHtml(path)}" ${checked ? 'checked' : ''} ${rerender ? 'data-rerender="true"' : ''}>
        <span class="choice-control"></span>
        <span class="choice-copy">${escapeHtml(item.label)}${item.help ? `<small>${escapeHtml(item.help)}</small>` : ''}</span>
      </label>`;
    }).join('')}
  </div>`;
}

function question(title, content, hint = '') {
  return `<div class="question"><h3 class="question-title">${title}</h3>${hint ? `<p class="question-hint">${hint}</p>` : ''}${content}</div>`;
}

function textField(path, label, { type = 'text', placeholder = '', required = false, full = false, textarea = false, autocomplete = '' } = {}) {
  const value = getPath(path) || '';
  const element = textarea
    ? `<textarea data-key="${path}" ${required ? 'required' : ''} placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`
    : `<input type="${type}" data-key="${path}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${autocomplete ? `autocomplete="${autocomplete}"` : ''} placeholder="${escapeHtml(placeholder)}">`;
  return `<label class="field${full ? ' full' : ''}"><span>${label}${required ? ' *' : ''}</span>${element}</label>`;
}

function selectField(path, label, options, { required = false, full = false, placeholder = 'Seleccione una opción' } = {}) {
  const current = getPath(path) || '';
  return `<label class="field${full ? ' full' : ''}"><span>${label}${required ? ' *' : ''}</span><select data-key="${path}" ${required ? 'required' : ''}>
    <option value="">${escapeHtml(placeholder)}</option>
    ${options.map((option) => `<option value="${escapeHtml(option)}" ${current === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
  </select></label>`;
}

function matrixTable(path, rows, { values = ['1','2','3','4','5'], labels = values, na = true, required = true, firstColumn = 'Aspecto' } = {}) {
  const options = [...values, ...(na ? ['No aplica o no lo sé'] : [])];
  const headings = [...labels, ...(na ? ['No aplica o no lo sé'] : [])];
  return `<div class="matrix-wrap" role="region" aria-label="Tabla de valoración" tabindex="0"><table class="matrix-table">
    <thead><tr><th scope="col">${firstColumn}</th>${headings.map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => {
      const label = typeof row === 'string' ? row : row.label;
      const key = `${path}.${slug(typeof row === 'string' ? row : row.key || row.label)}`;
      const current = getPath(key);
      return `<tr data-required-group="${required ? key : ''}"><th scope="row">${escapeHtml(label)}</th>${options.map((value) => `<td><label class="matrix-option"><input type="radio" name="${key}" value="${escapeHtml(value)}" data-key="${key}" ${current === value ? 'checked' : ''}><span aria-hidden="true"></span><span class="sr-only">${escapeHtml(label)}: ${escapeHtml(value)}</span></label></td>`).join('')}</tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function ratingRows(path, rows, { na = true, required = true, left = 'Muy bajo', right = 'Excelente', values = ['1','2','3','4','5'], labels } = {}) {
  const columnLabels = labels || values.map((value, index) => index === 0 ? `${value} · ${left}` : index === values.length - 1 ? `${value} · ${right}` : value);
  return matrixTable(path, rows, { values, labels: columnLabels, na, required });
}

function groupedMatrixTable(path, groups) {
  const values = ['1','2','3','4','5','No aplica o no lo sé'];
  return `<div class="matrix-wrap report-matrix-wrap" role="region" aria-label="Indicadores para informes" tabindex="0"><table class="matrix-table grouped-matrix">
    <thead><tr><th scope="col">Grupo</th><th scope="col">Dato que podría incluir el informe</th><th scope="col">1</th><th scope="col">2</th><th scope="col">3</th><th scope="col">4</th><th scope="col">5</th><th scope="col">No aplica o no lo sé</th></tr></thead>
    <tbody>${groups.map((group) => group.rows.map((row, index) => {
      const key = `${path}.${slug(row)}`;
      const current = getPath(key);
      return `<tr data-required-group="${key}">${index === 0 ? `<th class="group-cell" scope="rowgroup" rowspan="${group.rows.length}">${escapeHtml(group.group)}</th>` : ''}<th scope="row">${escapeHtml(row)}</th>${values.map((value) => `<td><label class="matrix-option"><input type="radio" name="${key}" value="${escapeHtml(value)}" data-key="${key}" ${current === value ? 'checked' : ''}><span aria-hidden="true"></span><span class="sr-only">${escapeHtml(row)}: ${escapeHtml(value)}</span></label></td>`).join('')}</tr>`;
    }).join('')).join('')}</tbody>
  </table></div>`;
}

function stepFrame(kicker, title, intro, body, heading = 'h2') {
  return `<article class="step"><span class="step-kicker">${kicker}</span><${heading}>${title}</${heading}>${intro ? `<p class="step-intro">${intro}</p>` : ''}${body}</article>`;
}

function transitionStep(number, title, description) {
  return `<article class="step stage-slide"><span class="stage-number">Etapa ${number} de 5</span><div class="stage-rule"></div><h2>${title}</h2><p>${description}</p><span class="stage-cue">A continuación <span aria-hidden="true">→</span></span></article>`;
}

function bankQuestionsHtml(questions, sectionNumber, startAt = 1) {
  return `<div class="bank-content">${questions.map((question, index) => {
    if (!sectionNumber) return question.html;
    const displayNumber = `${sectionNumber}.${startAt + index}`;
    return question.html.replace(/<span class="code">[^<]*<\/span>/, `<span class="code">${displayNumber}</span>`);
  }).join('')}</div>`;
}

function visibleProductQuestions(key) {
  const questions = window.QUESTION_BANK.products[key].questions;
  return questions.filter((question) => {
    if (key === 'koha' && question.code === 'K3') return ['1','2','3'].includes(getPath('bank.product.koha.m8-2'));
    if (key === 'koha' && question.code === 'K5') return Boolean(getPath('bank.product.koha.o10'));
    if (key === 'dspace' && question.code === 'D4') return Boolean(getPath('bank.product.dspace.o29'));
    if (key === 'winkel' && question.code === 'W5') return Boolean(getPath('bank.product.winkel.o56'));
    if (key === 'ig' && ['IG3','IG4'].includes(question.code)) return getPath('bank.product.ig.o135') === 'Sí';
    if (key === 'ig' && question.code === 'IG5') return Boolean(getPath('bank.product.ig.o135'));
    if (key === 'marketing' && question.code === 'MS4') return Boolean(getPath('bank.product.marketing.o145'));
    return true;
  });
}

function visiblePriorityQuestions() {
  const formationRoute = state.products.includes('4PROT') || state.products.includes('CloudLabs');
  const libraryRoute = !formationRoute || state.products.some((product) => ![NONE, '4PROT', 'CloudLabs'].includes(product));
  return window.QUESTION_BANK.priorities.filter((question) => {
    if (!libraryRoute && (question.code === '4A' || question.code === '5A')) return false;
    if (!formationRoute && question.code === '5A·F') return false;
    return true;
  });
}

function bankProductStep(key) {
  const product = window.QUESTION_BANK.products[key];
  const activeBlocks = PRODUCT_BLOCK_ORDER.filter((block) => block === 'bd'
    ? DATABASE_PRODUCTS.some((item) => state.products.includes(item))
    : state.products.includes(PRODUCT_BY_BLOCK[block]));
  const questionStart = 2 + activeBlocks.slice(0, activeBlocks.indexOf(key)).reduce((total, block) => total + visibleProductQuestions(block).length, 0);
  return stepFrame('Producto seleccionado', product.title, 'Responda las preguntas según la experiencia de su institución durante 2026.', bankQuestionsHtml(visibleProductQuestions(key), '2', questionStart));
}

function bankCommercialStep() {
  return stepFrame('Asesoría y acompañamiento comercial', 'Su experiencia con el equipo comercial', 'Comparta su experiencia con la propuesta y el acompañamiento de Ignite.', bankQuestionsHtml(window.QUESTION_BANK.commercial, '1'));
}

function bankSupportStep() {
  return stepFrame('Soporte, acompañamiento e informes', 'Su experiencia con Ignite durante 2026', 'Estas preguntas se muestran una sola vez, independientemente de la cantidad de productos seleccionados.', bankQuestionsHtml(window.QUESTION_BANK.support, '3'));
}

function bankCommunicationStep() {
  return stepFrame('Marketing y comunicaciones', 'Información y comunicación', 'Responda utilizando la experiencia real de su institución.', bankQuestionsHtml(window.QUESTION_BANK.communication, '4'));
}

function bankPrioritiesStep() {
  const questions = visiblePriorityQuestions();
  const libraryStart = questions.findIndex((question) => question.code === '5A');
  const body = questions.map((question, index) => {
    const intro = index === libraryStart ? `<aside class="study-intro"><p>Estudios y análisis internacionales sobre bibliotecas en Latinoamérica, Europa y Estados Unidos señalan cuatro grandes transformaciones: el apoyo a la investigación, la integración de la biblioteca a la formación académica, la inteligencia artificial, y la experiencia de los usuarios y el valor que aporta la biblioteca. Nos encantaría saber cuáles de estos servicios le interesaría impulsar en 2027.</p><small>Referencias: Tendencias de innovación en bibliotecas académicas en Latinoamérica y el Caribe (2024), REBIUN (2025), Digital Education Council (2026), Ithaka S+R (2026) y Clarivate (2025).</small></aside>` : '';
    const numbered = question.html.replace(/<span class="code">[^<]*<\/span>/, `<span class="code">5.${index + 1}</span>`);
    return `${intro}<div class="bank-content">${numbered}</div>`;
  }).join('');
  return stepFrame('Mirando al 2027', 'Prioridades para 2027', 'Seleccione la respuesta que mejor representa los planes de su institución.', body);
}

function welcomeStep() {
  return stepFrame('Encuesta de satisfacción 2026', 'Su experiencia nos ayuda a <span class="accent">mejorar.</span>',
    'Gracias por acompañar a Ignite durante 2026. Nos encantaría conocer cómo ha sido la experiencia con Ignite a lo largo del año y qué prioridades se perfilan para 2027. Las respuestas nos ayudarán a comprender mejor las necesidades de cada institución, mejorar nuestro servicio y ofrecer un acompañamiento que aporte valor.',
    `<div class="welcome-mark"></div><p class="consent-copy">La encuesta parte de la experiencia de cada institución: solo verá los bloques de los productos y servicios que utiliza. Cuando una pregunta no corresponda o falte información para responder, puede usar la opción prevista para esos casos. Las preguntas abiertas señaladas como opcionales son un espacio para ampliar las respuestas.</p><ul class="welcome-points"><li>10 minutos</li><li>Preguntas adaptadas a su institución</li></ul>`, 'h1');
}

function identityStep() {
  const institutionNames = INSTITUTIONS.map(({ name }) => name);
  const otherInstitution = state.identity.institution_name === 'Otra';
  return stepFrame('Sobre usted', 'Primero, conozcámonos', 'Complete la información que quiera compartir con nosotros.',
    `<div class="field-grid">
      ${textField('identity.full_name','Nombre completo',{required:true,autocomplete:'name'})}
      ${textField('identity.email','Correo electrónico',{type:'email',required:true,autocomplete:'email'})}
      ${selectField('identity.institution_name','Institución o empresa',[...institutionNames, 'Otra'],{required:true,placeholder:'Seleccione su institución'})}
      ${otherInstitution ? textField('identity.other_institution','Otra institución: especifique',{required:true}) : ''}
      ${textField('identity.community_size','Tamaño de la institución (si lo sabe)',{type:'number',placeholder:'Número aproximado de personas'})}
      <label class="field"><span>País *</span><input list="country-list" data-key="identity.country" value="${escapeHtml(state.identity.country || '')}" required autocomplete="country-name" placeholder="Seleccione o escriba"><datalist id="country-list">${COUNTRIES.map((country) => `<option value="${country}">`).join('')}</datalist></label>
      ${textField('identity.role','Cargo',{required:true,autocomplete:'organization-title'})}
      ${textField('identity.contact_phone','Número de contacto',{type:'tel',autocomplete:'tel',placeholder:'Opcional'})}
      <div class="field full institution-type"><span>Tipo de institución *</span>${optionCards('identity.institution_type', ['Pública','Privada'], { compact:true, required:true })}</div>
    </div>`);
}

function productsStep() {
  const isMexico = slug(state.identity.country || '') === 'mexico';
  const products = PRODUCTS.filter((product) => !isMexico || !MEXICO_HIDDEN_PRODUCTS.has(product));
  return stepFrame('Productos y servicios', '<span class="title-code">2.1</span> Durante 2026, ¿qué productos o servicios contrató su institución con Ignite?', 'Seleccione todos los que correspondan. La encuesta mostrará únicamente las preguntas relevantes.',
    optionCards('products', [...products, NONE], { type:'checkbox', required:true, rerender:true }));
}

function satisfactionStep() {
  const products = state.products.filter((product) => product !== NONE);
  return stepFrame('Evaluación general', 'Tu valoración de los productos utilizados', 'Selecciona una opción por fila para cada producto o servicio.',
    question('¿Cuál fue tu nivel de satisfacción durante 2026?', ratingRows('satisfaction', products, { left:'Muy insatisfecho', right:'Muy satisfecho' }), '1 · Muy insatisfecho / 5 · Muy satisfecho / No aplica o no lo sé.') +
    question('¿Cómo calificarías el nivel de innovación de cada producto o servicio durante 2026?', ratingRows('innovation', products, { left:'Muy bajo', right:'Muy alto' }), 'Valoración independiente por producto. 1 · Muy bajo / 5 · Muy alto / No aplica o no lo sé.'));
}

function marketingStep() {
  const base = 'product_details.marketing';
  return stepFrame('Producto seleccionado', 'Marketing Smith', 'La difusión también es parte de la experiencia. Cuéntanos cómo fue el proceso y qué resultados produjo.',
    question('Califica el proceso de preparación del material', ratingRows(`${base}.process`, [
      'Entendimos las necesidades de tu institución', 'La estrategia fue adecuada para tu público', 'Cumplimos los tiempos acordados', 'La comunicación fue ágil'
    ], { na:false })) +
    question('¿El plan de difusión ayudó a alcanzar sus objetivos?', optionCards(`${base}.result`, ['Superó lo esperado','Cumplió lo esperado','Parcialmente','No'], { rerender:true })) +
    (getPath(`${base}.result`) ? `<div class="field-grid">${textField(`${base}.improvements`,'¿Qué cambiarías o agregarías para la próxima difusión?',{textarea:true,full:true})}</div>` : ''));
}

function kohaStep() {
  const base = 'product_details.koha';
  const wants = getPath(`${base}.features_interest`);
  return stepFrame('Producto seleccionado', 'Koha', 'Queremos entender qué funciona bien y dónde podemos ayudarte a obtener más valor.',
    question('Califica estos aspectos', ratingRows(`${base}.experience`, ['Estabilidad de la plataforma','Velocidad de la plataforma','Facilidad de uso de los módulos','Facilidad de uso del OPAC','Utilidad de las actualizaciones','Comunicación sobre actualizaciones','Utilidad de los reportes','Utilidad de las capacitaciones'])) +
    question('¿En qué medida Koha ayudó a cumplir los objetivos de 2026?', optionCards(`${base}.outcome`, ['Superó lo esperado','Cumplió lo esperado','Cumplió parcialmente','No ayudó','No lo sé'])) +
    `<div class="field-grid">${textField(`${base}.outcome_reason`,'Motivo principal de tu respuesta',{textarea:true,required:true,full:true})}</div>` +
    question('¿Hay alguna función que quisieran aprovechar mejor en 2027?', optionCards(`${base}.features_interest`, ['Sí','No','No lo sé'], { compact:true, rerender:true })) +
    (wants === 'Sí' ? `<div class="conditional-panel">${question('¿Cuáles?', optionCards(`${base}.features`, ['Catalogación','Circulación','Adquisiciones','Publicaciones seriadas','OPAC','Reportes','Usuarios','Otra'], { type:'checkbox', required:true }))}</div>` : '') +
    question('Prioridades de mejora para 2027', optionCards(`${base}.priorities`, ['Rendimiento y estabilidad','Experiencia de usuario','Reportes y analítica','Integraciones','Capacitación','Acompañamiento'], { type:'checkbox', required:true }), 'Elige las que sean más importantes para tu institución.') +
    question('¿Te interesaría conocer funciones de inteligencia artificial para Koha?', optionCards(`${base}.ai_interest`, ['Sí','No','Tal vez'], { compact:true })));
}

function dspaceStep() {
  const base = 'product_details.dspace';
  return stepFrame('Producto seleccionado', 'DSpace', 'Pensando en tu experiencia durante 2026, valora el repositorio y el acompañamiento de Ignite.',
    question('Gestión y servicios del repositorio DSpace', ratingRows(`${base}.experience`, [
      'Disponibilidad del repositorio cuando la comunidad necesita utilizarlo',
      'Velocidad al buscar, abrir o descargar documentos',
      'Facilidad para depositar documentos y gestionar su revisión y publicación',
      'Facilidad para administrar comunidades, colecciones y permisos',
      'Facilidad para encontrar documentos mediante búsqueda y filtros',
      'Facilidad para revisar, corregir y normalizar metadatos',
      'Adecuación de los campos de metadatos a los requisitos institucionales',
      'Cosecha de metadatos por redes o agregadores (OAI-PMH)',
      'Intercambio de datos con otros sistemas institucionales (CRIS)',
      'Visibilidad de publicaciones en buscadores o portales externos',
      'Utilidad de las estadísticas para informar consultas y descargas',
      'Orientación para configurar formularios, flujos de depósito o permisos',
      'Acompañamiento en metadatos, cosecha o integración',
      'Claridad sobre cambios antes de una actualización o migración',
      'Utilidad de la capacitación o documentación para administrar el repositorio'
    ], { left:'Muy insatisfecho', right:'Muy satisfecho' }), 'Selecciona una opción por fila.') +
    question('¿En qué medida DSpace ayudó a cumplir sus objetivos?', optionCards(`${base}.outcome`, ['Superó lo esperado','Cumplió lo esperado','Cumplió parcialmente','No ayudó','No lo sé'])) +
    `<div class="field-grid">${textField(`${base}.outcome_reason`,'Cuéntanos el motivo',{textarea:true,full:true})}</div>` +
    question('¿Te interesaría conocer aplicaciones de inteligencia artificial para DSpace?', optionCards(`${base}.ai_interest`, ['Sí','No','Tal vez'], { compact:true })));
}

function winkelStep() {
  const base = 'product_details.winkel';
  return stepFrame('Producto seleccionado', 'Winkel', 'Queremos saber qué buscaban lograr y qué impacto observaron.',
    question('¿Cuáles fueron sus principales objetivos?', optionCards(`${base}.objectives`, ['Mejorar la experiencia de usuarios','Aumentar el uso de recursos','Fortalecer servicios digitales','Optimizar procesos','Obtener mejores datos','Otro'], { type:'checkbox' })) +
    question('¿Cómo calificas tu experiencia con Winkel en 2026?', ratingRows(`${base}.experience`, ['Facilidad para cargar y organizar libros','Experiencia de lectura en computador','Experiencia de lectura en celular','Control del acceso y los derechos de uso','Utilidad de los reportes de lectura','Iniciativa del equipo técnico para proponer mejoras'], { left:'Muy mala', right:'Muy buena' })) +
    question('¿En qué medida los resultados cumplieron lo esperado?', optionCards(`${base}.outcome`, ['Superaron lo esperado','Cumplieron lo esperado','Cumplieron parcialmente','No cumplieron','No lo sé'])) +
    question('¿Qué impacto tendría cada mejora en el uso de Winkel?', matrixTable(`${base}.improvement_impact`, ['Más contenidos disponibles','Lectura sin conexión','Mejor experiencia en celular','Integración con el catálogo o plataforma educativa','Campañas de difusión para usuarios'], { values:['Alto','Medio','Bajo'], labels:['Alto','Medio','Bajo'], na:false, required:false, firstColumn:'Propuesta' })) +
    question('¿Qué impacto tendría cada función de inteligencia artificial?', matrixTable(`${base}.ai_impact`, ['Recomendaciones personalizadas de lectura','Búsqueda inteligente dentro de los libros','Asistente para preguntas durante la lectura','Resúmenes automáticos de libros y capítulos','Generación de descripciones y metadatos','Lectura en voz alta y accesibilidad','Análisis de uso para tomar decisiones'], { values:['Alto','Medio','Bajo'], labels:['Alto','Medio','Bajo'], na:false, required:false, firstColumn:'Propuesta' })) +
    `<div class="field-grid">${textField(`${base}.improvements`,'¿Hay algún cambio o mejora que quisieras proponer?',{textarea:true,full:true})}</div>`);
}

function lembStep() {
  const base = 'product_details.lemb';
  return stepFrame('Producto seleccionado', 'LEMB', 'Cuéntanos cómo utilizas sus funciones y dónde debería crecer el vocabulario.',
    question('Califica tu experiencia con LEMB', ratingRows(`${base}.experience`, ['Encuentro con facilidad el encabezamiento que necesito','El vocabulario está actualizado y responde a los temas que catalogamos','La plataforma ayuda a catalogar con mayor rapidez y precisión','Nos informan con claridad sobre mejoras y novedades'], { na:false, left:'Muy mala', right:'Muy buena' })) +
    question('¿Cuáles funcionalidades utilizaste este año?', matrixTable(`${base}.feature_usage`, ['Identificación visual de encabezamientos autorizados','Búsqueda avanzada por campos MARC (150, 450, 550, 750)','Búsqueda con varias palabras sin operadores booleanos','Términos en inglés con equivalencia en español','Estructura MARC y notas de uso','Tablas de subdivisiones'], { values:['La uso','La conozco pero no la uso','No la conocía'], labels:['La uso','La conozco, no la uso','No la conocía'], na:false, firstColumn:'Funcionalidad' })) +
    question('¿En qué áreas debería fortalecerse en 2027?', optionCards(`${base}.areas`, ['Ciencias sociales','Salud','Tecnología','Artes y humanidades','Educación','Derecho','Otra'], { type:'checkbox' })) +
    `<div class="field-grid">${textField(`${base}.support_needed`,'¿Qué te ayudaría a aprovechar mejor LEMB?',{textarea:true,full:true})}${textField(`${base}.unresolved_cases`,'Términos o casos que no hayas podido resolver',{textarea:true,full:true})}</div>`);
}

function myloftStep() {
  const base = 'product_details.myloft';
  return stepFrame('Producto seleccionado', 'MyLOFT', 'Indica tu grado de acuerdo con cada afirmación sobre la experiencia durante 2026.',
    question('Experiencia con MyLOFT', ratingRows(`${base}.experience`, ['Los usuarios acceden fácilmente a los recursos fuera del campus','El inicio de sesión funciona correctamente','Los recursos habilitados están disponibles en la plataforma','Al abrir un recurso, los usuarios pueden consultarlo correctamente','La implementación o migración se realizó de forma ordenada','La implementación o migración se completó en los plazos acordados'], { left:'Totalmente en desacuerdo', right:'Totalmente de acuerdo' })));
}

function serversStep() {
  const base = 'product_details.servers';
  const hadFailure = getPath(`${base}.failures`);
  return stepFrame('Producto seleccionado', 'Servidores', 'Cuéntanos cómo funcionó el alojamiento de tus plataformas.',
    question('Califica el servicio de alojamiento', ratingRows(`${base}.experience`, ['Disponibilidad de las plataformas','Velocidad y rendimiento','Seguridad y confianza','Comunicación sobre mantenimientos','Acompañamiento técnico'])) +
    question('¿Se presentó alguna caída o falla este año?', optionCards(`${base}.failures`, ['Sí','No','No lo sé'], { compact:true, rerender:true })) +
    (hadFailure === 'Sí' ? `<div class="conditional-panel">${question('¿Cómo fue la respuesta ante la falla?', ratingRows(`${base}.failure_response`, ['Rapidez de respuesta','Claridad de la comunicación','Tiempo de solución','Seguimiento posterior'], { na:false }))}</div>` : '') +
    question('Servicios que interesaría evaluar para 2027', optionCards(`${base}.priorities`, ['Más capacidad de almacenamiento','Mejoras de rendimiento','Copias de seguridad adicionales','Monitoreo avanzado','Alta disponibilidad','Otra ampliación','Ninguna por ahora'], { type:'checkbox' })));
}

function igStep() {
  const base = 'product_details.ig';
  return stepFrame('Producto seleccionado', 'IG Publishing', 'Queremos conocer la experiencia de acceso, uso y pertinencia.',
    question('Califica tu experiencia', ratingRows(`${base}.experience`, ['Pertinencia de los contenidos','Calidad editorial','Facilidad de acceso','Experiencia de lectura','Acompañamiento de Ignite'])) +
    question('¿Qué tan utilizados son los libros?', optionCards(`${base}.usage`, ['Muy utilizados','Bastante utilizados','Poco utilizados','No se utilizan','No lo sé'])) +
    question('¿Interesaría una colección para desarrollar habilidades de IA desde cero?', optionCards(`${base}.ai_collection`, ['Sí','No','Tal vez'], { compact:true })));
}

function fourprotStep() {
  const base = 'product_details.fourprot';
  return stepFrame('Producto seleccionado', '4PROT', 'Queremos saber cómo ha sido tu experiencia prototipando con 4PROT.',
    `<p class="inline-note">Tu satisfacción general con 4PROT ya quedó registrada en la evaluación anterior.</p>` +
    question('Califica cada aspecto de 4PROT', ratingRows(`${base}.aspects`, ['Facilidad de uso para docentes y estudiantes','Estabilidad de la plataforma','Impacto en el aprendizaje de los estudiantes','Soporte y acompañamiento de Ignite'], { na:false, left:'Muy malo', right:'Excelente' }), 'Selecciona una opción por fila. 1 · Muy malo / 5 · Excelente.') +
    question('¿Qué ha logrado 4PROT en tus cursos?', optionCards(`${base}.achievements`, ['Mayor participación de los estudiantes','Mejor trabajo en equipo y colaboración','Los estudiantes prototipan sus ideas antes de llevarlas a la práctica','Aplicar Design Thinking en clase','Aún es pronto para saberlo'], { type:'checkbox', required:true })) +
    question('De 0 a 10, ¿qué tan probable es que recomiendes 4PROT a otra institución?', matrixTable(`${base}.recommendation`, [{ key:'score', label:'Probabilidad de recomendación' }], { values:['0','1','2','3','4','5','6','7','8','9','10'], labels:['0 · Nada probable','1','2','3','4','5','6','7','8','9','10 · Totalmente probable'], na:false })) +
    question('¿Cuál es el plan de tu institución con 4PROT para el próximo periodo?', optionCards(`${base}.next_plan`, ['Continuar igual','Continuar y ampliar a otros programas o sedes','Aún no está definido','No continuar'])) +
    `<div class="field-grid">${textField(`${base}.one_improvement`,'Si pudieras mejorar una sola cosa, ¿cuál sería?',{full:true})}</div>` +
    question('¿Te gustaría compartir tu experiencia como caso de uso?', optionCards(`${base}.case_study`, ['Sí, contáctenme usando el correo registrado','No por ahora'], { rerender:true })));
}

function cloudlabsStep() {
  const base = 'product_details.cloudlabs';
  const wantsContact = getPath(`${base}.case_study`) === 'Sí, contáctenme';
  if (wantsContact && !getPath(`${base}.contact_email`) && state.identity.email) setPath(`${base}.contact_email`, state.identity.email);
  return stepFrame('Producto seleccionado', 'CloudLabs', 'Queremos saber cómo ha sido tu experiencia con los laboratorios virtuales de CloudLabs.',
    `<p class="inline-note">Tu satisfacción general con CloudLabs ya quedó registrada en la evaluación anterior.</p>` +
    question('Califica cada aspecto de CloudLabs', ratingRows(`${base}.aspects`, ['Facilidad de uso para docentes y estudiantes','Estabilidad de la plataforma','Impacto en el aprendizaje de los estudiantes','Soporte y acompañamiento de Ignite'], { na:false, left:'Muy malo', right:'Excelente' }), 'Selecciona una opción por fila. 1 · Muy malo / 5 · Excelente.') +
    question('¿Qué ha logrado CloudLabs en tus cursos?', optionCards(`${base}.achievements`, ['Los estudiantes aprenden haciendo','Llegan mejor preparados a la práctica o a las evaluaciones','Más estudiantes acceden a experiencias prácticas','Practican sin límites de tiempo, insumos o riesgo','Aún es pronto para saberlo'], { type:'checkbox', required:true })) +
    question('De 0 a 10, ¿qué tan probable es que recomiendes CloudLabs a otra institución?', matrixTable(`${base}.recommendation`, [{ key:'score', label:'Probabilidad de recomendación' }], { values:['0','1','2','3','4','5','6','7','8','9','10'], labels:['0 · Nada probable','1','2','3','4','5','6','7','8','9','10 · Totalmente probable'], na:false })) +
    question('¿Cuál es el plan de tu institución con CloudLabs para el próximo periodo?', optionCards(`${base}.next_plan`, ['Continuar igual','Continuar y ampliar a otros programas o sedes','Aún no está definido','No continuar'])) +
    `<div class="field-grid">${textField(`${base}.one_improvement`,'Si pudieras mejorar una sola cosa, ¿cuál sería?',{full:true})}</div>` +
    question('¿Te gustaría compartir tu experiencia como caso de uso?', optionCards(`${base}.case_study`, ['Sí, contáctenme','No por ahora'], { rerender:true })) +
    (wantsContact ? `<div class="field-grid">${textField(`${base}.contact_email`,'Correo de contacto',{type:'email',required:true,full:true,autocomplete:'email'})}</div>` : ''));
}

function otherSolutionStep() {
  return stepFrame('Otras soluciones', 'Cuéntanos qué herramientas utilizaste', 'Aunque no hayas usado un producto de Ignite, tu perspectiva sigue siendo muy valiosa.',
    `<div class="field-grid">${textField('other_solution.name','Solución o herramienta utilizada',{required:true,full:true})}${textField('other_solution.value','¿Para qué la utilizaron y qué tan útil resultó?',{textarea:true,required:true,full:true})}</div>`);
}

const PRIORITY_AREAS = ['Acceso y contenidos digitales','Gestión bibliotecaria y catalogación','Repositorio y publicación científica','Plataformas para docencia y prototipado','Acompañamiento e infraestructura','Otro'];

function prioritiesStep() {
  const selected = state.priorities || [];
  return stepFrame('Resultados 2026', '¿Qué ámbitos fueron prioritarios para tu institución?', 'Selecciona los que correspondan. Después indícanos los resultados concretos observados.',
    question('Ámbitos prioritarios', optionCards('priorities', PRIORITY_AREAS, { type:'checkbox', required:true, rerender:true })) +
    selected.map((area) => `<div class="conditional-panel">${question(area, optionCards(`priority_results.${slug(area)}`, ['Mejoramos el acceso o disponibilidad','Aumentamos el uso o participación','Optimizamos procesos internos','Fortalecimos capacidades del equipo','Obtuvimos mejores datos para decidir','Aún no observamos resultados','Otro'], { type:'checkbox', required:true }))}</div>`).join(''));
}

function supportStep() {
  const selectedProducts = state.products.filter((product) => product !== NONE);
  const contexts = selectedProducts.length ? selectedProducts : ['Experiencia general con Ignite'];
  const statements = [
    'Recibimos una primera respuesta en un plazo adecuado',
    'Los casos se resolvieron en el plazo que nuestra institución necesitaba',
    'Recibimos información sobre el avance de los casos sin tener que pedirla',
    'Entendimos qué ocurrió y qué hizo Ignite para resolverlo',
    'El equipo entendió nuestra necesidad antes de proponer una solución',
    'El equipo nos atendió con cordialidad y respeto',
    'El equipo demostró el conocimiento técnico necesario',
    'La coordinación con el área de TI de nuestra institución fue efectiva',
    'Una vez resueltos, los problemas no volvieron a presentarse',
    'Nos resultó fácil reportar una incidencia',
    'El equipo tuvo en cuenta cómo la incidencia afectaba nuestro trabajo',
    'La solución nos permitió retomar el trabajo afectado',
    'En general, la experiencia con soporte fue satisfactoria'
  ];
  return stepFrame('Soporte', 'Cuando necesitaste ayuda, ¿cómo fue la experiencia?', 'Ayúdanos a mejorar y evalúa nuestro servicio al cliente en 2026.',
    `<p class="question-hint support-instruction">Selecciona una opción por fila para cada producto. Usa “No aplica o no lo sé” cuando una afirmación no corresponda.</p>` +
    contexts.map((product, index) => `<section class="support-product-block"><span class="product-sequence">Producto ${index + 1} de ${contexts.length}</span><h3>Soporte relacionado con ${escapeHtml(product)}</h3>${ratingRows(`support.by_product.${slug(product)}`, statements, { left:'Totalmente en desacuerdo', right:'Totalmente de acuerdo' })}</section>`).join(''));
}

function reportsStep() {
  const groups = [
    { group:'Uso', rows:['Uso y actividad. Búsquedas, consultas y descargas por recurso.','Contenidos más consultados. Títulos, revistas o colecciones con mayor uso.','Tendencias en el tiempo. Evolución mensual y comparación con el año anterior.','Acceso remoto y en campus. Desde dónde acceden los usuarios.'] },
    { group:'Usuarios', rows:['Adopción por áreas. Uso por facultad, programa o sede.','Perfil de usuarios. Uso por estudiantes, docentes e investigadores.','Usuarios activos y nuevos. Cuántas personas usan los recursos y cuántas se suman.'] },
    { group:'Valor e impacto', rows:['Costo por uso. Inversión en relación con el uso de cada recurso.','Efecto de formaciones y campañas. Cambios en el uso antes y después de cada acción.','Comparativos. Referencia anónima frente a instituciones similares.','Datos para acreditación. Indicadores para procesos de evaluación institucional.'] },
    { group:'Servicio', rows:['Incidencias y soporte. Casos reportados, tiempos de respuesta y estado.','Disponibilidad de las plataformas. Tiempo en línea e interrupciones del servicio.','Recomendaciones accionables. Sugerencias concretas a partir de los datos.'] }
  ];
  return stepFrame('Informes de las plataformas', '¿Qué datos te interesaría recibir en un informe de tus plataformas?', 'Califica la importancia de cada dato para tu institución. Selecciona una opción por fila.',
    groupedMatrixTable('reports.importance', groups) +
    `<p class="matrix-legend">1 · Nada importante / 2 · Poco importante / 3 · Moderadamente importante / 4 · Importante / 5 · Muy importante / No aplica o no lo sé.</p>`);
}

function communicationStep() {
  return stepFrame('Comunicación', 'Información útil, en el canal correcto', 'Ayúdanos a comunicarnos con mayor claridad y relevancia.',
    question('Claridad y utilidad de la información enviada por Ignite', ratingRows('communication.rating', ['Claridad de la información'], { na:false, left:'Nada clara', right:'Muy clara' })) +
    question('Canales preferidos', optionCards('communication.channels', ['Correo electrónico','WhatsApp','Reuniones virtuales','Webinars','Boletín','Portal o plataforma'], { type:'checkbox', required:true })) +
    question('¿Con qué atributos relacionas a Ignite?', optionCards('communication.brand', ['Innovación','Confianza','Cercanía','Experiencia','Agilidad','Acompañamiento'], { type:'checkbox', required:true }), 'Selecciona hasta tres.') +
    question('¿La comunicación corresponde con tu experiencia real?', optionCards('communication.matches', ['Sí, totalmente','En gran medida','Parcialmente','Poco','No'])) +
    `<div class="field-grid">${textField('communication.content','¿Qué contenidos te gustaría recibir en 2027?',{textarea:true,full:true})}</div>`);
}

function renewalStep() {
  return stepFrame('Contratación y renovación', 'Una propuesta fácil de entender', 'Piensa en la contratación o renovación más reciente con Ignite.',
    question('¿Qué tan claro fue lo que incluía su producto o servicio?', optionCards('renewal.clarity', ['Muy claro','Claro','Parcialmente claro','Poco claro','Nada claro','No participé'])) +
    `<div class="field-grid">${textField('renewal.improvements','¿Qué podríamos explicar mejor?',{textarea:true,full:true})}</div>`);
}

function salesStep() {
  const interests = state.sales.interests || [];
  return stepFrame('Asesoría y acompañamiento comercial', 'Tu experiencia con el equipo comercial', 'Queremos conocer qué hacemos bien y cómo acompañarte mejor después de la adquisición.',
    question('Pensando en tu experiencia con el equipo comercial de Ignite, ¿cómo calificas los siguientes aspectos?', ratingRows('sales.experience', ['Escucha activa','Comprensión de sus necesidades','Capacidad de respuesta oportuna','Confianza y cercanía','Facilidad de contacto','Claridad en la información brindada'], { values:['1','2','3','4','5','6','7'], labels:['1 · Muy deficiente','2','3','4','5','6','7 · Excelente'], na:false })) +
    question('¿Qué aspecto diferencia positivamente a Ignite frente a otras opciones del mercado?', optionCards('sales.differentiator', ['Acompañamiento cercano y personalizado','Respuesta rápida a solicitudes o problemas','Claridad y transparencia comercial','Calidad de las capacitaciones y el soporte','Soluciones tecnológicas innovadoras'])) +
    question('¿Te gustaría adquirir o recibir información sobre otro producto de Ignite?', optionCards('sales.interests', [
      'Repositorios institucionales y acceso a la producción académica — DSpace',
      'Gestión de bibliotecas, catálogos y préstamos — Koha',
      'Prototipado y creación de escenarios 3D para el aprendizaje — 4PROT',
      'Acceso a recursos digitales dentro y fuera del campus — MyLOFT',
      'Laboratorios virtuales y prácticas de simulación — CloudLabs',
      'Gestión editorial y publicación de revistas académicas — OJS',
      'Gestión y análisis de la producción científica — Scintra',
      'Préstamo y lectura de libros electrónicos — Winkel',
      'Catalogación temática en español — LEMB',
      'Colecciones de libros electrónicos — IG Publishing',
      'Acceso a publicaciones académicas — Taylor & Francis',
      'Otra necesidad',
      'Por ahora no requerimos información adicional'
    ], { type:'checkbox', required:true, rerender:true })) +
    (interests.includes('Otra necesidad') ? `<div class="field-grid">${textField('sales.other_need','Otra necesidad: ¿cuál?',{required:true,full:true})}</div>` : '') +
    `<div class="field-grid">${textField('sales.improvement','Desde tu experiencia, ¿qué podría hacer el equipo comercial para mejorar su servicio después de la adquisición?',{textarea:true,full:true})}${textField('sales.why_ignite','¿Por qué decidiste trabajar con Ignite en lugar de otra marca?',{textarea:true,full:true})}</div>`);
}

function futureStep() {
  return stepFrame('Mirando a 2027', '¿Dónde deberíamos poner la energía?', 'Tus prioridades nos ayudan a enfocar el acompañamiento del próximo año.',
    question('Temas prioritarios', optionCards('future.topics', ['Apoyo a la investigación','Aprendizaje y docencia','Inteligencia artificial','Experiencia de usuarios','Datos para la toma de decisiones','Visibilidad institucional','Optimización de procesos'], { type:'checkbox', required:true })) +
    question('Prioridad principal', optionCards('future.main_priority', ['Adoptar mejor las soluciones actuales','Capacitar al equipo','Medir resultados e impacto','Integrar herramientas y datos','Explorar nuevas soluciones','Fortalecer la estrategia institucional'])) +
    question('¿Qué tipo de acompañamiento sería más útil?', optionCards('future.support', ['Formación','Asesoría estratégica','Sesiones de seguimiento','Materiales y guías','Soporte técnico','Comunidad de usuarios'], { type:'checkbox', required:true, rerender:true })) +
    ((state.future.support || []).includes('Formación') ? `<div class="field-grid">${textField('future.training','¿Qué le gustaría aprender a tu equipo?',{textarea:true,full:true})}</div>` : '') +
    `<div class="field-grid">${textField('future.other','¿Hay otro servicio o iniciativa que te gustaría explorar con Ignite?',{textarea:true,full:true})}</div>`);
}

function reviewStep() {
  const items = [
    ['identity','Sus datos', state.identity.institution_name || 'Sin completar'],
    ['sales','Asesoría comercial', Object.keys(state.bank?.commercial || {}).length ? 'Respuestas registradas' : 'Sin completar'],
    ['products','Productos y servicios', state.products.join(', ') || 'Sin completar'],
    ['support','Soporte y acompañamiento', Object.keys(state.bank?.support || {}).length ? 'Respuestas registradas' : 'Sin completar'],
    ['communication','Información y comunicación', Object.keys(state.bank?.communication || {}).length ? 'Respuestas registradas' : 'Sin completar'],
    ['future','Mirando a 2027', Object.keys(state.bank?.priorities || {}).length ? 'Respuestas registradas' : 'Sin completar']
  ];
  return stepFrame('Antes de enviar', 'Revise sus respuestas', 'Puede volver a cualquier bloque antes de enviar. Al confirmar, guardaremos la respuesta de forma segura.',
    `<div class="review-celebration" aria-hidden="true"><span>★</span><strong>¡Llegaste al final!</strong></div><div class="review-list">${items.map(([id,label,value]) => `<div class="review-item"><div><span>${label}</span><strong>${escapeHtml(value)}</strong></div><button type="button" data-go-step="${id}">Editar</button></div>`).join('')}</div>
    ${question('¿Autoriza que Ignite utilice sus respuestas de manera anónima en un estudio del sector?', optionCards('consent.anonymous_study', ['Sí','No'], { compact:true, required:true }))}
    <p class="inline-note">Al enviar acepta que Ignite utilice esta información para mejorar sus productos, servicios y acompañamiento.</p>`);
}

const baseSteps = [
  { id:'welcome', label:'Bienvenida', render:welcomeStep },
  { id:'identity', label:'Identificación', render:identityStep },
  { id:'transition-sales', label:'Etapa 1 de 5', render:() => transitionStep(1, 'Asesoría y acompañamiento comercial', 'Queremos conocer su experiencia con la propuesta y el acompañamiento comercial.') },
  { id:'sales', label:'Asesoría comercial', render:bankCommercialStep },
  { id:'transition-products', label:'Etapa 2 de 5', render:() => transitionStep(2, 'Sus productos y servicios de Ignite', 'Evaluaremos únicamente los productos y servicios contratados por su institución.') },
  { id:'products', label:'Productos y servicios', render:productsStep },
  ...PRODUCT_BLOCK_ORDER.map((key) => key === 'bd'
    ? { id:'product-bd', label:'Uso de bases de datos', when:() => DATABASE_PRODUCTS.some((product) => state.products.includes(product)), render:() => bankProductStep('bd') }
    : { id:`product-${key}`, label:PRODUCT_BY_BLOCK[key], when:() => state.products.includes(PRODUCT_BY_BLOCK[key]), render:() => bankProductStep(key) }),
  { id:'transition-support', label:'Etapa 3 de 5', render:() => transitionStep(3, 'Su experiencia con soporte', 'Evaluaremos el soporte, el acompañamiento y la información recibida.') },
  { id:'support', label:'Soporte y acompañamiento', render:bankSupportStep },
  { id:'transition-communication', label:'Etapa 4 de 5', render:() => transitionStep(4, 'Marketing y comunicaciones', 'Revisaremos la claridad, los canales, los contenidos y la difusión.') },
  { id:'communication', label:'Marketing y comunicaciones', render:bankCommunicationStep },
  { id:'transition-future', label:'Etapa 5 de 5', render:() => transitionStep(5, 'Mirando al 2027', 'Cerraremos con sus necesidades y prioridades para el próximo año.') },
  { id:'future', label:'Prioridades 2027', render:bankPrioritiesStep },
  { id:'review', label:'Revisión', render:reviewStep }
];

function visibleSteps() { return baseSteps.filter((step) => !step.when || step.when()); }

function syncInputs() {
  const inputs = [...stage.querySelectorAll('[data-key]')];
  const checkboxKeys = [...new Set(inputs.filter((input) => input.type === 'checkbox').map((input) => input.dataset.key))];
  checkboxKeys.forEach((key) => setPath(key, inputs.filter((input) => input.dataset.key === key && input.checked).map((input) => input.value)));
  inputs.filter((input) => input.type !== 'checkbox').forEach((input) => {
    if (input.type === 'radio') {
      if (input.checked) setPath(input.dataset.key, input.value);
    } else setPath(input.dataset.key, input.value);
  });
}

function hydrateInputs() {
  stage.querySelectorAll('[data-key]').forEach((input) => {
    const current = getPath(input.dataset.key);
    if (input.type === 'checkbox') input.checked = Array.isArray(current) && current.includes(input.value);
    else if (input.type === 'radio') input.checked = current === input.value;
    else if (current !== undefined && current !== null) input.value = current;
  });
}

function refreshBankUi() {
  stage.querySelectorAll('[data-group]').forEach((group) => {
    const choices = [...group.querySelectorAll('input[type="checkbox"]')];
    const exclusive = choices.find((input) => input.hasAttribute('data-exclusive') && input.checked);
    if (exclusive) choices.forEach((input) => { if (input !== exclusive) input.checked = false; });
    const max = Number(group.dataset.max || 0);
    const selected = choices.filter((input) => input.checked && !input.hasAttribute('data-exclusive')).length;
    if (max) choices.forEach((input) => { if (!input.hasAttribute('data-exclusive')) input.disabled = !input.checked && selected >= max; });
    const otherIds = new Set(choices.filter((input) => input.dataset.other).map((input) => input.dataset.other));
    otherIds.forEach((id) => {
      const field = stage.querySelector(`#${CSS.escape(id)}`);
      if (!field) return;
      const visible = choices.some((input) => input.dataset.other === id && input.checked);
      field.hidden = !visible;
      field.querySelectorAll('input,textarea').forEach((input) => { input.disabled = !visible; });
    });
  });
  stage.querySelectorAll('[data-caso]').forEach((group) => {
    const field = group.nextElementSibling;
    if (!field) return;
    const visible = group.querySelector('input:checked')?.value === '1';
    field.hidden = !visible;
    field.querySelectorAll('input,textarea').forEach((input) => { input.disabled = !visible; });
  });
  const supportDetail = stage.querySelector('[data-bank-code="2B"]');
  if (supportDetail) {
    const visible = getPath('bank.support.o8') === 'Sí';
    supportDetail.hidden = !visible;
    supportDetail.querySelectorAll('input,textarea,select').forEach((input) => { input.disabled = !visible; });
  }

  const objective = stage.querySelector('#objetivo-2027');
  if (objective?.tagName === 'SELECT') {
    const hasFormation = state.products.includes('4PROT') || state.products.includes('CloudLabs');
    const hasLibrary = !hasFormation || state.products.some((product) => ![NONE, '4PROT', 'CloudLabs'].includes(product));
    const route = hasLibrary ? 'bib' : 'form';
    const selectedObjective = getPath('bank.priorities.objetivo-2027') || '';
    const priorities = [...stage.querySelectorAll(`select[data-route="${route}"]`)]
      .filter((select) => select.value.startsWith('Queremos crearlo o fortalecerlo'))
      .map((select) => select.dataset.label);
    objective.innerHTML = '<option value="">Seleccione un objetivo</option>' +
      priorities.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join('') +
      '<option value="otro">Otro</option><option value="nd">Aún no está definido</option>';
    if ([...objective.options].some((option) => option.value === selectedObjective)) objective.value = selectedObjective;
    const otherObjective = stage.querySelector('#objetivo-otro');
    if (otherObjective) {
      const visible = objective.value === 'otro';
      otherObjective.hidden = !visible;
      otherObjective.querySelectorAll('input,textarea').forEach((input) => { input.disabled = !visible; });
    }
  }
}

function validateStep() {
  syncInputs();
  errorBox.hidden = true;
  stage.querySelectorAll('.invalid').forEach((element) => element.classList.remove('invalid'));
  const invalidField = [...stage.querySelectorAll('[required]')].find((input) => !input.checkValidity());
  if (invalidField) {
    invalidField.closest('.field')?.classList.add('invalid');
    invalidField.focus();
    showError(invalidField.type === 'email' ? 'Escriba un correo electrónico válido.' : 'Complete los campos obligatorios para continuar.');
    return false;
  }
  const missingGroup = [...stage.querySelectorAll('[data-required-group]')].find((group) => {
    const key = group.dataset.requiredGroup;
    if (!key) return false;
    const value = getPath(key);
    return Array.isArray(value) ? value.length === 0 : !value;
  });
  if (missingGroup) {
    missingGroup.scrollIntoView({ behavior:'smooth', block:'center' });
    showError('Seleccione una respuesta en cada pregunta para continuar.');
    return false;
  }
  if (visibleSteps()[currentIndex]?.id === 'communication' && (state.communication.brand || []).length > 3) {
    showError('Seleccione máximo tres atributos para la marca Ignite.');
    return false;
  }
  return true;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function renderStep(animate = true) {
  const steps = visibleSteps();
  currentIndex = Math.max(0, Math.min(currentIndex, steps.length - 1));
  const step = steps[currentIndex];
  stage.innerHTML = step.render();
  hydrateInputs();
  refreshBankUi();
  if (!animate) stage.querySelector('.step').style.animation = 'none';
  errorBox.hidden = true;
  backButton.hidden = currentIndex === 0;
  nextButton.innerHTML = step.id === 'review' ? 'Enviar encuesta <span aria-hidden="true">✓</span>' : currentIndex === 0 ? 'Comenzar <span aria-hidden="true">→</span>' : 'Continuar <span aria-hidden="true">→</span>';
  const progress = Math.round((currentIndex / (steps.length - 1)) * 100);
  document.getElementById('progress-bar').style.width = `${progress}%`;
  document.querySelector('.progress-track').classList.toggle('is-complete', progress === 100);
  const walker = document.querySelector('.progress-walker');
  walker.textContent = progress === 100 ? '😄' : progress >= 70 ? '🙌' : progress >= 35 ? '🤔' : '🚶';
  walker.classList.toggle('is-walking', progress < 35);
  document.getElementById('progress-number').textContent = `${progress}%`;
  document.getElementById('progress-label').textContent = step.label;
  stage.querySelector('input, textarea, select')?.focus({ preventScroll:true });
  window.scrollTo({ top:0, behavior:'smooth' });
}

stage.addEventListener('input', () => { syncInputs(); saveDraft(); });
stage.addEventListener('change', (event) => {
  syncInputs();
  if (event.target.dataset.key === 'identity.institution_name') {
    const selected = INSTITUTIONS.find(({ name }) => name === event.target.value);
    if (selected) {
      state.identity.country = selected.country;
      if (slug(selected.country) === 'mexico') state.products = state.products.filter((product) => !MEXICO_HIDDEN_PRODUCTS.has(product));
    }
    if (event.target.value !== 'Otra') delete state.identity.other_institution;
  }
  const bankGroup = event.target.closest('[data-group]');
  if (bankGroup && event.target.type === 'checkbox') {
    const choices = [...bankGroup.querySelectorAll('input[type="checkbox"]')];
    if (event.target.checked) {
      if (event.target.hasAttribute('data-exclusive')) choices.forEach((input) => { if (input !== event.target) input.checked = false; });
      else choices.forEach((input) => { if (input.hasAttribute('data-exclusive')) input.checked = false; });
    }
    refreshBankUi();
    syncInputs();
  }
  if (event.target.dataset.key === 'products') {
    if (event.target.value === NONE && event.target.checked) state.products = [NONE];
    else if (event.target.value !== NONE && event.target.checked) state.products = state.products.filter((value) => value !== NONE);
  }
  if (event.target.dataset.key === 'sales.interests') {
    const exclusive = 'Por ahora no requerimos información adicional';
    if (event.target.value === exclusive && event.target.checked) state.sales.interests = [exclusive];
    else if (event.target.value !== exclusive && event.target.checked) state.sales.interests = state.sales.interests.filter((value) => value !== exclusive);
  }
  saveDraft();
  if (event.target.dataset.rerender || event.target.dataset.key === 'identity.institution_name' || event.target.dataset.key === 'bank.support.o8' || BANK_RERENDER_KEYS.has(event.target.dataset.key)) renderStep(false);
  else refreshBankUi();
});

stage.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-go-step]');
  if (!edit) return;
  const targetIndex = visibleSteps().findIndex((step) => step.id === edit.dataset.goStep);
  if (targetIndex >= 0) { currentIndex = targetIndex; renderStep(); }
});

backButton.addEventListener('click', () => {
  syncInputs();
  if (currentIndex > 0) currentIndex -= 1;
  renderStep();
});

nextButton.addEventListener('click', async () => {
  if (!validateStep()) return;
  const steps = visibleSteps();
  if (steps[currentIndex].id === 'review') return submitSurvey();
  currentIndex += 1;
  renderStep();
});

function sanitizedAnswers() {
  const isMexico = slug(state.identity.country || '') === 'mexico';
  const selectedProducts = state.products.filter((product) => product !== NONE && (!isMexico || !MEXICO_HIDDEN_PRODUCTS.has(product)));
  const answers = JSON.parse(JSON.stringify(state));
  answers.products = state.products.includes(NONE) ? [NONE] : selectedProducts;
  const activeBankKeys = selectedProducts.map((product) => PRODUCT_DETAIL_STEPS[product]).filter(Boolean);
  if (DATABASE_PRODUCTS.some((product) => selectedProducts.includes(product))) activeBankKeys.push('bd');
  answers.bank.product = Object.fromEntries(
    Object.entries(state.bank?.product || {})
      .filter(([key]) => activeBankKeys.includes(key))
      .map(([key, values]) => [key, pruneQuestionAnswers(values, visibleProductQuestions(key))])
  );
  answers.bank.support = pruneQuestionAnswers(answers.bank.support || {}, window.QUESTION_BANK.support);
  if (answers.bank.support?.o8 !== 'Sí') {
    answers.bank.support = Object.fromEntries(Object.entries(answers.bank.support || {}).filter(([key]) => !key.startsWith('m152-')));
  }
  answers.bank.priorities = pruneQuestionAnswers(answers.bank.priorities || {}, visiblePriorityQuestions());
  delete answers.satisfaction;
  delete answers.innovation;
  delete answers.product_details;
  delete answers.support;
  delete answers.renewal;
  delete answers.communication;
  delete answers.sales;
  delete answers.priorities;
  delete answers.future;
  if (answers.identity.institution_name === 'Otra') answers.identity.institution_name = answers.identity.other_institution;
  delete answers.identity.other_institution;
  if (!state.products.includes(NONE)) answers.other_solution = {};
  return answers;
}

function pruneQuestionAnswers(values, questions) {
  const allowed = new Set();
  questions.forEach((question) => {
    for (const match of question.html.matchAll(/data-key="([^"]+)"/g)) allowed.add(match[1].split('.').at(-1));
  });
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => allowed.has(key)));
}

async function submitSurvey() {
  nextButton.disabled = true;
  nextButton.textContent = 'Guardando…';
  if (DEMO_MODE) {
    isSubmitted = true;
    actions.hidden = true;
    document.querySelector('.journey').hidden = true;
    stage.innerHTML = `<article class="step success-screen"><div class="success-icon">✓</div><h2>Prueba completada.</h2><p class="step-intro">Recorriste correctamente el formulario. Esta versión es únicamente visual: las respuestas no se enviaron ni se guardaron en una base de datos.</p><span class="response-id">Modo beta · sin almacenamiento</span></article>`;
    document.querySelector('.privacy-note').textContent = 'Puedes volver a cargar la página para realizar otra prueba.';
    return;
  }
  try {
    const response = await fetch('/api/submit', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ startedAt: state.startedAt, answers:sanitizedAnswers() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo guardar la respuesta.');
    isSubmitted = true;
    localStorage.removeItem(DRAFT_KEY);
    actions.hidden = true;
    document.querySelector('.journey').hidden = true;
    stage.innerHTML = `<article class="step success-screen"><div class="success-icon">✓</div><h2>Gracias por ayudarnos a mejorar.</h2><p class="step-intro">Su respuesta quedó guardada. La usaremos para construir una experiencia Ignite más útil, cercana y relevante en 2027.</p><span class="response-id">Folio: ${escapeHtml(result.id)}</span></article>`;
    document.querySelector('.privacy-note').textContent = 'Puede cerrar esta ventana de forma segura.';
  } catch (error) {
    showError(error.message);
    nextButton.disabled = false;
    nextButton.innerHTML = 'Enviar encuesta <span aria-hidden="true">✓</span>';
  }
}

renderStep();
