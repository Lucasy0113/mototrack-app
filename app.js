// 🏍️ MotoTrack - App.js (Versión Final con Cálculo Automático)
let currentTab = 'fuel';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let editingId = null;
let currentUser = null;
let localCache = { fuel: [], maint: [] };

const $summary = document.getElementById('summary');
const $list = document.getElementById('list-container');
const $pagination = document.getElementById('pagination');
const $modal = document.getElementById('modal');
const $form = document.getElementById('record-form');
const $fields = document.getElementById('form-fields');
const $themeBtn = document.getElementById('theme-toggle');
const $addBtn = document.getElementById('add-btn');

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  await waitForDb();
  setupAuthListener();
  await checkAuth();
  setupEvents();
});

function waitForDb(timeout = 5000) {
  return new Promise((resolve) => {
    if (window.db) { resolve(); return; }
    const start = Date.now();
    const check = () => {
      if (window.db || Date.now() - start > timeout) resolve();
      else setTimeout(check, 100);
    };
    check();
  });
}

// ==================== AUTENTICACIÓN ====================
async function checkAuth() {
  const saved = localStorage.getItem('mototrack_user');
  if (saved) {
    try {
      if (window.db) {
        const user = await Promise.race([window.db.getCurrentUser(), new Promise(r => setTimeout(() => r(null), 3000))]);
        if (user) {
          currentUser = user;
          $addBtn.style.display = 'flex';
          await loadData();
          return;
        }
      }
    } catch (e) { console.warn('Error auth:', e); }
  }
  $addBtn.style.display = 'none';
  showLoginModal();
  renderAll();
}

function setupAuthListener() {
  if (!window.db || !window.db.supabase?.auth) return;
  window.db.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      localStorage.setItem('mototrack_user', JSON.stringify({ id: currentUser.id, email: currentUser.email }));
      if ($modal.open) $modal.close();
      loadData().then(() => { renderAll(); $addBtn.style.display = 'flex'; }).catch(console.warn);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      localCache = { fuel: [], maint: [] };
      localStorage.removeItem('mototrack_user');
      renderAll();
      showLoginModal();
      $addBtn.style.display = 'none';
    }
  });
}

// ==================== CARGA DE DATOS + CÁLCULO ====================
async function loadData() {
  if (!window.db) return;
  try {
    let [fuel, maint] = await Promise.all([
      window.db.fetchRecords('fuel'),
      window.db.fetchRecords('maintenance')
    ]);

    // ✅ Calcular consumos automáticamente al cargar
    localCache.fuel = calculateConsumption(fuel, 'fuel');
    localCache.maint = calculateConsumption(maint, 'maint');
    renderAll();
  } catch (e) { console.warn('Error cargando:', e); renderAll(); }
}

// ✅ Función que calcula consumo/intervalo y reemplaza 'PENDING'
function calculateConsumption(records, type) {
  if (!records || records.length === 0) return [];
  const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
  sorted.forEach((rec, i) => {
    const prev = sorted[i - 1];
    const odom = parseFloat(rec.odometer) || 0;
    const prevOdom = prev ? parseFloat(prev.odometer) || 0 : 0;

    if (type === 'fuel') {
      const liters = parseFloat(rec.liters) || 0;
      rec.consumption = prev && liters > 0 ? ((odom - prevOdom) / liters).toFixed(2) : 'PRIMER REGISTRO';
    } else {
      rec.consumption = prev ? (odom - prevOdom).toFixed(2) : 'PRIMER REGISTRO';
    }
  });
  return records;
}

// ==================== EVENTOS ====================
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

  $addBtn.addEventListener('click', () => { if (currentUser) openModal(); else showLoginModal(); });
  document.getElementById('cancel-btn').addEventListener('click', () => { $modal.close(); editingId = null; $form.reset(); });
  $modal.addEventListener('close', () => { editingId = null; $form.reset(); });
  $form.addEventListener('submit', saveRecord);
  
  $list.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.classList.contains('edit')) { if (currentUser) openModal(id); else showLoginModal(); }
    if (e.target.classList.contains('delete')) { if (currentUser) deleteRecord(id); else showLoginModal(); }
  });

  $themeBtn.addEventListener('click', toggleTheme);
}

