import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Misma cuenta de Supabase que Sitios Relevantes; tabla separada para este callejero.
const supabase = createClient(
  'https://mbmxfyslftdeobecbske.supabase.co',
  'sb_publishable_wMp1B0NTMZJQ89sr6-Xkhg_CBvkeX7j',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
const TABLE = 'calles_sync_state';
const USER_KEY = 'calles_cloud_user_v1';
const BASE_KEY = 'calles_cloud_base_v1';
const DIRTY_KEY = 'calles_cloud_dirty_v1';
const GROUP_KEYS = new Set(['grupoSel_todas', 'grupoSel_no-aprendidas', 'grupoSel_repaso']);
let session = null;
let ready = false;
let updatedAt = '';
let timer = null;
let pushing = false;
let pushAgain = false;

const element = id => document.getElementById(id);
const same = (a, b) => a === b;
function parse(raw) { try { return JSON.parse(raw); } catch { return null; } }
function isAppKey(key) { return key.startsWith('quiz_calles_vlc_v2_') || GROUP_KEYS.has(key); }
function capture() {
  const values = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isAppKey(key)) values[key] = localStorage.getItem(key);
  }
  return { version: 1, values };
}
function normalize(value) {
  return { version: 1, values: value?.values && typeof value.values === 'object' ? value.values : {} };
}
function mergeArray(remote, local) {
  const seen = new Set();
  return [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])].filter(item => {
    const id = JSON.stringify(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function mergeConflict(key, remoteRaw, localRaw, baseRaw) {
  if (remoteRaw == null) return localRaw;
  if (localRaw == null) return remoteRaw;
  if (same(remoteRaw, localRaw)) return localRaw;
  const remote = parse(remoteRaw), local = parse(localRaw);
  if (key === 'quiz_calles_vlc_v2_DELETED') return JSON.stringify(mergeArray(remote, local));
  if (key === 'quiz_calles_vlc_v2_HISTORIAL') return JSON.stringify(mergeArray(remote, local));
  if (/^quiz_calles_vlc_v2_(Josep|Tudón)$/.test(key) && remote && local) {
    if (!baseRaw) return JSON.stringify(window.mergeProgress(remote, local));
    const base = parse(baseRaw) || {}, values = {};
    for (const street of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const r = remote[street], l = local[street], b = base[street];
      if (JSON.stringify(l) === JSON.stringify(b)) values[street] = r ?? l;
      else if (JSON.stringify(r) === JSON.stringify(b)) values[street] = l ?? r;
      else values[street] = window.mergeRecord(r || {}, l || {});
    }
    return JSON.stringify(values);
  }
  if (/^quiz_calles_vlc_v2_(PLAN|STREET_PLAN)_(Josep|Tudón)$/.test(key) && remote && local) {
    if (!baseRaw) return JSON.stringify(window.mergePlan(remote, local));
    const base = parse(baseRaw) || {}, values = {};
    for (const item of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const r = remote[item], l = local[item], b = base[item];
      if (JSON.stringify(l) === JSON.stringify(b)) values[item] = r ?? l;
      else if (JSON.stringify(r) === JSON.stringify(b)) values[item] = l ?? r;
      else values[item] = window.mergePlanItem(r || {}, l || {});
    }
    return JSON.stringify(values);
  }
  if (remote && local && !Array.isArray(remote) && !Array.isArray(local) && typeof remote === 'object' && typeof local === 'object')
    return JSON.stringify({ ...remote, ...local });
  return localRaw;
}
function reconcile(remoteValue, localValue, baseValue) {
  const remote = normalize(remoteValue).values;
  const local = normalize(localValue).values;
  const base = baseValue ? normalize(baseValue).values : null;
  const values = {};
  for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    if (!isAppKey(key)) continue;
    const r = remote[key], l = local[key], b = base?.[key];
    if (base) {
      if (l === b) values[key] = r ?? l;
      else if (r === b) values[key] = l ?? r;
      else values[key] = mergeConflict(key, r, l, b);
    } else values[key] = mergeConflict(key, r, l, null);
  }
  return { version: 1, values };
}
function apply(snapshot) {
  let changed = false;
  for (const [key, raw] of Object.entries(normalize(snapshot).values)) {
    if (!isAppKey(key) || typeof raw !== 'string' || localStorage.getItem(key) === raw) continue;
    localStorage.setItem(key, raw);
    changed = true;
  }
  return changed;
}
function status(kind, text) {
  for (const id of ['profile-sync-button', 'header-sync-button']) {
    const button = element(id);
    button.textContent = text;
    button.className = `sync-status-btn${kind ? ` ${kind}` : ''}`;
  }
}
function message(text, kind = '') {
  element('sync-message').textContent = text;
  element('sync-message').className = `sync-message${kind ? ` ${kind}` : ''}`;
}
function authUI() {
  const signedIn = !!session?.user;
  element('sync-signed-out').hidden = signedIn;
  element('sync-signed-in').hidden = !signedIn;
  element('sync-user-email').textContent = signedIn ? session.user.email || 'Cuenta conectada' : '';
  if (!signedIn) status('', '☁ Sin conectar');
}
function prepareLocal() {
  // La migración existente de la web se ejecuta antes de capturar, también si
  // se conecta desde la pantalla de perfiles sin haber elegido ninguno.
  if (localStorage.getItem(USER_KEY) === session?.user?.id) return;
  window.migrateUserData('Josep');
  window.migrateUserData('Tudón');
}
function baseline() {
  if (localStorage.getItem(USER_KEY) !== session?.user?.id) return null;
  return parse(localStorage.getItem(BASE_KEY));
}
async function cloudRow() {
  const response = await supabase.from(TABLE).select('payload,updated_at').maybeSingle();
  if (response.error) throw response.error;
  return response.data;
}
async function upload(snapshot) {
  const response = await supabase.from(TABLE)
    .upsert({ user_id: session.user.id, payload: snapshot }, { onConflict: 'user_id' })
    .select('updated_at').single();
  if (response.error) throw response.error;
  updatedAt = response.data.updated_at;
  localStorage.setItem(USER_KEY, session.user.id);
  localStorage.setItem(BASE_KEY, JSON.stringify(snapshot));
  localStorage.removeItem(DIRTY_KEY);
}
function syncError(error) {
  ready = false;
  status('error', '☁ Pendiente');
  const missingTable = error?.code === '42P01' || /calles_sync_state/.test(error?.message || '');
  message(missingTable ? 'Falta crear la tabla de este callejero en Supabase. Los datos siguen en este dispositivo.'
    : `No se pudo sincronizar. Los datos siguen en este dispositivo. ${error?.message || ''}`, 'error');
}
async function initialSync() {
  if (!session?.user) return;
  ready = false;
  status('', '☁ Sincronizando…');
  message('Comprobando tus datos guardados…');
  try {
    prepareLocal();
    const local = capture();
    const row = await cloudRow();
    const merged = row ? reconcile(row.payload, local, baseline()) : local;
    const changed = apply(merged);
    if (!row || JSON.stringify(merged) !== JSON.stringify(normalize(row.payload))) await upload(merged);
    else {
      updatedAt = row.updated_at || '';
      localStorage.setItem(USER_KEY, session.user.id);
      localStorage.setItem(BASE_KEY, JSON.stringify(merged));
      localStorage.removeItem(DIRTY_KEY);
    }
    ready = true;
    status('online', '☁ Sincronizado');
    message('Datos sincronizados correctamente.', 'ok');
    if (changed) setTimeout(() => location.reload(), 250);
  } catch (error) { syncError(error); }
}
async function push() {
  if (!session?.user || !ready) return;
  if (pushing) { pushAgain = true; return; }
  pushing = true;
  clearTimeout(timer);
  status('', '☁ Sincronizando…');
  try {
    const row = await cloudRow();
    const merged = row ? reconcile(row.payload, capture(), baseline()) : capture();
    const changed = apply(merged);
    await upload(merged);
    status('online', '☁ Sincronizado');
    message('Últimos cambios guardados.', 'ok');
    if (changed) setTimeout(() => location.reload(), 250);
  } catch (error) {
    localStorage.setItem(DIRTY_KEY, '1');
    syncError(error);
  } finally {
    pushing = false;
    if (pushAgain) { pushAgain = false; push(); }
  }
}
function schedule() {
  localStorage.setItem(DIRTY_KEY, '1');
  clearTimeout(timer);
  if (ready) timer = setTimeout(push, 800);
}
function wrap(name) {
  const original = window[name];
  if (typeof original !== 'function') return;
  window[name] = function (...args) { const result = original.apply(this, args); schedule(); return result; };
}
['saveStorage', 'saveOverrides', 'saveHist', 'saveDeleted', 'saveStreetOverrides', 'saveGeo',
  'savePlan', 'saveGrupoSel', 'setAnswerMode', 'advancePersistentAllQueue', 'importFullBackupText',
  'bootstrapExistingThemes'].forEach(wrap);

function openModal() { element('sync-modal').classList.add('open'); authUI(); }
function closeModal() { element('sync-modal').classList.remove('open'); }
for (const id of ['profile-sync-button', 'header-sync-button']) element(id).addEventListener('click', openModal);
element('sync-close').addEventListener('click', closeModal);
element('sync-modal').addEventListener('click', event => { if (event.target === element('sync-modal')) closeModal(); });
element('sync-sign-in').addEventListener('click', async () => {
  const email = element('sync-email').value.trim(), password = element('sync-password').value;
  if (!email.includes('@') || password.length < 6) { message('Introduce un correo y una contraseña válidos.', 'error'); return; }
  message('Entrando…');
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) { message(result.error.message, 'error'); return; }
  session = result.data.session;
  element('sync-password').value = '';
  authUI();
  await initialSync();
});
element('sync-sign-up').addEventListener('click', async () => {
  const email = element('sync-email').value.trim(), password = element('sync-password').value;
  if (!email.includes('@') || password.length < 6) { message('Introduce un correo y una contraseña válida de al menos 6 caracteres.', 'error'); return; }
  message('Creando el acceso…');
  const result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (result.error) { message(result.error.message, 'error'); return; }
  element('sync-password').value = '';
  if (result.data.session) { session = result.data.session; authUI(); await initialSync(); }
  else message('Confirma el acceso desde tu correo y después entra.', 'ok');
});
element('sync-now').addEventListener('click', async () => { if (ready) await push(); else await initialSync(); });
element('sync-sign-out').addEventListener('click', async () => {
  if (ready && localStorage.getItem(DIRTY_KEY) === '1') await push();
  const result = await supabase.auth.signOut();
  if (result.error) { message(result.error.message, 'error'); return; }
  session = null; ready = false; authUI();
  message('Sesión cerrada. Los datos locales se conservan.', 'ok');
});
document.addEventListener('visibilitychange', () => {
  if (!session?.user) return;
  if (document.visibilityState === 'hidden' && ready && localStorage.getItem(DIRTY_KEY) === '1') push();
  if (document.visibilityState === 'visible' && !pushing) initialSync();
});
window.addEventListener('online', () => { if (session?.user) initialSync(); });
window.addEventListener('storage', event => { if (event.key && isAppKey(event.key) && session?.user) initialSync(); });

const result = await supabase.auth.getSession();
if (result.error) { status('error', '☁ Error de conexión'); message(result.error.message, 'error'); }
else { session = result.data.session; authUI(); if (session?.user) await initialSync(); }
