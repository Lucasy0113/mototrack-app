// 🔐 CONFIGURACIÓN SUPABASE - Versión Final Corregida
(function() {
  'use strict';
  const SUPABASE_URL = 'https://dgfdtwmvyalofmszbnab.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_AzdP6R-UiBe4oecm1emSjQ_AtPRXSkV';
  if (window._dbLoaded) return;
  window._dbLoaded = true;

  let supabaseClient = null;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try { supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); console.log('✅ Supabase listo'); }
    catch (e) { console.warn('⚠️ Error Supabase:', e.message); }
  }

  let offlineQueue = JSON.parse(localStorage.getItem('mototrack_offline') || '[]');
  let isOnline = navigator.onLine;
  window.addEventListener('online', () => { isOnline = true; syncQueue(); });
  window.addEventListener('offline', () => { isOnline = false; });

  async function getUser() {
    if (!supabaseClient) return null;
    try { const { data } = await supabaseClient.auth.getUser(); return data?.user || null; }
    catch { return null; }
  }

  async function fetchRecords(recordType) {
    if (!supabaseClient) return [];
    const user = await getUser();
    if (!user) return [];
    try {
      const { data, error } = await supabaseClient.from('moto_records').select('*').eq('user_id', user.id).eq('record_type', recordType).order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch { return []; }
  }

  // ✅ Mapeo Seguro: Frontend (camelCase/type) → BD (snake_case/oil_type)
  function mapToDatabase(record, recType) {
    const m = { ...record };
    if (recType === 'fuel' && m.pricePerL !== undefined) { 
      m.price_per_liter = parseFloat(m.pricePerL); delete m.pricePerL; 
    }
    if (recType === 'maintenance') {
      if (m.type !== undefined) { m.oil_type = m.type; delete m.type; }
      if (m.oilType !== undefined) { m.oil_type = m.oilType; delete m.oilType; }
    }
    if (m.odometer) m.odometer = parseFloat(m.odometer);
    if (m.money) m.money = parseFloat(m.money);
    if (m.liters) m.liters = parseFloat(m.liters);
    if (m.price) m.price = parseFloat(m.price);
    return m;
  }

  // ✅ Mapeo Seguro: BD → Frontend
  function mapToFrontend(rec) {
    if (!rec) return null;
    return { ...rec, pricePerL: rec.price_per_liter, oilType: rec.oil_type };
  }

  async function saveRecord(recType, rec) {
    const user = await getUser();
    if (!user) throw new Error('No autenticado');
    const payload = mapToDatabase({ user_id: user.id, record_type: recType, ...rec }, recType);

    if (isOnline && supabaseClient) {
      if (rec.id && rec.id !== 'new') {
        const { error } = await supabaseClient.from('moto_records').update(payload).eq('id', rec.id).eq('user_id', user.id);
        if (error) throw error;
      } else {
        payload.id = crypto.randomUUID();
        const { error } = await supabaseClient.from('moto_records').insert([payload]);
        if (error) throw error;
      }
    } else {
      offlineQueue.push({ type: 'save', record_type: recType, payload: rec });
      localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
    }
  }

  async function deleteRecord(recType, id) {
    const user = await getUser();
    if (!user) throw new Error('No autenticado');
    if (isOnline && supabaseClient) {
      const { error } = await supabaseClient.from('moto_records').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
    } else {
      offlineQueue.push({ type: 'delete', record_type: recType, id });
      localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
    }
  }

  async function syncQueue() {
    if (!supabaseClient || offlineQueue.length === 0) return;
    const queue = [...offlineQueue]; offlineQueue = [];
    for (const item of queue) {
      try {
        if (item.type === 'save') await saveRecord(item.record_type, item.payload);
        else if (item.type === 'delete') await deleteRecord(item.record_type, item.id);
      } catch (e) { console.warn('Error sync:', e.message); offlineQueue.push(item); }
    }
    localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
  }

  window.db = {
    supabase: supabaseClient,
    signUp: async (e, p) => supabaseClient ? await supabaseClient.auth.signUp({ email: e, password: p }) : null,
    signIn: async (e, p) => supabaseClient ? await supabaseClient.auth.signInWithPassword({ email: e, password: p }) : null,
    signOut: async () => { if (supabaseClient) await supabaseClient.auth.signOut(); localStorage.removeItem('mototrack_user'); },
    getCurrentUser: getUser,
    fetchRecords: async (t) => (await fetchRecords(t)).map(r => mapToFrontend(r)),
    saveRecord, deleteRecord, syncOfflineQueue: syncQueue, isOnline: () => isOnline
  };
  console.log('✅ db.js cargado con mapeo corregido');
})();