// ==================== RENDERIZADO ====================
function getRecords() {
  return (localCache[currentTab] || []).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderAll() {
  const records = getRecords();
  renderSummary(records);
  renderList(records);
  renderPagination(records.length);
}

function renderSummary(records) {
  let totalMoney = 0, avgVal = 0;
  const valid = records.filter(r => r.consumption !== 'PRIMER REGISTRO' && !isNaN(parseFloat(r.consumption)));
  if (valid.length > 0) avgVal = valid.reduce((s, r) => s + parseFloat(r.consumption), 0) / valid.length;
  records.forEach(r => totalMoney += parseFloat(r.money || r.price || 0) || 0);

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
    const priceL = rec.price_per_liter ?? rec.pricePerL ?? 0;
    const oilType = rec.oil_type ?? rec.oilType ?? 'N/A';
    const dinero = currentTab === 'fuel' 
      ? (parseFloat(rec.money) || (parseFloat(rec.liters) * parseFloat(priceL))).toFixed(2)
      : parseFloat(rec.price).toFixed(2);

    const fields = currentTab === 'fuel' 
      ? `<div class="record-row"><span class="label"><span class="icon">📅</span>Fecha:</span><span class="value">${formatDate(rec.date)}</span></div>
         <div class="record-row"><span class="label"><span class="icon">🛣️</span>Odómetro:</span><span class="value">${rec.odometer} km</span></div>
         <div class="record-row"><span class="label"><span class="icon">⛽</span>Litros:</span><span class="value">${rec.liters} L</span></div>
         <div class="record-row"><span class="label"><span class="icon">💲</span>Precio/L:</span><span class="value">$${priceL}</span></div>
         <div class="record-row money-row"><span class="label"><span class="icon">💰</span>Dinero gastado:</span><span class="value">$${dinero}</span></div>
         <div class="record-row"><span class="label"><span class="icon">🏁</span>Consumo:</span><span class="value">${rec.consumption} KM/L</span></div>`
      : `<div class="record-row"><span class="label"><span class="icon">📅</span>Fecha:</span><span class="value">${formatDate(rec.date)}</span></div>
         <div class="record-row"><span class="label"><span class="icon">🛣️</span>Odómetro:</span><span class="value">${rec.odometer} km</span></div>
         <div class="record-row"><span class="label"><span class="icon">🛢️</span>Aceite:</span><span class="value">${rec.brand} (${oilType} - ${rec.viscosity})</span></div>
         <div class="record-row"><span class="label"><span class="icon">💲</span>Precio:</span><span class="value">$${rec.price}</span></div>
         <div class="record-row"><span class="label"><span class="icon">🔧</span>Intervalo:</span><span class="value">${rec.consumption} KM</span></div>`;

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

// ==================== MODAL DE LOGIN ====================
function showLoginModal() {
  document.getElementById('modal-title').textContent = 'Iniciar Sesión';
  $fields.innerHTML = `
    <div style="margin-bottom:1rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Email</label><input type="email" id="auth-email" placeholder="tu@email.com" required style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div>
    <div style="margin-bottom:1rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Contraseña (mín. 6)</label><input type="password" id="auth-pass" placeholder="••••••••" minlength="6" required style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div>
    <div style="display:flex;gap:0.5rem;">
      <button type="button" id="auth-login" style="flex:1;padding:0.6rem;background:#dbeafe;color:#1d4ed8;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Entrar</button>
      <button type="button" id="auth-signup" style="flex:1;padding:0.6rem;background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Registrarse</button>
    </div>
    <p id="auth-error" style="color:#ef4444;font-size:0.85rem;margin-top:0.5rem;display:none;"></p>
    <p id="auth-loading" style="color:var(--text-sec);font-size:0.85rem;margin-top:0.5rem;display:none;">Procesando...</p>
  `;
  $modal.showModal();
  
  const $err = document.getElementById('auth-error'), $load = document.getElementById('auth-loading');
  const $logBtn = document.getElementById('auth-login'), $regBtn = document.getElementById('auth-signup');
  const reset = () => { $load.style.display='none'; $logBtn.disabled=$regBtn.disabled=false; $regBtn.textContent='Registrarse'; };

  $logBtn.onclick = async () => {
    const e = document.getElementById('auth-email').value.trim(), p = document.getElementById('auth-pass').value;
    if (!e || !p) { $err.textContent='Ingresa email y contraseña'; $err.style.display='block'; return; }
    $err.style.display='none'; $load.style.display='block'; $logBtn.disabled=$regBtn.disabled=true;
    try {
      const res = await window.db.signIn(e, p);
      if (res?.data?.user) {
        currentUser = res.data.user;
        localStorage.setItem('mototrack_user', JSON.stringify({id:currentUser.id, email:currentUser.email}));
        $modal.close(); loadData().then(()=>{renderAll();$addBtn.style.display='flex';});
      } else { reset(); $err.textContent = res?.error?.message || 'Error inesperado'; $err.style.display='block'; }
    } catch(err) { reset(); $err.textContent = err.message; $err.style.display='block'; }
  };

  $regBtn.onclick = async () => {
    const e = document.getElementById('auth-email').value.trim(), p = document.getElementById('auth-pass').value;
    if (!e || !p) { $err.textContent='Ingresa email y contraseña'; $err.style.display='block'; return; }
    if (p.length < 6) { $err.textContent='Mínimo 6 caracteres'; $err.style.display='block'; return; }
    $err.style.display='none'; $load.style.display='block'; $logBtn.disabled=$regBtn.disabled=true; $regBtn.textContent='Creando...';
    try {
      const res = await window.db.signUp(e, p);
      if (res?.data?.user) {
        currentUser = res.data.user;
        localStorage.setItem('mototrack_user', JSON.stringify({id:currentUser.id, email:currentUser.email}));
        $modal.close(); loadData().then(()=>{renderAll();$addBtn.style.display='flex';});
      } else { reset(); $err.textContent = res?.error?.message || 'Error inesperado'; $err.style.display='block'; }
    } catch(err) { reset(); $err.textContent = err.message; $err.style.display='block'; }
  };
}

// ==================== MODAL DE REGISTRO ====================
function openModal(id = null) {
  if (!currentUser) { showLoginModal(); return; }
  editingId = id;
  const rec = id ? localCache[currentTab].find(r => r.id === id) : null;
  document.getElementById('modal-title').textContent = id ? 'Editar Registro' : 'Nuevo Registro';

  const now = getLocalDateTime();
  $fields.innerHTML = '';
  const safePriceL = rec?.price_per_liter ?? rec?.pricePerL ?? '';
  const safeOilType = rec?.oil_type ?? rec?.oilType ?? 'Sintético';

  const fieldsConfig = currentTab === 'fuel' 
    ? [
        { id: 'date', label: 'Fecha y hora', type: 'datetime-local', val: rec?.date || now },
        { id: 'odometer', label: 'Odómetro (km)', type: 'number', val: rec?.odometer || '' },
        { id: 'liters', label: 'Litros', type: 'number', step: '0.01', val: rec?.liters || '' },
        { id: 'pricePerL', label: 'Precio por litro ($)', type: 'number', step: '0.01', val: safePriceL }
      ]
    : [
        { id: 'date', label: 'Fecha y hora', type: 'datetime-local', val: rec?.date || now },
        { id: 'odometer', label: 'Odómetro (km)', type: 'number', val: rec?.odometer || '' },
        { id: 'brand', label: 'Marca del aceite', type: 'text', val: rec?.brand || '' },
        { id: 'type', label: 'Tipo', type: 'select', opts: ['Sintético', 'Natural'], val: safeOilType },
        { id: 'viscosity', label: 'Viscosidad (ej: 10W40)', type: 'text', val: rec?.viscosity || '' },
        { id: 'price', label: 'Precio del aceite ($)', type: 'number', step: '0.01', val: rec?.price || '' }
      ];

  fieldsConfig.forEach(f => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '0.75rem';
    wrap.innerHTML = `<label style="display:block; margin-bottom:0.3rem; font-weight:500;">${f.label}</label>`;
    if (f.type === 'select') {
      const sel = document.createElement('select');
      sel.id = f.id; sel.required = true; sel.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);';
      f.opts.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; if(o===f.val) opt.selected=true; sel.appendChild(opt); });
      wrap.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = f.type; inp.id = f.id; inp.step = f.step || 'any'; inp.value = f.val; inp.required = true;
      inp.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);';
      wrap.appendChild(inp);
    }
    $fields.appendChild(wrap);
  });

  $modal.showModal();
}

