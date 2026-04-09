// ESTADO GLOBAL
let currentTab = 'fuel';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let editingId = null;
let currentUser = null;
let localCache = { fuel: [], maint: [] }; // Fallback offline

// ELEMENTOS DOM
const $summary = document.getElementById('summary');
const $list = document.getElementById('list-container');
const $pagination = document.getElementById('pagination');
const $modal = document.getElementById('modal');
const $form = document.getElementById('record-form');
const $fields = document.getElementById('form-fields');
const $themeBtn = document.getElementById('theme-toggle');
const $addBtn = document.getElementById('add-btn');

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  setupAuthListener();
  await checkAuth();
  setupEvents();
});

async function checkAuth() {
  // ✅ Si db no está listo, mostrar login inmediatamente
  if (!window.db) {
    console.warn('db.js no cargó, mostrando login');
    $addBtn.style.display = 'none';
    showLoginModal();
    renderAll();
    return;
  }
  currentUser = await window.db.getCurrentUser();
  if (currentUser) {
    // Usuario logueado: cargar desde Supabase
    $addBtn.style.display = 'flex';
    await loadData();
  } else {
    // No logueado: mostrar login
    $addBtn.style.display = 'none';
    showLoginModal();
  }
}

function setupAuthListener() {
  if (!window.db || !window.db.supabase) {
    console.warn('Supabase no disponible');
    return;
  }
  
  console.log('🔐 Registrando listener de auth...');
  
  window.db.supabase.auth.onAuthStateChange((event, session) => {
    console.log('🔄 Auth event:', event, session?.user?.id);
    
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      localStorage.setItem('mototrack_user', JSON.stringify({ 
        id: currentUser.id, 
        email: currentUser.email 
      }));
      console.log('✅ Usuario autenticado:', currentUser.email);
      $modal.close();
      loadData().then(() => renderAll()).catch(console.warn);
      $addBtn.style.display = 'flex';
    } 
    else if (event === 'SIGNED_OUT') {
      console.log('🚪 Usuario cerrado');
      currentUser = null;
      localCache = { fuel: [], maint: [] };
      renderAll();
      showLoginModal();
      $addBtn.style.display = 'none';
    }
  });
}

async function loadData() {
  try {
    const [fuel, maint] = await Promise.all([
      window.db.fetchRecords('fuel'),
      window.db.fetchRecords('maintenance') // Nota: 'maintenance' para coincidir con la tabla
    ]);
    localCache = { fuel, maint: maint };
    // Migrar datos locales si es primera vez
    await window.db.migrateLocalStorage('fuel');
    await window.db.migrateLocalStorage('maintenance');
    renderAll();
  } catch (e) {
    console.warn('Error cargando datos, usando caché local:', e);
    renderAll();
  }
}

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

  $addBtn.addEventListener('click', () => openModal());
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
  return (localCache[currentTab] || []).sort((a, b) => new Date(b.date) - new Date(a.date));
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
  const validRecords = records.filter(r => r.consumption !== 'PRIMER REGISTRO' && !isNaN(parseFloat(r.consumption)));
  if (validRecords.length > 0) {
    avgVal = validRecords.reduce((sum, r) => sum + parseFloat(r.consumption), 0) / validRecords.length;
  }
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
      ? (parseFloat(rec.money || (parseFloat(rec.liters || 0) * parseFloat(rec.price_per_liter || 0)))).toFixed(2)
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
           <span class="value">$${rec.price_per_liter}</span>
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
           <span class="value">${rec.brand} (${rec.oil_type} - ${rec.viscosity})</span>
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

