import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const initialAdminEmail = 'admin@expressonepomuceno.com.br';
const adminRoles = new Set(['admin']);
const accessRoles = new Set(['admin', 'inspector', 'driver', 'app']);

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

function readToken(request, body = {}) {
  return String(
    body.access_token ||
    request.headers.authorization ||
    ''
  ).replace('Bearer ', '').trim();
}

function normalizeAccessRole(role) {
  if (role === 'analyst') return 'admin';
  return accessRoles.has(role) ? role : 'inspector';
}

async function getAdminClient(response) {
  if (!supabaseUrl || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas.' });
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

async function authorizeAdmin(admin, request, response, body) {
  const bearer = readToken(request, body);

  if (!bearer) {
    json(response, 401, { error: 'Token de autorização ausente.' });
    return null;
  }

  const { data: callerData, error: callerError } = await admin.auth.getUser(bearer);
  if (callerError || !callerData?.user) {
    json(response, 401, { error: 'Token de autorização inválido.' });
    return null;
  }

  if (body.action === 'repair-profile' && callerData.user.email?.toLowerCase() === initialAdminEmail) {
    return callerData.user;
  }

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('access_role, active')
    .eq('id', callerData.user.id)
    .maybeSingle();

  if (profileError || !adminRoles.has(callerProfile?.access_role) || callerProfile?.active === false) {
    json(response, 403, { error: 'Somente administradores web ativos podem gerenciar usuários.' });
    return null;
  }

  return callerData.user;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }

  const admin = await getAdminClient(response);
  if (!admin) return;

  const body = request.body || {};
  const caller = await authorizeAdmin(admin, request, response, body);
  if (!caller) return;

  const action = body.action;
  const normalizedEmail = String(body.email || '').trim().toLowerCase();
  const normalizedRole = normalizeAccessRole(body.access_role);

  if (action === 'repair-profile') {
    const profile = body.profile || {};
    const { error } = await admin.from('profiles').upsert({
      id: caller.id,
      email: caller.email,
      full_name: profile.full_name || 'Administrador',
      access_role: 'admin',
      active: true,
    });

    if (error) json(response, 400, { error: error.message });
    else json(response, 200, { ok: true });
    return;
  }

  if (action === 'create') {
    if (!normalizedEmail || !body.password || !body.full_name) {
      json(response, 400, { error: 'Nome, e-mail e senha são obrigatórios.' });
      return;
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        name: body.full_name,
        access_role: normalizedRole,
      },
    });

    if (createError) {
      json(response, 400, { error: createError.message });
      return;
    }

    const { error: upsertError } = await admin.from('profiles').upsert({
      id: created.user.id,
      email: normalizedEmail,
      full_name: body.full_name,
      access_role: normalizedRole,
      active: true,
    });

    if (upsertError) json(response, 400, { error: upsertError.message });
    else json(response, 200, { user: created.user });
    return;
  }

  if (action === 'update') {
    if (!body.id || !normalizedEmail || !body.full_name) {
      json(response, 400, { error: 'Usuário, nome e e-mail são obrigatórios.' });
      return;
    }

    const { error: authError } = await admin.auth.admin.updateUserById(body.id, {
      email: normalizedEmail,
      user_metadata: {
        name: body.full_name,
        access_role: normalizedRole,
      },
    });

    if (authError) {
      json(response, 400, { error: authError.message });
      return;
    }

    const { error: updateError } = await admin.from('profiles').upsert({
      id: body.id,
      email: normalizedEmail,
      full_name: body.full_name,
      access_role: normalizedRole,
      active: true,
    });

    if (updateError) json(response, 400, { error: updateError.message });
    else json(response, 200, { ok: true });
    return;
  }

  if (action === 'update-self') {
    const { error } = await admin
      .from('profiles')
      .update({
        full_name: body.full_name || caller.user_metadata?.name || caller.email,
        job_title: body.job_title || null,
        avatar_url: body.avatar_url || null,
      })
      .eq('id', caller.id);

    if (error) json(response, 400, { error: error.message });
    else json(response, 200, { ok: true });
    return;
  }

  if (action === 'reset-password') {
    if (!body.id || !body.password || String(body.password).length < 6) {
      json(response, 400, { error: 'Informe uma senha com pelo menos 6 caracteres.' });
      return;
    }

    const { error } = await admin.auth.admin.updateUserById(body.id, {
      password: body.password,
    });

    if (error) json(response, 400, { error: error.message });
    else json(response, 200, { ok: true });
    return;
  }

  if (action === 'delete') {
    if (!body.id) {
      json(response, 400, { error: 'Usuário obrigatório.' });
      return;
    }

    if (body.id === caller.id) {
      json(response, 400, { error: 'Você não pode excluir o usuário em uso.' });
      return;
    }

    await admin.from('profiles').delete().eq('id', body.id);
    const { error } = await admin.auth.admin.deleteUser(body.id);

    if (error) json(response, 400, { error: error.message });
    else json(response, 200, { ok: true });
    return;
  }

  json(response, 400, { error: 'Ação inválida.' });
}
