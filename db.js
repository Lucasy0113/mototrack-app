// 🔐 CONFIGURACIÓN SUPABASE - Versión final con mapeo de campos
(function() {
  'use strict';
  
  const SUPABASE_URL = 'https://dgfdtwmvyalofmszbnab.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_AzdP6R-UiBe4oecm1emSjQ_AtPRXSkV';
  
  if (window._dbLoaded) return;
  window._dbLoaded = true;
  
  let supabaseClient = null;
  
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✅ Supabase cliente inicializado');
    } catch (e) {
      console.warn('⚠️ Error inicializando Supabase:', e.message);
    }
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
      const { data, error } = await supabaseClient
        .from('moto_records')
        .select('*')
        .eq('user_id', user.id)
        .eq('record_type', type)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch { return []; }
  }

  // ✅ FUNCIÓN CLAVE: Mapear campos del frontend a columnas de la BD
  function mapToFrontend(record) {
    if (!record) return null;
    return {
      ...record,
      // Mapeo de columnas snake_case → camelCase
      pricePerL: record.price_per_liter,
      oilType: record.oil_type,
      // Mantener compatibilidad con campos que ya tienen el nombre correcto
      price_per_liter: record.price_per_liter, // para fallback
      oil_type: record.oil_type
    };
  }

  function mapToDatabase(record, type) {
    const mapped = { ...record };
    
    // Mapeo de campos camelCase → snake_case para la BD
    if (type === 'fuel') {
      if (mapped.pricePerL !== undefined) {
        mapped.price_per_liter = parseFloat(mapped.pricePerL);
        delete mapped.pricePerL; // Evitar conflicto
      }
    }
    if (type === 'maintenance') {
      if (mapped.oilType !== undefined) {
        mapped.oil_type = mapped.oilType;
        delete mapped.oilType;
      }
    }
    
    // Normalizar números
    if (mapped.odometer) mapped.odometer = parseFloat(mapped.odometer);
    if (mapped.money) mapped.money = parseFloat(mapped.money);
    if (mapped.liters) mapped.liters = parseFloat(mapped.liters);
    if (mapped.price) mapped.price = parseFloat(mapped.price);
    
    return mapped;
  }

  async function saveRecord(type, rec) {
    const user = await getUser();
    if (!user) throw new Error('No autenticado');
    
    // ✅ Mapear campos antes de enviar a Supabase
    const payload = mapToDatabase({ 
      user_id: user.id, 
      record_type: type, 
      ...rec 
    }, type);

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
      offlineQueue.push({ type: 'save', record_type: type, payload: rec });
      localStorage.setItem('mototrack_offline', JSON.stringify(offlineQueue));
    }
  }

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

  // 🎯 Exportar API
  window.db = {
    supabase: supabaseClient,
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
    fetchRecords: async (type) => {
      const records = await fetchRecords(type);
      // ✅ Mapear de snake_case → camelCase al leer
      return records.map(r => mapToFrontend(r));
    },
    saveRecord,
    deleteRecord,
    syncOfflineQueue: syncQueue,
    isOnline: () => isOnline
  };
  
  console.log('✅ db.js cargado con mapeo de campos');
})();