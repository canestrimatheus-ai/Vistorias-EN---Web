import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

function readToken(request) {
  return String(
    request.body?.access_token ||
    request.headers.authorization ||
    ''
  ).replace('Bearer ', '').trim();
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !serviceKey) {
    response.status(500).json({ error: 'Supabase server credentials are not configured.' });
    return;
  }

  const bearer = readToken(request);
  if (!bearer) {
    response.status(401).json({ error: 'Missing authorization token.' });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  if (userError || !userData?.user) {
    response.status(401).json({ error: 'Invalid authorization token.' });
    return;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    response.status(400).json({ error: profileError.message });
    return;
  }

  response.status(200).json({
    user: {
      id: userData.user.id,
      email: userData.user.email,
    },
    profile,
  });
}
