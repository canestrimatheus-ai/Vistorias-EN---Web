import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

function json(response, status, body) {
  response.status(status).json(body);
}

function cleanMetadata(metadata = {}) {
  const safe = { ...metadata };
  delete safe.avatar_url;
  delete safe.picture;
  delete safe.photo;
  return {
    name: safe.name || safe.full_name || '',
    full_name: safe.full_name || safe.name || '',
    job_title: safe.job_title || '',
    access_role: safe.access_role || undefined,
  };
}

async function passwordSession(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publicKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.error || 'Login não realizado.');
  return payload;
}

async function refreshSession(refreshToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: publicKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.error || 'Não foi possível renovar a sessão.');
  return payload;
}

function sessionPayload(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  };
}

export default async function handler(request, response) {
  if (!supabaseUrl || !publicKey || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas no servidor.' });
    return;
  }

  if (request.method !== 'POST') {
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }

  if (!supabaseUrl || !publicKey || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas.' });
    return;
  }

  const email = String(request.body?.email || '').trim().toLowerCase();
  const password = String(request.body?.password || '');
  if (!email || !password) {
    json(response, 400, { error: 'Informe e-mail e senha.' });
    return;
  }

  try {
    const firstSession = await passwordSession(email, password);
    const user = firstSession.user;
    if (!user?.id) throw new Error('Usuário não encontrado.');

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: cleanMetadata(user.user_metadata),
    });
    if (metadataError) throw metadataError;

    const cleanSession = await refreshSession(firstSession.refresh_token);

    json(response, 200, { session: sessionPayload(cleanSession) });
  } catch (error) {
    json(response, 401, { error: error.message || 'Login não realizado.' });
  }
}
