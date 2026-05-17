import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(response, status, body) {
  response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }

  if (!supabaseUrl || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas.' });
    return;
  }

  const bearer = String(request.headers.authorization || '').replace('Bearer ', '').trim();
  if (!bearer) {
    json(response, 401, { error: 'Token de autorização ausente.' });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  if (userError || !userData?.user) {
    json(response, 401, { error: 'Token de autorização inválido.' });
    return;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || profile?.active === false) {
    json(response, 403, { error: 'Usuário inativo.' });
    return;
  }

  const token = String(request.body?.expo_push_token || '').trim();
  if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
    json(response, 400, { error: 'Token de push inválido.' });
    return;
  }

  const platform = ['android', 'ios', 'web'].includes(request.body?.push_platform)
    ? request.body.push_platform
    : null;

  const pushUpdatedAt = new Date().toISOString();
  const { error: metadataError } = await admin.auth.admin.updateUserById(userData.user.id, {
    app_metadata: {
      ...(userData.user.app_metadata || {}),
      expo_push_token: token,
      push_platform: platform,
      push_updated_at: pushUpdatedAt,
    },
  });

  if (metadataError) {
    json(response, 400, { error: metadataError.message });
    return;
  }

  const { error } = await admin
    .from('profiles')
    .update({
      expo_push_token: token,
      push_platform: platform,
      push_updated_at: pushUpdatedAt,
    })
    .eq('id', userData.user.id);

  json(response, 200, { ok: true });
}
