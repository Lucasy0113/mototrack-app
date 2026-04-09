// 🏍️ MotoTrack - App.js (Versión con Supabase + Auth + Offline)
// Estado global
let currentTab = 'fuel';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let editingId = null;
let currentUser = null;
let localCache = { fuel: [], maint: [] };

// Elementos DOM
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
  console.log('🚀 Iniciando MotoTrack...');
  loadTheme();
  
  // Esperar un poco a que db.js se cargue
  await waitForDb();
  
  setupAuthListener();
  await checkAuth();
  setupEvents();
});

// Esperar a que window.db esté disponible
function waitForDb(timeout = 5000) {
  return new Promise((resolve) => {
    if (window.db) {
      resolve();
      return;
    }
    const start = Date.now();
    const check = () => {
      if (window.db || Date.now() - start > timeout) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

// ==================== AUTENTICACIÓN ====================
async function checkAuth() {
  console.log('🔐 Verificando auth...');
  
  // Verificar si hay usuario guardado en localStorage
  const saved = localStorage.getItem('mototrack_user');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      // Verificar con Supabase que la sesión sigue válida
      if (window.db && typeof window.db.getCurrentUser === 'function') {
        const currentUserCheck = await Promise.race([
          window.db.getCurrentUser(),
          new Promise(resolve => setTimeout(() => resolve(null), 3000))
        ]);
        if (currentUserCheck) {
          currentUser = currentUserCheck;
          console.log('✅ Sesión válida:', currentUser.email);
          $addBtn.style.display = 'flex';
          await loadData();
          return;
        }
      }
    } catch (e) {
      console.warn('Error verificando sesión:', e.message);
    }
  }
  
  // No hay sesión válida: mostrar login
  console.log('📝 Mostrando login');
  $addBtn.style.display = 'none';
  showLoginModal();
  renderAll();
}

function setupAuthListener() {
  if (!window.db) {
    console.warn('⚠️ db.js no cargó');
    return;
  }
  
  const auth = window.db.supabase?.auth;
  if (!auth) {
    console.warn('⚠️ Auth no disponible');
    return;
  }
  
  console.log('🔐 Registrando listener de auth...');
  
  auth.onAuthStateChange((event, session) => {
    console.log('🔄 Auth event:', event, session?.user?.id);
    
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      localStorage.setItem('mototrack_user', JSON.stringify({ 
        id: currentUser.id, 
        email: currentUser.email 
      }));
      console.log('✅ Usuario autenticado:', currentUser.email);
      
      // Cerrar modal si está abierto
      if ($modal.open) $modal.close();
      
      // Cargar datos y mostrar UI
      loadData().then(() => {
        renderAll();
        $addBtn.style.display = 'flex';
      }).catch(err => {
        console.warn('Error cargando datos:', err);
        renderAll();
        $addBtn.style.display = 'flex';
      });
    } 
    else if (event === 'SIGNED_OUT') {
      console.log('🚪 Usuario cerrado');
      currentUser = null;
      localCache = { fuel: [], maint: [] };
      localStorage.removeItem('mototrack_user');
      renderAll();
      showLoginModal();
      $addBtn.style.display = 'none';
    }
  });
}

// ==================== CARGA DE DATOS ====================
async function loadData() {
  if (!window.db) {
    console.warn('⚠️ db no disponible, usando caché local');
    return;
  }
  
  try {
    console.log('📥 Cargando registros...');
    const [fuel, maint] = await Promise.all([
      window.db.fetchRecords('fuel'),
      window.db.fetchRecords('maintenance')
    ]);
    localCache = { fuel, maint };
    console.log('✅ Datos cargados:', { fuel: fuel.length, maint: maint.length });
    renderAll();
  } catch (e) {
    console.warn('⚠️ Error cargando datos, usando caché:', e.message);
    renderAll();
  }
}

// ==================== EVENTOS ====================
function setupEvents() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentTab = e.target.dataset.tab;
      currentPage = 1;
      renderAll();
    });
  });

  // Botón agregar
  $addBtn.addEventListener('click', () => {
    if (!currentUser) {
      showLoginModal();
      return;
    }
    openModal();
  });
  
  // Modal
  document.getElementById('cancel-btn').addEventListener('click', () => {
    $modal.close();
    editingId = null;
    $form.reset();
  });
  
  $modal.addEventListener('close', () => {
    editingId = null;
    $form.reset();
  });
  
  $form.addEventListener('submit', saveRecord);
  
  // Lista: editar/eliminar
  $list.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    
    if (e.target.classList.contains('edit')) {
      if (!currentUser) { showLoginModal(); return; }
      openModal(id);
    }
    if (e.target.classList.contains('delete')) {
      if (!currentUser) { showLoginModal(); return; }
      deleteRecord(id);
    }
  });

  // Tema
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
  let totalMoney = 0;
  let avgVal = 0;
  
  const validRecords = records.filter(r => 
    r.consumption !== 'PRIMER REGISTRO' && !isNaN(parseFloat(r.consumption))
  );
  
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
    btn.addEventListener('click', () => { 
      currentPage = i; 
      renderAll(); 
    });
    $pagination.appendChild(btn);
  }
}

