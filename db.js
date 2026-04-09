// 🔐 CONFIGURACIÓN SUPABASE - Versión final estable
(function() {
  'use strict';
  
  const SUPABASE_URL = 'https://dgfdtwmvyalofmszbnab.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_AzdP6R-UiBe4oecm1emSjQ_AtPRXSkV';
  
  // Evitar carga múltiple
  if (window._dbLoaded) return;
  window._dbLoaded = true;
  
  let supabaseClient = null;
  
  // Inicializar cliente si Supabase está disponible
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✅ Supabase cliente inicializado');
    } catch (e) {
      console.warn('⚠️ Error inicializando Supabase:', e.message);
    }
  } else {
    console.warn('⚠️ Librería Supabase no cargada aún');
  }

  // Estado offline
  let offlineQueue = JSON.parse(localStorage.getItem('mototrack_offline') || '[]');
  let isOnline = navigator.onLine;
  
  window.addEventListener('online', () => { 
    isOnline = true; 
    console.log('🌐 Online - sincronizando...');
    syncQueue(); 
  });
  window.addEventListener('offline', () => { 
    isOnline = false; 
    console.log('✈️ Offline - guardando localmente');
  });

  // 👤 Obtener usuario actual
  async function getUser() {
    if (!supabaseClient) return null;
    try { 
      const { data } = await supabaseClient.auth.getUser(); 
      return data?.user || null; 
    } catch (e) { 
      console.warn('Error getUser:', e.message);
      return null; 
    }
  }

  // 📥 Obtener registros de un tipo
  async function fetchRecords(type) {
    if (!supabaseClient) return [];
    const user = await getUser();
    if (!user) return [];
    try {
      const { data, error } = await supabaseClient
        .from('moto_records')
        .select('*')
        .eq('user_id', user.id)
        .eq('record_type', type)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Error fetchRecords:', e.message);
      return [];
    }
  }

  // 💾 Guardar registro
  async function saveRecord(type, rec) {
    const user = await getUser();
    if (!user) throw new Error('No autenticado');
    
    const payload = { 
      user_id: user.id, 
      record_type: type, 
      ...rec, 
      odometer: +rec.odometer, 
      money: +rec.money,
      liters: rec.liters ? +rec.liters : null,
      price_per_liter: rec.pricePerL ? +rec.pricePerL : null,
      price: rec.price ? +rec.price : null
    };

    if (isOnline && supabaseClient) {
      if (rec.id && rec.id !== 'new') {
        const { error } = await supabaseClient
          .from('moto_records')
          .update(payload)
          .eq('id', rec.id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        payload.id = crypto.randomUUID();
        const { error } = await supabaseClient
          .from('moto_records')
          .insert([payload]);
        if (error) throw error;
      }
    } else {
      offlineQueue.push({ type: 'save', record_type: type, payload });
      localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
      console.log('📦 Guardado en cola offline');
    }
  }

  // 🗑️ Eliminar registro
  async function deleteRecord(type, id) {
    const user = await getUser();
    if (!user) throw new Error('No autenticado');
    
    if (isOnline && supabaseClient) {
      const { error } = await supabaseClient
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

  // 🔄 Sincronizar cola offline
  async function syncQueue() {
    if (!supabaseClient || offlineQueue.length === 0) return;
    const queue = [...offlineQueue]; 
    offlineQueue = [];
    
    for (const item of queue) {
      try {
        if (item.type === 'save') await saveRecord(item.record_type, item.payload);
        else if (item.type === 'delete') await deleteRecord(item.record_type, item.id);
      } catch (e) {
        console.warn('Error sincronizando:', e.message);
        offlineQueue.push(item);
      }
    }
    localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
  }

  // 🎯 Exportar API global
  window.db = {
    // Exponer cliente para listeners
    supabase: supabaseClient,
    
    // Auth
    signUp: async (email, password) => {
      if (!supabaseClient) throw new Error('Sin conexión a la nube');
      return await supabaseClient.auth.signUp({ email, password });
    },
    signIn: async (email, password) => {
      if (!supabaseClient) throw new Error('Sin conexión a la nube');
      return await supabaseClient.auth.signInWithPassword({ email, password });
    },
    signOut: async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      localStorage.removeItem('mototrack_user');
    },
    getCurrentUser: getUser,
    
    // Datos
    fetchRecords,
    saveRecord,
    deleteRecord,
    syncOfflineQueue: syncQueue,
    
    // Utilidades
    isOnline: () => isOnline
  };
  
  console.log('✅ db.js cargado correctamente');
})();