function showLoginModal() {
  document.getElementById('modal-title').textContent = 'Iniciar Sesión';
  $fields.innerHTML = `
    <div style="margin-bottom:1rem;">
      <label>Email</label>
      <input type="email" id="auth-email" placeholder="tu@email.com" required 
             style="width:100%;padding:0.5rem;margin-top:0.3rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
    </div>
    <div style="margin-bottom:1rem;">
      <label>Contraseña (mín. 6 caracteres)</label>
      <input type="password" id="auth-pass" placeholder="••••••••" minlength="6" required 
             style="width:100%;padding:0.5rem;margin-top:0.3rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
    </div>
    <div style="display:flex;gap:0.5rem;">
      <button type="button" id="auth-login" style="flex:1;padding:0.6rem;background:#dbeafe;color:#1d4ed8;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Entrar</button>
      <button type="button" id="auth-signup" style="flex:1;padding:0.6rem;background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Registrarse</button>
    </div>
    <p id="auth-error" style="color:#ef4444;font-size:0.85rem;margin-top:0.5rem;display:none;"></p>
    <p id="auth-loading" style="color:var(--text-sec);font-size:0.85rem;margin-top:0.5rem;display:none;">Procesando...</p>
  `;
  $modal.showModal();
  
  const $error = document.getElementById('auth-error');
  const $loading = document.getElementById('auth-loading');
  const $loginBtn = document.getElementById('auth-login');
  const $signupBtn = document.getElementById('auth-signup');
  
  // ✅ Función helper para manejar respuestas de Supabase
  function handleSupabaseResponse(result, action) {
    if (!result) {
      $error.textContent = 'Error de conexión. Verifica tu internet.';
      $error.style.display = 'block';
      return false;
    }
    const { data, error } = result;
    if (error) {
      $error.textContent = `${action}: ${error.message}`;
      $error.style.display = 'block';
      console.warn(`${action} error:`, error);
      return false;
    }
    return true;
  }
  
  // ✅ LOGIN
  $loginBtn.onclick = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    
    if (!email || !pass) {
      $error.textContent = 'Ingresa email y contraseña';
      $error.style.display = 'block';
      return;
    }
    
    $error.style.display = 'none';
    $loading.style.display = 'block';
    $loginBtn.disabled = true;
    $signupBtn.disabled = true;
    
    try {
      const result = await window.db.signIn(email, pass);
      if (handleSupabaseResponse(result, 'Login')) {
        // El listener onAuthStateChange se encargará del resto
        console.log('Login exitoso');
      } else {
        $loading.style.display = 'none';
        $loginBtn.disabled = false;
        $signupBtn.disabled = false;
      }
    } catch (e) {
      $error.textContent = 'Error inesperado: ' + e.message;
      $error.style.display = 'block';
      $loading.style.display = 'none';
      $loginBtn.disabled = false;
      $signupBtn.disabled = false;
    }
  };
  
  // ✅ REGISTRO (CORREGIDO)
  $signupBtn.onclick = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    
    if (!email || !pass) {
      $error.textContent = 'Ingresa email y contraseña';
      $error.style.display = 'block';
      return;
    }
    if (pass.length < 6) {
      $error.textContent = 'La contraseña debe tener al menos 6 caracteres';
      $error.style.display = 'block';
      return;
    }
    
    $error.style.display = 'none';
    $loading.style.display = 'block';
    $loginBtn.disabled = true;
    $signupBtn.disabled = true;
    $signupBtn.textContent = 'Creando...';
    
    try {
      console.log('Intentando registrar:', email);
      const result = await window.db.signUp(email, pass);
      console.log('Respuesta de signUp:', result);
      
      if (handleSupabaseResponse(result, 'Registro')) {
        // ✅ Éxito: Supabase devuelve el usuario en result.data.user
        console.log('Registro exitoso, usuario:', result.data?.user?.id);
        // No cerramos el modal manualmente: el listener onAuthStateChange lo hará
      } else {
        // ❌ Error: restaurar botones
        $loading.style.display = 'none';
        $signupBtn.textContent = 'Registrarse';
        $loginBtn.disabled = false;
        $signupBtn.disabled = false;
      }
    } catch (e) {
      console.error('Excepción en registro:', e);
      $error.textContent = 'Error: ' + e.message;
      $error.style.display = 'block';
      $loading.style.display = 'none';
      $signupBtn.textContent = 'Registrarse';
      $loginBtn.disabled = false;
      $signupBtn.disabled = false;
    }
  };
}

