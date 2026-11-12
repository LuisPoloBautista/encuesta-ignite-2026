const form = document.getElementById('admin-form');
const userInput = document.getElementById('admin-user');
const passwordInput = document.getElementById('admin-password');
const downloadButton = document.getElementById('download-button');
const statusBox = document.getElementById('admin-status');
const errorBox = document.getElementById('admin-error');
const statsPanel = document.getElementById('admin-stats');
const responseTotal = document.getElementById('response-total');
const institutionList = document.getElementById('institution-list');
const countryList = document.getElementById('country-list');

let authorization = '';

function basicAuthorization(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
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

function renderBreakdown(list, values) {
  list.replaceChildren();
  if (!values.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Sin respuestas';
    list.appendChild(empty);
    return;
  }
  values.forEach(({ name, total }) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const count = document.createElement('strong');
    label.textContent = name;
    count.textContent = total;
    item.append(label, count);
    list.appendChild(item);
  });
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
    const stats = await response.json();
    responseTotal.textContent = stats.total;
    renderBreakdown(institutionList, stats.institutions || []);
    renderBreakdown(countryList, stats.countries || []);
    statsPanel.hidden = false;
    form.querySelectorAll('.field, button[type="submit"]').forEach((element) => { element.hidden = true; });
    downloadButton.hidden = false;
  } catch (error) {
    authorization = '';
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});

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
