// ESTADO GLOBAL
let currentTab = 'fuel';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let editingId = null;

// CARGAR DB O INICIAR VACÍA
const db = JSON.parse(localStorage.getItem('mototrack_db')) || { fuel: [], maint: [] };

// ELEMENTOS DOM
const $summary = document.getElementById('summary');
const $list = document.getElementById('list-container');
const $pagination = document.getElementById('pagination');
const $modal = document.getElementById('modal');
const $form = document.getElementById('record-form');
const $fields = document.getElementById('form-fields');
const $themeBtn = document.getElementById('theme-toggle');

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  recalculateAll(); // Garantiza cálculos al abrir
  renderAll();
  setupEvents();
});

function setupEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentTab = e.target.dataset.tab;
      currentPage = 1;
      renderAll();
    });
  });

  document.getElementById('add-btn').addEventListener('click', () => openModal());
  document.getElementById('cancel-btn').addEventListener('click', () => $modal.close());
  $modal.addEventListener('close', () => { $form.reset(); editingId = null; });
  $form.addEventListener('submit', saveRecord);
  $list.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('edit')) openModal(id);
    if (e.target.classList.contains('delete')) deleteRecord(id);
  });

  $themeBtn.addEventListener('click', toggleTheme);
}

function getRecords() {
  return db[currentTab].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderAll() {
  const records = getRecords();
  renderSummary(records);
  renderList(records);
  renderPagination(records.length);
}

function renderSummary(records) {
  let totalMoney = 0;
  let avgVal = 0;
  
  // Registros válidos para promedio
  const validRecords = records.filter(r => r.consumption !== 'PRIMER REGISTRO' && !isNaN(parseFloat(r.consumption)));
  if (validRecords.length > 0) {
    avgVal = validRecords.reduce((sum, r) => sum + parseFloat(r.consumption), 0) / validRecords.length;
  }
  
  // Suma de dinero
  records.forEach(r => {
    const val = parseFloat(r.money || r.price || 0);
    totalMoney += isNaN(val) ? 0 : val;
  });

  const label = currentTab === 'fuel' ? 'Promedio General KM/L' : 'Promedio General KM/Mant.';
  const moneyLabel = currentTab === 'fuel' ? 'Dinero invertido (combustible)' : 'Dinero invertido (aceite)';
  
  $summary.innerHTML = `
    <div class="summary-stat"><span>${avgVal.toFixed(2)}</span>${label}</div>
    <div class="summary-stat"><span>$${totalMoney.toFixed(2)}</span>${moneyLabel}</div>
  `;
}

function renderList(records) {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageData = records.slice(start, start + ITEMS_PER_PAGE);
  
  $list.innerHTML = '';
  if (pageData.length === 0) {
    $list.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--text-sec);">No hay registros aún. Toca + para agregar uno.</p>';
    return;
  }

  pageData.forEach(rec => {
    const dinero = currentTab === 'fuel' 
      ? (parseFloat(rec.money || (parseFloat(rec.liters || 0) * parseFloat(rec.pricePerL || 0)))).toFixed(2)
      : parseFloat(rec.price || 0).toFixed(2);

    const fields = currentTab === 'fuel' 
      ? `<div class="record-row">
           <span class="label"><span class="icon">📅</span>Fecha:</span>
           <span class="value">${formatDate(rec.date)}</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">🛣️</span>Odómetro:</span>
           <span class="value">${rec.odometer} km</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">⛽</span>Litros:</span>
           <span class="value">${rec.liters} L</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">💲</span>Precio/L:</span>
           <span class="value">$${rec.pricePerL}</span>
         </div>
         <div class="record-row money-row">
           <span class="label"><span class="icon">💰</span>Dinero gastado:</span>
           <span class="value">$${dinero}</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">🏁</span>Consumo:</span>
           <span class="value">${rec.consumption} KM/L</span>
         </div>`
      : `<div class="record-row">
           <span class="label"><span class="icon">📅</span>Fecha:</span>
           <span class="value">${formatDate(rec.date)}</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">🛣️</span>Odómetro:</span>
           <span class="value">${rec.odometer} km</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">🛢️</span>Aceite:</span>
           <span class="value">${rec.brand} (${rec.type} - ${rec.viscosity})</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">💲</span>Precio:</span>
           <span class="value">$${rec.price}</span>
         </div>
         <div class="record-row">
           <span class="label"><span class="icon">🔧</span>Intervalo:</span>
           <span class="value">${rec.consumption} KM</span>
         </div>`;

    $list.insertAdjacentHTML('beforeend', `
      <article class="record-card" data-id="${rec.id}">
        ${fields}
        <div class="record-actions">
          <button class="edit">Editar</button>
          <button class="delete" style="background:#ef4444; color:white;">Eliminar</button>
        </div>
      </article>
    `);
  });
}

function renderPagination(total) {
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  $pagination.innerHTML = '';
  if (pages <= 1) return;
  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.style.fontWeight = i === currentPage ? 'bold' : 'normal';
    btn.addEventListener('click', () => { currentPage = i; renderAll(); });
    $pagination.appendChild(btn);
  }
}

