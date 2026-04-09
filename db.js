// 🔐 CONFIGURACIÓN SUPABASE
const SUPABASE_URL = 'https://dgfdtwmvyalofmszbnab.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AzdP6R-UiBe4oecm1emSjQ_AtPRXSkV';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🌐 ESTADO DE CONEXIÓN
let isOnline = navigator.onLine;
let offlineQueue = [];

window.addEventListener('online', () => { isOnline = true; syncOfflineQueue(); });
window.addEventListener('offline', () => { isOnline = false; });

// 👤 AUTENTICACIÓN
async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem('mototrack_user');
}

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// 💾 OPERACIONES DE DATOS
async function fetchRecords(type) {
  const user = await getCurrentUser();
  if (!user) return [];
  
  const { data, error } = await supabase
    .from('moto_records')
    .select('*')
    .eq('user_id', user.id)
    .eq('record_type', type)
    .order('date', { ascending: false });
    
  if (error) throw error;
  return data || [];
}

async function saveRecord(type, record) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autenticado');
  
  const payload = {
    user_id: user.id,
    record_type: type,
    ...record,
    // Normalizar números
    odometer: parseFloat(record.odometer),
    liters: record.liters ? parseFloat(record.liters) : null,
    price_per_liter: record.pricePerL ? parseFloat(record.pricePerL) : null,
    money: parseFloat(record.money),
    price: record.price ? parseFloat(record.price) : null
  };

  if (isOnline) {
    if (record.id && record.id !== 'new') {
      // Actualizar existente
      const { error } = await supabase
        .from('moto_records')
        .update(payload)
        .eq('id', record.id)
        .eq('user_id', user.id);
      if (error) throw error;
    } else {
      // Insertar nuevo
      payload.id = crypto.randomUUID();
      const { error } = await supabase.from('moto_records').insert([payload]);
      if (error) throw error;
    }
  } else {
    // Modo offline: encolar para sincronizar después
    offlineQueue.push({ type: 'save', record_type: type, payload });
    localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
  }
}

async function deleteRecord(type, id) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autenticado');
  
  if (isOnline) {
    const { error } = await supabase
      .from('moto_records')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  } else {
    offlineQueue.push({ type: 'delete', record_type: type, id });
    localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
  }
}

async function syncOfflineQueue() {
  if (offlineQueue.length === 0) return;
  const queue = [...offlineQueue];
  offlineQueue = [];
  
  for (const item of queue) {
    try {
      if (item.type === 'save') {
        await saveRecord(item.record_type, item.payload);
      } else if (item.type === 'delete') {
        await deleteRecord(item.record_type, item.id);
      }
    } catch (e) {
      console.warn('Error sincronizando:', e);
      offlineQueue.push(item); // Reintentar después
    }
  }
  localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
}

// 🔄 MIGRACIÓN: Importar datos locales al primer login
async function migrateLocalStorage(type) {
  const local = JSON.parse(localStorage.getItem('mototrack_db')) || { fuel: [], maint: [] };
  const records = local[type] || [];
  const user = await getCurrentUser();
  if (!user || records.length === 0) return;
  
  // Verificar si ya se migró
  const { count } = await supabase
    .from('moto_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('record_type', type);
    
  if (count > 0) return; // Ya migrado
  
  // Migrar registros
  for (const rec of records) {
    await saveRecord(type, { ...rec, id: 'new' });
  }
  // Limpiar local después de migrar (opcional)
  // localStorage.removeItem('mototrack_db');
}

// 🎯 EXPORTAR para usar en app.js
window.db = {
  supabase, signUp, signIn, signOut, getCurrentUser,
  fetchRecords, saveRecord, deleteRecord, syncOfflineQueue, migrateLocalStorage
};