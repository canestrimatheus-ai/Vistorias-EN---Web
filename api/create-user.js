import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminRoles = new Set(['admin']);
const accessRoles = new Set(['admin', 'inspector', 'driver', 'app']);

function normalizeAccessRole(role) {
  if (role === 'analyst') return 'admin';
  return accessRoles.has(role) ? role : 'inspector';
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !serviceKey) {
    response.status(500).json({ error: 'Supabase server credentials are not configured.' });
    return;
  }

  const authHeader = request.headers.authorization || '';
  const bearer = authHeader.replace('Bearer ', '').trim();

  if (!bearer) {
    response.status(401).json({ error: 'Missing authorization token.' });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(bearer);
  if (callerError || !callerData?.user) {
    response.status(401).json({ error: 'Invalid authorization token.' });
    return;
  }

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('access_role, active')
    .eq('id', callerData.user.id)
    .maybeSingle();

  if (profileError || !adminRoles.has(callerProfile?.access_role) || callerProfile?.active === false) {
    response.status(403).json({ error: 'Only active web administrators can create users.' });
    return;
  }

  const { email, password, full_name, access_role } = request.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRole = normalizeAccessRole(access_role);

  if (!normalizedEmail || !password || !full_name) {
    response.status(400).json({ error: 'Name, email and password are required.' });
    return;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      name: full_name,
      access_role: normalizedRole,
    },
  });

  if (createError) {
    response.status(400).json({ error: createError.message });
    return;
  }

  const { error: upsertError } = await admin.from('profiles').upsert({
    id: created.user.id,
    email: normalizedEmail,
    full_name,
    access_role: normalizedRole,
    active: true,
  });

  if (upsertError) {
    response.status(400).json({ error: upsertError.message });
    return;
  }

  response.status(200).json({
    user: {
      id: created.user.id,
      email: normalizedEmail,
      full_name,
      access_role: normalizedRole,
    },
  });
}
