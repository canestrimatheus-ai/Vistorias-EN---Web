import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_AVATAR_BYTES = 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let profileBucketReady = false;

function json(response, status, body) {
  response.status(status).json(body);
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = String(match[1] || '').toLowerCase();
  return {
    mimeType,
    buffer: Buffer.from(match[2], 'base64'),
  };
}

async function ensureBucket(admin) {
  if (profileBucketReady) return;
  const { data: buckets } = await admin.storage.listBuckets();
  if ((buckets || []).some((bucket) => bucket.name === 'profile-photos')) {
    await admin.storage.updateBucket('profile-photos', { public: true });
    profileBucketReady = true;
    return;
  }
  await admin.storage.createBucket('profile-photos', { public: true });
  profileBucketReady = true;
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

  const file = dataUrlToBuffer(request.body?.data_url);
  if (!file || !ALLOWED_IMAGE_TYPES.has(file.mimeType)) {
    json(response, 400, { error: 'Imagem inválida.' });
    return;
  }

  if (file.buffer.length > MAX_AVATAR_BYTES) {
    json(response, 400, { error: 'Imagem muito grande. Escolha uma foto menor.' });
    return;
  }

  await ensureBucket(admin);

  const extension = file.mimeType.includes('png') ? 'png' : file.mimeType.includes('webp') ? 'webp' : 'jpg';
  const storagePath = `${userData.user.id}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from('profile-photos')
    .upload(storagePath, file.buffer, {
      contentType: file.mimeType,
      upsert: false,
    });

  if (uploadError) {
    json(response, 400, { error: uploadError.message });
    return;
  }

  const { data: publicUrl } = admin.storage.from('profile-photos').getPublicUrl(storagePath);
  const avatarUrl = publicUrl.publicUrl;

  const { error: updateError } = await admin
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userData.user.id);

  if (updateError) {
    await admin.storage.from('profile-photos').remove([storagePath]);
    json(response, 400, { error: updateError.message, code: updateError.code, details: updateError.details });
    return;
  }

  json(response, 200, { avatar_url: avatarUrl });
}
