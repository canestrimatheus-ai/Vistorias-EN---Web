import { createClient } from '@supabase/supabase-js';
import checklistModelHandler from '../shared/checklist-model-store.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(response, status, body) {
  setCors(response);
  response.status(status).json(body);
}

function getSupabaseRef() {
  const match = String(supabaseUrl || '').match(/^https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || '';
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function tokenMatchesProject(token) {
  const expectedRef = getSupabaseRef();
  if (!expectedRef) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.iss && !payload?.ref) return true;
  return payload.ref === expectedRef || String(payload.iss || '').includes(expectedRef);
}

async function getUserAdmin(request, response) {
  if (!supabaseUrl || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas.' });
    return null;
  }

  const bearer = String(request.headers.authorization || '').replace('Bearer ', '').trim();
  if (!bearer) {
    json(response, 401, { error: 'Token de autorização ausente.' });
    return null;
  }

  if (!tokenMatchesProject(bearer)) {
    json(response, 401, { error: 'Sessão expirada. Entre novamente.' });
    return null;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  if (userError || !userData?.user) {
    json(response, 401, { error: 'Token de autorização inválido.' });
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('access_role, active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || profile?.active === false || !['app', 'inspector', 'admin', 'driver'].includes(profile?.access_role)) {
    json(response, 403, { error: 'Usuário sem permissão para acessar vistorias.' });
    return null;
  }

  return { admin, user: userData.user, profile };
}

export default async function handler(request, response) {
  setCors(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.query?.models === 'active') {
    await checklistModelHandler(request, response);
    return;
  }

  if (request.method !== 'GET') {
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }

  const auth = await getUserAdmin(request, response);
  if (!auth) return;

  const { admin, user, profile } = auth;
  const { data, error } = await admin
    .from('inspections')
    .select('*, inspection_photos(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    json(response, 400, { error: error.message, code: error.code, details: error.details });
    return;
  }

  const inspections = await Promise.all((data || []).map(async (inspection) => ({
    ...inspection,
    inspection_photos: await Promise.all((inspection.inspection_photos || []).map(async (photo) => {
      if (!photo.storage_path) return photo;
      const { data: signedUrl } = await admin.storage
        .from('inspection-photos')
        .createSignedUrl(photo.storage_path, 60 * 60);
      return { ...photo, public_url: signedUrl?.signedUrl || '' };
    })),
  })));

  let scheduleQuery = admin
    .from('inspection_schedules')
    .select('*')
    .in('status', ['assigned', 'scheduled'])
    .order('scheduled_date', { ascending: true });
  scheduleQuery = profile?.access_role === 'driver'
    ? scheduleQuery.eq('driver_user_id', user.id)
    : scheduleQuery.eq('assigned_inspector_id', user.id);
  const { data: scheduleData } = await scheduleQuery;

  json(response, 200, { inspections, schedules: scheduleData || [] });
}