function openModal(id = null) {
  if (!currentUser) { showLoginModal(); return; }
  
  editingId = id;
  const rec = id ? localCache[currentTab].find(r => r.id === id) : null;
  document.getElementById('modal-title').textContent = id ? 'Editar Registro' : 'Nuevo Registro';

  const now = getLocalDateTime();
  $fields.innerHTML = '';
  
  const fieldsConfig = currentTab === 'fuel' 
    ? [
        { id: 'date', label: 'Fecha y hora', type: 'datetime-local', val: rec?.date || now },
        { id: 'odometer', label: 'Odómetro (km)', type: 'number', val: rec?.odometer || '' },
        { id: 'liters', label: 'Litros', type: 'number', step: '0.01', val: rec?.liters || '' },
        { id: 'pricePerL', label: 'Precio por litro ($)', type: 'number', step: '0.01', val: rec?.price_per_liter || '' }
      ]
    : [
        { id: 'date', label: 'Fecha y hora', type: 'datetime-local', val: rec?.date || now },
        { id: 'odometer', label: 'Odómetro (km)', type: 'number', val: rec?.odometer || '' },
        { id: 'brand', label: 'Marca del aceite', type: 'text', val: rec?.brand || '' },
        { id: 'type', label: 'Tipo', type: 'select', opts: ['Sintético', 'Natural'], val: rec?.oil_type || 'Sintético' },
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

async function saveRecord(e) {
  e.preventDefault();
  if (!currentUser) { showLoginModal(); return; }
  
  const data = {};
  $fields.querySelectorAll('input, select').forEach(el => data[el.id] = el.value);
  
  if (currentTab === 'fuel') {
    data.id = editingId || 'new';
    data.money = (parseFloat(data.liters) * parseFloat(data.pricePerL)).toFixed(2);
    data.consumption = 'PENDING';
  } else {
    data.id = editingId || 'new';
    data.money = parseFloat(data.price).toFixed(2);
    data.consumption = 'PENDING';
  }

  try {
    await window.db.saveRecord(currentTab === 'fuel' ? 'fuel' : 'maintenance', data);
    await loadData(); // Recargar desde la nube
    $modal.close();
  } catch (err) {
    alert('Error guardando: ' + err.message);
  }
}

async function deleteRecord(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  if (!currentUser) { showLoginModal(); return; }
  
  try {
    await window.db.deleteRecord(currentTab === 'fuel' ? 'fuel' : 'maintenance', id);
    await loadData();
  } catch (err) {
    alert('Error eliminando: ' + err.message);
  }
}

function recalculateAll() {
  // Ya se hace en el backend al guardar, pero mantenemos para fallback offline
  const sorted = localCache[currentTab].sort((a, b) => new Date(a.date) - new Date(b.date));
  sorted.forEach((rec, i) => {
    const prev = sorted[i - 1];
    const odom = parseFloat(rec.odometer);
    if (currentTab === 'fuel') {
      rec.consumption = prev ? ((odom - parseFloat(prev.odometer)) / parseFloat(rec.liters || 1)).toFixed(2) : 'PRIMER REGISTRO';
    } else {
      rec.consumption = prev ? (odom - parseFloat(prev.odometer)).toFixed(2) : 'PRIMER REGISTRO';
    }
  });
}

function getLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - (offset * 60000)).toISOString().slice(0, 16);
}

function formatDate(iso) { 
  if (!iso) return '';
  const d = new Date(iso);
  // Forzar zona horaria de Cuba (UTC-5 / UTC-4)
  return d.toLocaleString('es-CU', { timeZone: 'America/Havana' });
}

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

// SERVICE WORKER
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}