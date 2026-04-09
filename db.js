// 🔐 CONFIGURACIÓN SUPABASE - Versión minimalista
(function() {
  const SUPABASE_URL = 'https://dgfdtwmvyalofmszbnab.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_AzdP6R-UiBe4oecm1emSjQ_AtPRXSkV';
  
  // Evitar redeclaración
  if (window._dbLoaded) return;
  window._dbLoaded = true;
  
  let supabaseClient = null;
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

  async function fetchRecords(type) {
    if (!supabaseClient) return [];
    const user = await getUser();
    if (!user) return [];
    try {
      const { data } = await supabaseClient.from('moto_records').select('*').eq('user_id', user.id).eq('record_type', type).order('date', { ascending: false });
      return data || [];
    } catch { return []; }
  }

  async function saveRecord(type, rec) {
    const user = await getUser();
    if (!user) throw new Error('No auth');
    const payload = { user_id: user.id, record_type: type, ...rec, odometer: +rec.odometer, money: +rec.money };
    if (isOnline && supabaseClient) {
      if (rec.id && rec.id !== 'new') {
        await supabaseClient.from('moto_records').update(payload).eq('id', rec.id).eq('user_id', user.id);
      } else {
        payload.id = crypto.randomUUID();
        await supabaseClient.from('moto_records').insert([payload]);
      }
    } else {
      offlineQueue.push({ type: 'save', record_type: type, payload });
      localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
    }
  }

  async function deleteRecord(type, id) {
    const user = await getUser();
    if (!user) throw new Error('No auth');
    if (isOnline && supabaseClient) {
      await supabaseClient.from('moto_records').delete().eq('id', id).eq('user_id', user.id);
    } else {
      offlineQueue.push({ type: 'delete', record_type: type, id });
      localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
    }
  }

  async function syncQueue() {
    if (!supabaseClient || offlineQueue.length === 0) return;
    const q = [...offlineQueue]; offlineQueue = [];
    for (const item of q) {
      try {
        if (item.type === 'save') await saveRecord(item.record_type, item.payload);
        else if (item.type === 'delete') await deleteRecord(item.record_type, item.id);
      } catch { offlineQueue.push(item); }
    }
    localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
  }

  // Exportar API global
  window.db = {
    signUp: (e,p) => supabaseClient?.auth.signUp({email:e,password:p}),
    signIn: (e,p) => supabaseClient?.auth.signInWithPassword({email:e,password:p}),
    signOut: () => supabaseClient?.auth.signOut(),
    getCurrentUser: getUser,
    fetchRecords, saveRecord, deleteRecord, syncOfflineQueue: syncQueue
  };
})();