// ==================== GUARDAR / ELIMINAR ====================
async function saveRecord(e) {
  e.preventDefault();
  if (!currentUser) { showLoginModal(); return; }
  
  const data = {};
  $fields.querySelectorAll('input, select').forEach(el => data[el.id] = el.value);
  
  if (currentTab === 'fuel') {
    data.id = editingId || 'new';
    data.money = (parseFloat(data.liters) * parseFloat(data.pricePerL)).toFixed(2);
    data.consumption = null; // Se calcula al cargar
  } else {
    data.id = editingId || 'new';
    data.money = parseFloat(data.price).toFixed(2);
    data.consumption = null;
  }

  try {
    await window.db.saveRecord(currentTab === 'fuel' ? 'fuel' : 'maintenance', data);
    await loadData();
    $modal.close();
  } catch (err) { alert('Error guardando: ' + err.message); }
}

async function deleteRecord(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  if (!currentUser) { showLoginModal(); return; }
  try {
    await window.db.deleteRecord(currentTab === 'fuel' ? 'fuel' : 'maintenance', id);
    await loadData();
  } catch (err) { alert('Error eliminando: ' + err.message); }
}

// ==================== UTILIDADES ====================
function getLocalDateTime() {
  const now = new Date();
  return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
}

function formatDate(iso) { 
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CU', { timeZone: 'America/Havana' });
}

function loadTheme() {
  const saved = localStorage.getItem('mototrack_theme');
  document.body.className = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function toggleTheme() {
  document.body.className = document.body.className === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mototrack_theme', document.body.className);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}