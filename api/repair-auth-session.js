import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(response, status, body) {
  response.status(status).json(body);
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

  const refreshToken = String(request.body?.refresh_token || '').trim();
  if (!refreshToken) {
    json(response, 400, { error: 'Refresh token ausente.' });
    return;
  }

  try {
    const firstSession = await refreshSession(refreshToken);
    const user = firstSession.user;
    if (!user?.id) throw new Error('Usuário não encontrado na sessão.');

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: cleanMetadata(user.user_metadata),
    });
    if (updateError) throw updateError;

    const nextRefreshToken = firstSession.refresh_token || refreshToken;
    const cleanSession = await refreshSession(nextRefreshToken);

    json(response, 200, {
      session: {
        access_token: cleanSession.access_token,
        refresh_token: cleanSession.refresh_token,
        expires_in: cleanSession.expires_in,
        expires_at: cleanSession.expires_at,
        token_type: cleanSession.token_type,
        user: cleanSession.user,
      },
    });
  } catch (error) {
    json(response, 400, { error: error.message || 'Não foi possível reparar a sessão.' });
  }
}