// ==================== MODAL DE LOGIN ====================
function showLoginModal() {
  document.getElementById('modal-title').textContent = 'Iniciar Sesión';
  
  $fields.innerHTML = `
    <div style="margin-bottom:1rem;">
      <label style="display:block;font-weight:500;margin-bottom:0.3rem;">Email</label>
      <input type="email" id="auth-email" placeholder="tu@email.com" required 
             style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
    </div>
    <div style="margin-bottom:1rem;">
      <label style="display:block;font-weight:500;margin-bottom:0.3rem;">Contraseña (mín. 6 caracteres)</label>
      <input type="password" id="auth-pass" placeholder="••••••••" minlength="6" required 
             style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
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
  
  // Helper para manejar respuestas de Supabase
  function handleResponse(result, action) {
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
      
      if (handleResponse(result, 'Login')) {
        console.log('✅ Login exitoso');
        // Fallback manual si el listener no funciona
        if (result.data?.user) {
          currentUser = result.data.user;
          localStorage.setItem('mototrack_user', JSON.stringify({ 
            id: currentUser.id, 
            email: currentUser.email 
          }));
          $modal.close();
          loadData().then(() => {
            renderAll();
            $addBtn.style.display = 'flex';
          }).catch(console.warn);
        }
      } else {
        restoreButtons();
      }
    } catch (e) {
      $error.textContent = 'Error: ' + e.message;
      $error.style.display = 'block';
      restoreButtons();
    }
  };
  
  // ✅ REGISTRO
  $signupBtn.onclick = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    
    if (!email || !pass) {
      $error.textContent = 'Ingresa email y contraseña';
      $error.style.display = 'block';
      return;
    }
    if (pass.length < 6) {
      $error.textContent = 'Mínimo 6 caracteres';
      $error.style.display = 'block';
      return;
    }
    
    $error.style.display = 'none';
    $loading.style.display = 'block';
    $loginBtn.disabled = true;
    $signupBtn.disabled = true;
    $signupBtn.textContent = 'Creando...';
    
    try {
      console.log('📝 Registrando:', email);
      const result = await window.db.signUp(email, pass);
      console.log('Respuesta signUp:', result);
      
      if (handleResponse(result, 'Registro')) {
        console.log('✅ Registro exitoso');
        // Fallback manual si el listener no funciona
        if (result.data?.user) {
          currentUser = result.data.user;
          localStorage.setItem('mototrack_user', JSON.stringify({ 
            id: currentUser.id, 
            email: currentUser.email 
          }));
          $modal.close();
          loadData().then(() => {
            renderAll();
            $addBtn.style.display = 'flex';
          }).catch(console.warn);
        }
      } else {
        restoreButtons();
      }
    } catch (e) {
      console.error('Excepción registro:', e);
      $error.textContent = 'Error: ' + e.message;
      $error.style.display = 'block';
      restoreButtons();
    }
  };
  
  function restoreButtons() {
    $loading.style.display = 'none';
    $signupBtn.textContent = 'Registrarse';
    $loginBtn.disabled = false;
    $signupBtn.disabled = false;
  }
}

// ==================== MODAL DE REGISTRO/EDICIÓN ====================
function openModal(id = null) {
  if (!currentUser) { 
    showLoginModal(); 
    return; 
  }
  
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
      sel.id = f.id; 
      sel.required = true; 
      sel.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);';
      f.opts.forEach(o => { 
        const opt = document.createElement('option'); 
        opt.value = o; 
        opt.textContent = o; 
        if(o === f.val) opt.selected = true; 
        sel.appendChild(opt); 
      });
      wrapper.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = f.type; 
      inp.id = f.id; 
      inp.step = f.step || 'any'; 
      inp.value = f.val; 
      inp.required = true;
      inp.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);';
      wrapper.appendChild(inp);
    }
    $fields.appendChild(wrapper);
  });

  $modal.showModal();
}

// ==================== GUARDAR REGISTRO ====================
async function saveRecord(e) {
  e.preventDefault();
  
  if (!currentUser) { 
    showLoginModal(); 
    return; 
  }
  
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
    await window.db.saveRecord(
      currentTab === 'fuel' ? 'fuel' : 'maintenance', 
      data
    );
    await loadData();
    $modal.close();
  } catch (err) {
    alert('Error guardando: ' + err.message);
    console.error('Save error:', err);
  }
}

// ==================== ELIMINAR REGISTRO ====================
async function deleteRecord(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  if (!currentUser) { 
    showLoginModal(); 
    return; 
  }
  
  try {
    await window.db.deleteRecord(
      currentTab === 'fuel' ? 'fuel' : 'maintenance', 
      id
    );
    await loadData();
  } catch (err) {
    alert('Error eliminando: ' + err.message);
    console.error('Delete error:', err);
  }
}

// ==================== UTILIDADES ====================
function getLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - (offset * 60000)).toISOString().slice(0, 16);
}

function formatDate(iso) { 
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-CU', { timeZone: 'America/Havana' });
}

// ==================== TEMA ====================
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

// ==================== SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrado:', reg.scope))
      .catch(err => console.log('SW error:', err));
  });
}