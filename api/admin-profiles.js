import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminRoles = new Set(['admin']);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

function json(response, status, body) {
  response.status(status).json(body);
}

function readToken(request) {
  return String(
    request.body?.access_token ||
    request.headers.authorization ||
    ''
  ).replace('Bearer ', '').trim();
}

async function getAdmin(request, response) {
  if (!supabaseUrl || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas.' });
    return null;
  }

  const bearer = readToken(request);
  if (!bearer) {
    json(response, 401, { error: 'Token de autorização ausente.' });
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

  if (profileError || !adminRoles.has(profile?.access_role) || profile?.active === false) {
    json(response, 403, { error: 'Somente administradores ativos podem acessar usuários.' });
    return null;
  }

  return admin;
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }

  const admin = await getAdmin(request, response);
  if (!admin) return;

  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    json(response, 400, { error: error.message, code: error.code, details: error.details });
    return;
  }

  json(response, 200, { profiles: data || [] });
}
