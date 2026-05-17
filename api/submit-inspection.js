import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PHOTOS = 30;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUTOCHECK_TYPE = 'Vistoria Autocheck';
const ADMIN_REALTIME_CHANNEL = 'admin-panel-live';
const INVALID_PLATE_MESSAGE = 'Placa inválida. Verifique e tente novamente.';
let photoBucketReady = false;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(response, status, body) {
  setCors(response);
  response.status(status).json(body);
}

function safeText(value) {
  return String(value || '').trim();
}

function normalizePlate(value) {
  return safeText(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function formatPlate(value) {
  const clean = normalizePlate(value);
  if (/^[A-Z]{3}\d{4}$/.test(clean)) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  return clean;
}

function isValidPlate(value) {
  const clean = normalizePlate(value);
  return /^[A-Z]{3}\d{4}$/.test(clean) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(clean);
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

function photoDataUrl(item) {
  if (item?.data_url) return item.data_url;
  if (item?.dataUrl) return item.dataUrl;
  if (item?.local_uri && String(item.local_uri).startsWith('data:image/')) return item.local_uri;
  if (item?.base64) return `data:${item.mimeType || item.mime_type || 'image/jpeg'};base64,${item.base64}`;
  return '';
}

async function ensurePhotoBucket(admin) {
  if (photoBucketReady) return;
  const { data: buckets } = await admin.storage.listBuckets();
  if ((buckets || []).some((bucket) => bucket.name === 'inspection-photos')) {
    await admin.storage.updateBucket('inspection-photos', { public: false });
    photoBucketReady = true;
    return;
  }
  await admin.storage.createBucket('inspection-photos', { public: false });
  photoBucketReady = true;
}

async function markScheduleCompleted(admin, scheduleId, userId, inspectionId, completedAt) {
  if (!scheduleId) return;
  await admin
    .from('inspection_schedules')
    .update({
      status: 'completed',
      inspection_id: inspectionId,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('id', scheduleId)
    .or(`assigned_inspector_id.eq.${userId},driver_user_id.eq.${userId}`);
}

async function broadcastAdminEvent(admin, event, payload) {
  try {
    await admin.channel(ADMIN_REALTIME_CHANNEL).send({
      type: 'broadcast',
      event,
      payload,
    });
  } catch {
    // Best effort: never block the inspection save because no panel is connected.
  }
}

export default async function handler(request, response) {
  setCors(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

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
    .select('access_role, active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || profile?.active === false || !['app', 'inspector', 'admin', 'driver'].includes(profile?.access_role)) {
    json(response, 403, { error: 'Usuário sem permissão para enviar vistorias.' });
    return;
  }

  const body = request.body || {};
  const inspection = body.inspection || {};
  const scheduleId = safeText(inspection.schedule_id);
  const signatureData = Array.isArray(body.signature_data) ? body.signature_data : [];
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
  const now = new Date().toISOString();
  const isDriverAutocheck = profile.access_role === 'driver' && !scheduleId;
  const inspectionType = isDriverAutocheck ? AUTOCHECK_TYPE : (scheduleId ? 'Agendada' : 'Vistoria Agregados');

  const payload = {
    user_id: userData.user.id,
    type: inspectionType,
    driver_name: safeText(inspection.driver_name),
    truck_plate: formatPlate(inspection.truck_plate),
    trailer_plate: formatPlate(inspection.trailer_plate),
    status: 'completed',
    observations: safeText(inspection.observations),
    signature_data: signatureData,
    applicable: inspection.applicable && typeof inspection.applicable === 'object' ? inspection.applicable : {},
    created_at: now,
    completed_at: now,
  };

  if (!payload.driver_name || !payload.truck_plate || !payload.trailer_plate) {
    json(response, 400, { error: 'Motorista, placa do cavalo e placa da carreta são obrigatórios.' });
    return;
  }

  if (!isValidPlate(payload.truck_plate) || !isValidPlate(payload.trailer_plate)) {
    json(response, 400, { error: INVALID_PLATE_MESSAGE });
    return;
  }

  const { data, error } = await admin
    .from('inspections')
    .insert(payload)
    .select()
    .single();

  if (error) {
    json(response, 400, { error: error.message, code: error.code, details: error.details, hint: error.hint });
    return;
  }

  await ensurePhotoBucket(admin);

  const photoRows = [];
  const uploadedPaths = [];
  const uploadErrors = [];

  for (const item of photos) {
    if (!item?.label) continue;
    const label = safeText(item.label);
    const sourceDataUrl = photoDataUrl(item);
    const row = {
      inspection_id: data.id,
      label,
      local_uri: item.local_uri || '',
    };

    const file = dataUrlToBuffer(sourceDataUrl);
    if (!file) {
      uploadErrors.push({ label, error: 'Foto recebida sem arquivo anexado. Atualize/reinicie o app e envie novamente.' });
      continue;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.mimeType)) {
      uploadErrors.push({ label, error: 'Formato de imagem inválido.' });
      continue;
    }

    if (file.buffer.length > MAX_PHOTO_BYTES) {
      uploadErrors.push({ label, error: 'Imagem muito grande. Envie uma foto menor.' });
      continue;
    }

    const extension = file.mimeType.includes('png') ? 'png' : file.mimeType.includes('webp') ? 'webp' : 'jpg';
    const storagePath = `${userData.user.id}/${data.id}/${Date.now()}-${photoRows.length}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from('inspection-photos')
      .upload(storagePath, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });

    if (uploadError) {
      uploadErrors.push({ label, error: uploadError.message });
      continue;
    }

    row.storage_path = storagePath;
    uploadedPaths.push(storagePath);
    photoRows.push(row);
  }

  if (uploadErrors.length) {
    if (uploadedPaths.length) {
      await admin.storage.from('inspection-photos').remove(uploadedPaths);
    }
    await admin.from('inspections').delete().eq('id', data.id);
    json(response, 400, {
      error: 'Não foi possível salvar as fotos no Storage.',
      photos_error: uploadErrors,
    });
    return;
  }

  if (photoRows.length) {
    const { error: photosError } = await admin.from('inspection_photos').insert(photoRows);
    if (photosError) {
      await markScheduleCompleted(admin, scheduleId, userData.user.id, data.id, now);
      await broadcastAdminEvent(admin, 'inspection:upsert', { id: data.id, isNew: true });
      if (scheduleId) await broadcastAdminEvent(admin, 'schedule:upsert', { id: scheduleId });
      json(response, 200, {
        inspection: data,
        photos_error: {
          error: photosError.message,
          code: photosError.code,
          details: photosError.details,
          hint: photosError.hint,
        },
      });
      return;
    }
  }

  await markScheduleCompleted(admin, scheduleId, userData.user.id, data.id, now);
  await broadcastAdminEvent(admin, 'inspection:upsert', { id: data.id, isNew: true });
  if (scheduleId) await broadcastAdminEvent(admin, 'schedule:upsert', { id: scheduleId });

  json(response, 200, { inspection: data });
}