function openModal(id = null) {
  editingId = id;
  const rec = id ? db[currentTab].find(r => r.id === id) : null;
  document.getElementById('modal-title').textContent = id ? 'Editar Registro' : 'Nuevo Registro';

  // ✅ Usa hora local corregida
  const now = getLocalDateTime();
  $fields.innerHTML = '';
  
  const fieldsConfig = currentTab === 'fuel' 
    ? [
        { id: 'date', label: 'Fecha y hora', type: 'datetime-local', val: rec?.date || now },
        { id: 'odometer', label: 'Odómetro (km)', type: 'number', val: rec?.odometer || '' },
        { id: 'liters', label: 'Litros', type: 'number', step: '0.01', val: rec?.liters || '' },
        { id: 'pricePerL', label: 'Precio por litro ($)', type: 'number', step: '0.01', val: rec?.pricePerL || '' }
      ]
    : [
        { id: 'date', label: 'Fecha y hora', type: 'datetime-local', val: rec?.date || now },
        { id: 'odometer', label: 'Odómetro (km)', type: 'number', val: rec?.odometer || '' },
        { id: 'brand', label: 'Marca del aceite', type: 'text', val: rec?.brand || '' },
        { id: 'type', label: 'Tipo', type: 'select', opts: ['Sintético', 'Natural'], val: rec?.type || 'Sintético' },
        { id: 'viscosity', label: 'Viscosidad (ej: 10W40)', type: 'text', val: rec?.viscosity || '' },
        { id: 'price', label: 'Precio del aceite ($)', type: 'number', step: '0.01', val: rec?.price || '' }
      ];

  fieldsConfig.forEach(f => {
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '0.75rem';
    wrapper.innerHTML = `<label style="display:block; margin-bottom:0.3rem; font-weight:500;">${f.label}</label>`;
    if (f.type === 'select') {
      const sel = document.createElement('select');
      sel.id = f.id; sel.required = true; sel.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);';
      f.opts.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; if(o===f.val) opt.selected=true; sel.appendChild(opt); });
      wrapper.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = f.type; inp.id = f.id; inp.step = f.step || 'any'; inp.value = f.val; inp.required = true;
      inp.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);';
      wrapper.appendChild(inp);
    }
    $fields.appendChild(wrapper);
  });

  $modal.showModal();
}


function saveRecord(e) {
  e.preventDefault();
  const data = {};
  $fields.querySelectorAll('input, select').forEach(el => data[el.id] = el.value);
  
  if (currentTab === 'fuel') {
    data.id = editingId || crypto.randomUUID();
    // ✅ CÁLCULO EXPLÍCITO DE DINERO GASTADO
    data.money = (parseFloat(data.liters) * parseFloat(data.pricePerL)).toFixed(2);
    data.consumption = 'PENDING';
  } else {
    data.id = editingId || crypto.randomUUID();
    data.money = parseFloat(data.price).toFixed(2);
    data.consumption = 'PENDING';
  }

  if (editingId) {
    const idx = db[currentTab].findIndex(r => r.id === editingId);
    db[currentTab][idx] = { ...db[currentTab][idx], ...data };
  } else {
    db[currentTab].push(data);
  }

  recalculateAll();
  saveDB();
  $modal.close();
  renderAll();
}

function recalculateAll() {
  const sorted = db[currentTab].sort((a, b) => new Date(a.date) - new Date(b.date));
  sorted.forEach((rec, i) => {
    const prev = sorted[i - 1];
    const odom = parseFloat(rec.odometer);
    if (currentTab === 'fuel') {
      rec.consumption = prev ? ((odom - parseFloat(prev.odometer)) / parseFloat(rec.liters)).toFixed(2) : 'PRIMER REGISTRO';
    } else {
      rec.consumption = prev ? (odom - parseFloat(prev.odometer)).toFixed(2) : 'PRIMER REGISTRO';
    }
  });
}

function deleteRecord(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  db[currentTab] = db[currentTab].filter(r => r.id !== id);
  saveDB();
  recalculateAll();
  renderAll();
}

function saveDB() { localStorage.setItem('mototrack_db', JSON.stringify(db)); }
function formatDate(iso) { return new Date(iso).toLocaleString(); }

// TEMAS
function loadTheme() {
  const saved = localStorage.getItem('mototrack_theme');
  if (saved === 'dark' || saved === 'light') {
    document.body.className = saved;
  } else {
    document.body.className = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
function toggleTheme() {
  const isDark = document.body.className === 'dark';
  document.body.className = isDark ? 'light' : 'dark';
  localStorage.setItem('mototrack_theme', document.body.className);
}

// ✅ CORRECCIÓN DE ZONA HORARIA
function getLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset(); // Minutos de diferencia con UTC
  return new Date(now.getTime() - (offset * 60000)).toISOString().slice(0, 16);
}

// SERVICE WORKER
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}