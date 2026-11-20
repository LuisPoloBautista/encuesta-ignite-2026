const form = document.getElementById('admin-form');
const userInput = document.getElementById('admin-user');
const passwordInput = document.getElementById('admin-password');
const downloadButton = document.getElementById('download-button');
const statusBox = document.getElementById('admin-status');
const errorBox = document.getElementById('admin-error');
const statsPanel = document.getElementById('admin-stats');
const territoryFilter = document.getElementById('territory-filter');

let authorization = '';
let institutionRows = [];
let refreshTimer;

function basicAuthorization(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

async function authenticatedFetch(path) {
  const response = await fetch(path, { headers: { Authorization: authorization }, cache: 'no-store' });
  if (!response.ok) {
    let message = 'No fue posible completar la solicitud.';
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  return response;
}

function metricBar(label, value, maximum = 5, detail = '') {
  const percentage = value === null ? 0 : Math.min(100, (value / maximum) * 100);
  return `<div class="metric-row"><div><span>${escapeHtml(label)}</span><strong>${value === null ? '—' : escapeHtml(value)}${detail}</strong></div><div class="mini-progress"><span style="width:${percentage}%"></span></div></div>`;
}

function renderTerritories(territories, overall) {
  document.getElementById('territory-cards').innerHTML = territories.map((item) => `
    <article class="territory-card">
      <div><h3>${escapeHtml(item.territory)}</h3><strong>${item.percentage}%</strong></div>
      <p>${item.responded} de ${item.total} instituciones respondieron</p>
      <div class="coverage-progress"><span style="width:${Math.min(item.percentage, 100)}%"></span><i style="left:90%" title="Meta 90%"></i></div>
      <small>Pendientes totales: <b>${item.missing}</b>. Faltan <b>${item.remainingToGoal}</b> para llegar a ${item.goalCount} instituciones (90%).</small>
    </article>`).join('');
  document.getElementById('territory-summary-body').innerHTML = [...territories, { territory:'Total', ...overall }].map((item) => `
    <tr><td><strong>${escapeHtml(item.territory)}</strong></td><td>${item.total}</td><td>${item.responded}</td><td>${item.missing}</td><td>${item.percentage}%</td></tr>`).join('');
}

function renderInstitutions() {
  const selected = territoryFilter.value;
  const visible = institutionRows.filter(({ territory }) => !selected || territory === selected);
  document.getElementById('institution-table-body').innerHTML = visible.map((item) => `
    <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.country)}</td><td>${escapeHtml(item.territory)}</td><td><span class="status-pill ${item.responded ? 'responded' : 'pending'}">${item.responded ? 'Respondió' : 'Pendiente'}</span></td></tr>`).join('');
}

function renderAnalytics(analytics) {
  const products = analytics.products || [];
  document.getElementById('product-metrics').innerHTML = products.length ? products.map((item) => `
    <div class="product-metric"><b>${escapeHtml(item.product)}</b>${metricBar('Satisfacción promedio', item.satisfactionAverage, 5, ' / 5')}<small>${item.responses} ${item.responses === 1 ? 'valoración' : 'valoraciones'} de satisfacción general</small></div>`).join('') : '<p class="empty-metric">Aún no hay datos.</p>';
  document.getElementById('commercial-metrics').innerHTML = (analytics.commercial || []).map((item) => metricBar(item.aspect, item.average)).join('') || '<p class="empty-metric">Aún no hay datos.</p>';
  document.getElementById('interest-metrics').innerHTML = (analytics.interests || []).map((item) => `
    <div class="metric-row interest-metric"><div><span>${escapeHtml(item.name)}</span><strong>${item.total} cliente(s) · ${item.percentage}%</strong></div><div class="mini-progress"><span style="width:${Math.min(item.percentage, 100)}%"></span></div></div>`).join('') || '<p class="empty-metric">Aún no hay productos seleccionados.</p>';
}

function renderStats(stats) {
  const limitedScope = stats.scope === '4prot-cloudlabs';
  const overall = stats.coverage.overall;
  const scopeLabel = document.getElementById('admin-scope-label');
  scopeLabel.textContent = stats.scopeLabel || '';
  scopeLabel.hidden = !stats.scopeLabel;
  document.getElementById('dashboard-title').textContent = limitedScope ? 'Resultados de 4PROT y CloudLabs' : 'Cobertura de clientes';
  document.getElementById('institution-heading').textContent = limitedScope ? 'Clientes que seleccionaron 4PROT o CloudLabs' : 'Estado de las instituciones';
  document.getElementById('coverage-goal-card').hidden = limitedScope;
  document.getElementById('remaining-goal-card').hidden = limitedScope;
  document.getElementById('territory-section').hidden = limitedScope;
  document.getElementById('response-total').textContent = stats.totalResponses;
  document.getElementById('coverage-responded').textContent = overall.responded;
  document.getElementById('coverage-total').textContent = limitedScope ? 'con 4PROT, CloudLabs o ambos' : `de ${overall.total} clientes · ${overall.missing} pendientes`;
  document.getElementById('coverage-percentage').textContent = `${overall.percentage}%`;
  document.getElementById('remaining-goal').textContent = overall.remainingToGoal;
  document.getElementById('last-updated').textContent = `Actualizado: ${new Date(stats.updatedAt).toLocaleString('es-MX')}`;
  institutionRows = stats.institutions || [];
  renderTerritories(stats.coverage.territories || [], overall);
  renderInstitutions();
  renderAnalytics(stats.analytics || {});
}

async function loadStats({ silent = false } = {}) {
  try {
    const response = await authenticatedFetch('/api/admin/stats');
    renderStats(await response.json());
    statsPanel.hidden = false;
    if (!silent) statusBox.hidden = true;
  } catch (error) {
    if (!silent) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  statusBox.hidden = true;
  statsPanel.hidden = true;
  downloadButton.hidden = true;
  authorization = basicAuthorization(userInput.value.trim(), passwordInput.value);
  try {
    const response = await authenticatedFetch('/api/admin/stats');
    renderStats(await response.json());
    statsPanel.hidden = false;
    form.querySelectorAll('.field, button[type="submit"]').forEach((element) => { element.hidden = true; });
    downloadButton.hidden = false;
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadStats({ silent:true }), 60_000);
  } catch (error) {
    authorization = '';
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});

territoryFilter.addEventListener('change', renderInstitutions);

downloadButton.addEventListener('click', async () => {
  errorBox.hidden = true;
  downloadButton.disabled = true;
  downloadButton.textContent = 'Generando Excel…';
  try {
    const response = await authenticatedFetch('/api/export.xlsx');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'respuestas-ignite.xlsx';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    downloadButton.disabled = false;
    downloadButton.textContent = 'Descargar Excel';
  }
});
