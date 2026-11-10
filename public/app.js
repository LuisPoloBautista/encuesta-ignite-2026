const PRODUCTS = [
  'Koha', 'Winkel', 'OJS', 'DSpace', 'MyLOFT', 'Bases de datos', 'LEMB',
  'Marketing Smith', 'Soporte', '4Pro', 'CloudLabs', 'IG Publishing', 'Servidores', 'Odilo'
];

const PRODUCT_DETAIL_STEPS = {
  'Marketing Smith': 'marketing', Koha: 'koha', DSpace: 'dspace', Winkel: 'winkel',
  LEMB: 'lemb', MyLOFT: 'myloft', Servidores: 'servers', 'IG Publishing': 'ig'
};

const COUNTRIES = ['Argentina','Bolivia','Brasil','Chile','Colombia','Costa Rica','Ecuador','El Salvador','España','Guatemala','Honduras','México','Nicaragua','Panamá','Paraguay','Perú','Puerto Rico','República Dominicana','Uruguay','Venezuela','Otro'];
const DRAFT_KEY = 'ignite-survey-2026-draft-v1';
const NONE = 'Ninguno de los anteriores';
const DEMO_MODE = true;

const emptyState = () => ({
  startedAt: new Date().toISOString(),
  identity: {}, products: [], satisfaction: {}, product_details: {},
  other_solution: {}, priorities: [], priority_results: {}, support: {}, reports: {},
  communication: {}, renewal: {}, future: {}
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

function ratingRows(path, rows, { na = true, required = true, left = 'Muy bajo', right = 'Excelente' } = {}) {
  return `<div class="rating-list">${rows.map((row) => {
    const key = `${path}.${slug(row)}`;
    const current = getPath(key);
    const values = ['1','2','3','4','5', ...(na ? ['No aplica'] : [])];
    return `<div class="rating-row" data-required-group="${required ? key : ''}">
      <span class="rating-row-title">${escapeHtml(row)}</span>
      <div class="rating-scale">${values.map((value) => `<label class="${value === 'No aplica' ? 'na-option' : ''}"><input type="radio" name="${key}" value="${value}" data-key="${key}" ${current === value ? 'checked' : ''}><span>${value}</span></label>`).join('')}</div>
      <div class="rating-legend"><span>${left}</span><span>${right}</span></div>
    </div>`;
  }).join('')}</div>`;
}

function stepFrame(kicker, title, intro, body, heading = 'h2') {
  return `<article class="step"><span class="step-kicker">${kicker}</span><${heading}>${title}</${heading}>${intro ? `<p class="step-intro">${intro}</p>` : ''}${body}</article>`;
}

function welcomeStep() {
  return stepFrame('Encuesta 2026', 'Tu experiencia enciende nuestro <span class="accent">próximo paso.</span>',
    'Gracias por acompañar a Ignite durante 2026. Queremos conocer tu experiencia y las prioridades de tu institución para construir un 2027 aún mejor.',
    `<div class="welcome-mark"></div><ul class="welcome-points"><li>8–12 minutos</li><li>Preguntas adaptadas a ti</li><li>Borrador automático</li></ul>`, 'h1');
}

function identityStep() {
  return stepFrame('Sobre ti', 'Primero, conozcámonos', 'Estos datos nos ayudan a asociar la respuesta con tu institución y dar seguimiento cuando sea necesario.',
    `<div class="field-grid">
      ${textField('identity.full_name','Nombre completo',{required:true,autocomplete:'name'})}
      ${textField('identity.email','Correo electrónico',{type:'email',required:true,autocomplete:'email'})}
      ${textField('identity.institution_name','Institución o empresa',{required:true,autocomplete:'organization'})}
      <label class="field"><span>País *</span><input list="country-list" data-key="identity.country" value="${escapeHtml(state.identity.country || '')}" required autocomplete="country-name" placeholder="Selecciona o escribe"><datalist id="country-list">${COUNTRIES.map((country) => `<option value="${country}">`).join('')}</datalist></label>
      ${textField('identity.role','Cargo',{required:true,autocomplete:'organization-title'})}
      ${textField('identity.contact_phone','Número de contacto',{type:'tel',autocomplete:'tel',placeholder:'Opcional'})}
    </div>`);
}

function productsStep() {
  return stepFrame('Tu experiencia', '¿Qué productos o servicios utilizó tu institución en 2026?', 'Selecciona todos los que correspondan. La encuesta mostrará únicamente las preguntas relevantes.',
    optionCards('products', [...PRODUCTS, { value: NONE, label: NONE, help: 'Usamos otras soluciones' }], { type:'checkbox', required:true, rerender:true }));
}

function satisfactionStep() {
  const products = state.products.filter((product) => product !== NONE);
  return stepFrame('Experiencia por producto', '¿Qué tan satisfecho estás?', 'Valora únicamente los productos y servicios que seleccionaste.',
    ratingRows('satisfaction', products, { left:'Muy insatisfecho', right:'Muy satisfecho' }));
}

function marketingStep() {
  const base = 'product_details.marketing';
  return stepFrame('Marketing Smith', 'La difusión también es parte de la experiencia', 'Cuéntanos cómo fue el proceso y qué resultados produjo.',
    question('Califica el proceso de preparación del material', ratingRows(`${base}.process`, [
      'Entendimos las necesidades de tu institución', 'La estrategia fue adecuada para tu público', 'Cumplimos los tiempos acordados', 'La comunicación fue ágil'
    ], { na:false })) +
    question('¿El plan de difusión ayudó a alcanzar sus objetivos?', optionCards(`${base}.result`, ['Superó lo esperado','Cumplió lo esperado','Parcialmente','No'], { rerender:true })) +
    (getPath(`${base}.result`) ? `<div class="field-grid">${textField(`${base}.improvements`,'¿Qué cambiarías o agregarías para la próxima difusión?',{textarea:true,full:true})}</div>` : ''));
}

function kohaStep() {
  const base = 'product_details.koha';
  const wants = getPath(`${base}.features_interest`);
  return stepFrame('Koha', 'Tu experiencia con Koha', 'Queremos entender qué funciona bien y dónde podemos ayudarte a obtener más valor.',
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
  return stepFrame('DSpace', 'La experiencia con tu repositorio', 'Ayúdanos a comprender el valor y los retos del servicio durante este año.',
    question('Califica estos aspectos de DSpace', ratingRows(`${base}.experience`, ['Estabilidad y disponibilidad','Velocidad','Gestión de metadatos','Carga y publicación de contenidos','Búsqueda y consulta','Interoperabilidad e integraciones','Acompañamiento de Ignite'])) +
    question('¿En qué medida DSpace ayudó a cumplir sus objetivos?', optionCards(`${base}.outcome`, ['Superó lo esperado','Cumplió lo esperado','Cumplió parcialmente','No ayudó','No lo sé'])) +
    `<div class="field-grid">${textField(`${base}.outcome_reason`,'Cuéntanos el motivo',{textarea:true,full:true})}</div>` +
    question('¿Te interesaría conocer aplicaciones de inteligencia artificial para DSpace?', optionCards(`${base}.ai_interest`, ['Sí','No','Tal vez'], { compact:true })));
}

function winkelStep() {
  const base = 'product_details.winkel';
  return stepFrame('Winkel', 'Objetivos y resultados con Winkel', 'Queremos saber qué buscaban lograr y qué impacto observaron.',
    question('¿Cuáles fueron sus principales objetivos?', optionCards(`${base}.objectives`, ['Mejorar la experiencia de usuarios','Aumentar el uso de recursos','Fortalecer servicios digitales','Optimizar procesos','Obtener mejores datos','Otro'], { type:'checkbox' })) +
    question('Califica tu experiencia', ratingRows(`${base}.experience`, ['Comprensión de sus necesidades','Calidad de las propuestas','Viabilidad de las recomendaciones','Acompañamiento durante el proceso','Cumplimiento de tiempos'])) +
    question('¿En qué medida los resultados cumplieron lo esperado?', optionCards(`${base}.outcome`, ['Superaron lo esperado','Cumplieron lo esperado','Cumplieron parcialmente','No cumplieron','No lo sé'])) +
    `<div class="field-grid">${textField(`${base}.improvements`,'¿Qué podríamos mejorar o agregar?',{textarea:true,full:true})}</div>`);
}

function lembStep() {
  const base = 'product_details.lemb';
  return stepFrame('LEMB', 'Tu trabajo diario con LEMB', 'Cuéntanos cómo utilizas sus funciones y dónde debería crecer el vocabulario.',
    question('Califica tu experiencia', ratingRows(`${base}.experience`, ['Facilidad para encontrar términos','Claridad de las relaciones entre términos','Actualización del vocabulario','Utilidad para catalogación','Acompañamiento de Ignite'])) +
    question('¿Qué funcionalidades utilizaste?', optionCards(`${base}.features`, ['Búsqueda de términos','Consulta de relaciones','Notas de alcance','Equivalencias','Actualizaciones','Otra'], { type:'checkbox' })) +
    question('¿En qué áreas debería fortalecerse en 2027?', optionCards(`${base}.areas`, ['Ciencias sociales','Salud','Tecnología','Artes y humanidades','Educación','Derecho','Otra'], { type:'checkbox' })) +
    `<div class="field-grid">${textField(`${base}.support_needed`,'¿Qué te ayudaría a aprovechar mejor LEMB?',{textarea:true,full:true})}${textField(`${base}.unresolved_cases`,'Términos o casos que no hayas podido resolver',{textarea:true,full:true})}</div>`);
}

function myloftStep() {
  const base = 'product_details.myloft';
  return stepFrame('MyLOFT', 'Acceso simple, experiencia clara', 'Valora los momentos más importantes de la experiencia con MyLOFT.',
    question('Califica estos aspectos', ratingRows(`${base}.experience`, ['Acceso remoto a recursos','Inicio de sesión','Organización y descubrimiento de recursos','Experiencia en dispositivos móviles','Implementación o migración','Acompañamiento de Ignite'])));
}

function serversStep() {
  const base = 'product_details.servers';
  const hadFailure = getPath(`${base}.failures`);
  return stepFrame('Servidores', 'La base de una experiencia confiable', 'Cuéntanos cómo funcionó el alojamiento de tus plataformas.',
    question('Califica el servicio de alojamiento', ratingRows(`${base}.experience`, ['Disponibilidad de las plataformas','Velocidad y rendimiento','Seguridad y confianza','Comunicación sobre mantenimientos','Acompañamiento técnico'])) +
    question('¿Se presentó alguna caída o falla este año?', optionCards(`${base}.failures`, ['Sí','No','No lo sé'], { compact:true, rerender:true })) +
    (hadFailure === 'Sí' ? `<div class="conditional-panel">${question('¿Cómo fue la respuesta ante la falla?', ratingRows(`${base}.failure_response`, ['Rapidez de respuesta','Claridad de la comunicación','Tiempo de solución','Seguimiento posterior'], { na:false }))}</div>` : '') +
    question('Servicios que interesaría evaluar para 2027', optionCards(`${base}.priorities`, ['Más capacidad de almacenamiento','Mejoras de rendimiento','Copias de seguridad adicionales','Monitoreo avanzado','Alta disponibilidad','Otra ampliación','Ninguna por ahora'], { type:'checkbox' })));
}

function igStep() {
  const base = 'product_details.ig';
  return stepFrame('IG Publishing', 'La colección en tu comunidad', 'Queremos conocer la experiencia de acceso, uso y pertinencia.',
    question('Califica tu experiencia', ratingRows(`${base}.experience`, ['Pertinencia de los contenidos','Calidad editorial','Facilidad de acceso','Experiencia de lectura','Acompañamiento de Ignite'])) +
    question('¿Qué tan utilizados son los libros?', optionCards(`${base}.usage`, ['Muy utilizados','Bastante utilizados','Poco utilizados','No se utilizan','No lo sé'])) +
    question('¿Interesaría una colección para desarrollar habilidades de IA desde cero?', optionCards(`${base}.ai_collection`, ['Sí','No','Tal vez'], { compact:true })));
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
  const contacted = state.support.contacted;
  return stepFrame('Soporte', 'Cuando necesitaste ayuda, ¿cómo fue la experiencia?', 'Primero dinos si tu institución contactó al equipo de soporte durante 2026.',
    question('¿Contactaron al servicio de soporte?', optionCards('support.contacted', ['Sí','No','No lo sé'], { compact:true, rerender:true })) +
    (contacted === 'Sí' ? `<div class="conditional-panel">${question('Califica la experiencia', ratingRows('support.experience', ['Facilidad para contactar al equipo','Rapidez de la primera respuesta','Comprensión del caso','Claridad de las respuestas','Tiempo de solución','Seguimiento hasta el cierre','Trato y disposición del equipo'], { na:false }))}</div>` : ''));
}

function reportsStep() {
  const usage = state.reports.usage;
  return stepFrame('Informes y datos', 'Los datos deben ayudar a decidir', 'Cuéntanos si recibiste informes y qué información sería más valiosa.',
    question('Durante 2026, ¿recibiste y utilizaste informes de Ignite?', optionCards('reports.usage', ['Sí, los recibí y los utilicé','Los recibí, pero no los utilicé','No los recibí','No lo sé'], { rerender:true })) +
    (usage === 'Sí, los recibí y los utilicé' ? `<div class="conditional-panel">${question('¿Qué tan útiles fueron?', ratingRows('reports.usefulness', ['Evaluar el uso de productos','Tomar decisiones internas','Presentar resultados a directivos','Detectar oportunidades de mejora','Planear actividades','Justificar inversiones'], { na:false }))}</div>` : '') +
    question('¿Qué datos te interesaría recibir?', optionCards('reports.interests', ['Uso y actividad','Adopción por áreas','Tendencias en el tiempo','Comparativos','Incidencias y soporte','Recomendaciones accionables'], { type:'checkbox', required:true })) +
    `<div class="field-grid">${textField('reports.additional','¿Hay algún dato adicional que necesites?',{textarea:true,full:true})}</div>`);
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
    question('¿Qué tan claro fue lo que incluía la propuesta?', optionCards('renewal.clarity', ['Muy claro','Claro','Parcialmente claro','Poco claro','Nada claro','No participé'])) +
    `<div class="field-grid">${textField('renewal.improvements','¿Qué podríamos explicar mejor?',{textarea:true,full:true})}</div>`);
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
    ['identity','Tus datos', state.identity.institution_name || 'Sin completar'],
    ['products','Productos y servicios', state.products.join(', ') || 'Sin completar'],
    ['priorities','Prioridades 2026', state.priorities.join(', ') || 'Sin completar'],
    ['support','Soporte', state.support.contacted || 'Sin completar'],
    ['future','Mirando a 2027', (state.future.topics || []).join(', ') || 'Sin completar']
  ];
  return stepFrame('Antes de enviar', 'Revisa tus respuestas', 'Puedes volver a cualquier bloque antes de enviar. Al confirmar, guardaremos la respuesta de forma segura.',
    `<div class="review-list">${items.map(([id,label,value]) => `<div class="review-item"><div><span>${label}</span><strong>${escapeHtml(value)}</strong></div><button type="button" data-go-step="${id}">Editar</button></div>`).join('')}</div>
    <p class="inline-note">Al enviar aceptas que Ignite utilice esta información para mejorar sus productos, servicios y acompañamiento.</p>`);
}

const baseSteps = [
  { id:'welcome', label:'Bienvenida', render:welcomeStep },
  { id:'identity', label:'Identificación', render:identityStep },
  { id:'products', label:'Productos y servicios', render:productsStep },
  { id:'satisfaction', label:'Satisfacción', when:() => !state.products.includes(NONE), render:satisfactionStep },
  { id:'marketing', label:'Marketing Smith', when:() => state.products.includes('Marketing Smith'), render:marketingStep },
  { id:'koha', label:'Koha', when:() => state.products.includes('Koha'), render:kohaStep },
  { id:'dspace', label:'DSpace', when:() => state.products.includes('DSpace'), render:dspaceStep },
  { id:'winkel', label:'Winkel', when:() => state.products.includes('Winkel'), render:winkelStep },
  { id:'lemb', label:'LEMB', when:() => state.products.includes('LEMB'), render:lembStep },
  { id:'myloft', label:'MyLOFT', when:() => state.products.includes('MyLOFT'), render:myloftStep },
  { id:'servers', label:'Servidores', when:() => state.products.includes('Servidores'), render:serversStep },
  { id:'ig', label:'IG Publishing', when:() => state.products.includes('IG Publishing'), render:igStep },
  { id:'other', label:'Otras soluciones', when:() => state.products.includes(NONE), render:otherSolutionStep },
  { id:'priorities', label:'Resultados 2026', render:prioritiesStep },
  { id:'support', label:'Soporte', render:supportStep },
  { id:'reports', label:'Informes y datos', render:reportsStep },
  { id:'communication', label:'Comunicación', render:communicationStep },
  { id:'renewal', label:'Renovación', render:renewalStep },
  { id:'future', label:'Prioridades 2027', render:futureStep },
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

function validateStep() {
  syncInputs();
  errorBox.hidden = true;
  stage.querySelectorAll('.invalid').forEach((element) => element.classList.remove('invalid'));
  const invalidField = [...stage.querySelectorAll('[required]')].find((input) => !input.checkValidity());
  if (invalidField) {
    invalidField.closest('.field')?.classList.add('invalid');
    invalidField.focus();
    showError(invalidField.type === 'email' ? 'Escribe un correo electrónico válido.' : 'Completa los campos obligatorios para continuar.');
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
    showError('Selecciona una respuesta en cada pregunta para continuar.');
    return false;
  }
  if (visibleSteps()[currentIndex]?.id === 'communication' && (state.communication.brand || []).length > 3) {
    showError('Selecciona máximo tres atributos para la marca Ignite.');
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
  if (!animate) stage.querySelector('.step').style.animation = 'none';
  errorBox.hidden = true;
  backButton.hidden = currentIndex === 0;
  nextButton.innerHTML = step.id === 'review' ? 'Enviar encuesta <span aria-hidden="true">✓</span>' : currentIndex === 0 ? 'Comenzar <span aria-hidden="true">→</span>' : 'Continuar <span aria-hidden="true">→</span>';
  document.getElementById('step-counter').textContent = `${currentIndex + 1} de ${steps.length}`;
  const progress = Math.round((currentIndex / (steps.length - 1)) * 100);
  document.getElementById('progress-bar').style.width = `${progress}%`;
  document.getElementById('progress-number').textContent = `${progress}%`;
  document.getElementById('progress-label').textContent = step.label;
  stage.querySelector('input, textarea, select')?.focus({ preventScroll:true });
  window.scrollTo({ top:0, behavior:'smooth' });
}

stage.addEventListener('input', () => { syncInputs(); saveDraft(); });
stage.addEventListener('change', (event) => {
  syncInputs();
  if (event.target.dataset.key === 'products') {
    if (event.target.value === NONE && event.target.checked) state.products = [NONE];
    else if (event.target.value !== NONE && event.target.checked) state.products = state.products.filter((value) => value !== NONE);
  }
  saveDraft();
  if (event.target.dataset.rerender) renderStep(false);
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
  const selectedProducts = state.products.filter((product) => product !== NONE);
  const activeDetails = {};
  Object.entries(PRODUCT_DETAIL_STEPS).forEach(([product, key]) => {
    if (state.products.includes(product) && state.product_details[key]) activeDetails[key] = state.product_details[key];
  });
  const answers = JSON.parse(JSON.stringify(state));
  answers.satisfaction = Object.fromEntries(Object.entries(state.satisfaction).filter(([key]) => selectedProducts.some((product) => slug(product) === key)));
  answers.product_details = activeDetails;
  if (!state.products.includes(NONE)) answers.other_solution = {};
  if (state.support.contacted !== 'Sí') delete answers.support.experience;
  if (state.reports.usage !== 'Sí, los recibí y los utilicé') delete answers.reports.usefulness;
  return answers;
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
    stage.innerHTML = `<article class="step success-screen"><div class="success-icon">✓</div><h2>Gracias por ayudarnos a mejorar.</h2><p class="step-intro">Tu respuesta quedó guardada. La usaremos para construir una experiencia Ignite más útil, cercana y relevante en 2027.</p><span class="response-id">Folio: ${escapeHtml(result.id)}</span></article>`;
    document.querySelector('.privacy-note').textContent = 'Puedes cerrar esta ventana de forma segura.';
  } catch (error) {
    showError(error.message);
    nextButton.disabled = false;
    nextButton.innerHTML = 'Enviar encuesta <span aria-hidden="true">✓</span>';
  }
}

renderStep();
