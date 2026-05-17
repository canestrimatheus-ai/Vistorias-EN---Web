import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminRoles = new Set(['admin']);
const inspectorRoles = new Set(['app', 'inspector']);
const scheduleStatuses = new Set(['scheduled', 'assigned', 'completed', 'cancelled']);
const ADMIN_REALTIME_CHANNEL = 'admin-panel-live';
const INVALID_PLATE_MESSAGE = 'Placa inválida. Verifique e tente novamente.';

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
  return String(request.body?.access_token || request.headers.authorization || '')
    .replace('Bearer ', '')
    .trim();
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanRejectionReason(value) {
  return cleanText(value).replace(/^Motivo da reprovação:\s*/i, '').trim();
}

function normalizePlate(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function cleanPlate(value) {
  const clean = normalizePlate(value);
  if (/^[A-Z]{3}\d{4}$/.test(clean)) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  return clean;
}

function isValidPlate(value) {
  const clean = normalizePlate(value);
  return /^[A-Z]{3}\d{4}$/.test(clean) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(clean);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

async function sendPushToUser(admin, recipientUserId, message) {
  if (!recipientUserId) return null;
  const { data: authUser, error } = await admin.auth.admin.getUserById(recipientUserId);
  const metadata = {
    ...(authUser?.user?.user_metadata || {}),
    ...(authUser?.user?.app_metadata || {}),
  };
  const token = String(metadata.expo_push_token || '');
  if (error || (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken['))) {
    return null;
  }

  const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      priority: 'high',
      ...message,
    }),
  });

  return pushResponse.ok ? pushResponse.json() : null;
}

async function sendDecisionPush(admin, inspection, recipientUserId, rejectionReason = '') {
  if (!['approved', 'rejected'].includes(inspection.status) || !recipientUserId) return null;

  const isRejected = inspection.status === 'rejected';
  const title = isRejected ? 'Vistoria reprovada' : 'Vistoria aprovada';
  const body = isRejected
    ? `Sua vistoria foi reprovada. Motivo: ${rejectionReason || cleanRejectionReason(inspection.observations)}.`
    : 'Sua vistoria foi conclu?da e aprovada.';

  return sendPushToUser(admin, recipientUserId, {
    title,
    body,
    channelId: 'alertas-vistoria-v2',
    data: {
      inspectionId: inspection.id,
      noticeId: `${inspection.id}:${inspection.status}`,
      status: inspection.status,
      type: 'decision',
    },
  });
}

async function sendScheduleAssignmentPush(admin, schedule) {
  if (!schedule?.assigned_inspector_id) return null;
  const plate = [schedule.truck_plate, schedule.trailer_plate].filter(Boolean).join(' / ') || 'sem placa';
  const date = schedule.scheduled_date ? schedule.scheduled_date.split('-').reverse().join('/') : 'data a definir';

  return sendPushToUser(admin, schedule.assigned_inspector_id, {
    title: 'Nova vistoria direcionada',
    body: `Voc? recebeu uma vistoria para realizar: ${plate} em ${date}.`,
    channelId: 'alertas-vistoria-v2',
    data: {
      scheduleId: schedule.id,
      noticeId: `schedule:${schedule.id}:assigned`,
      status: schedule.status,
      type: 'schedule_assigned',
    },
  });
}
function createAdminClient() {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

async function broadcastAdminEvent(admin, event, payload) {
  try {
    await admin.channel(ADMIN_REALTIME_CHANNEL).send({
      type: 'broadcast',
      event,
      payload,
    });
  } catch {
    // Best effort: never block the saved action because no panel is connected.
  }
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

  const admin = createAdminClient();
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
    json(response, 403, { error: 'Somente administradores web ativos podem acessar vistorias.' });
    return null;
  }

  return admin;
}

async function getScheduleAuth(request, response) {
  if (!supabaseUrl || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas.' });
    return null;
  }

  const bearer = readToken(request);
  if (!bearer) {
    json(response, 401, { error: 'Token de autorização ausente.' });
    return null;
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  if (userError || !userData?.user) {
    json(response, 401, { error: 'Token de autorização inválido.' });
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || profile?.active === false || !profile?.access_role) {
    json(response, 403, { error: 'Usuário sem permissão para acessar agendamentos.' });
    return null;
  }

  return { admin, user: userData.user, profile };
}

async function enrichSchedules(admin, schedules) {
  const userIds = [...new Set((schedules || [])
    .flatMap((schedule) => [schedule.driver_user_id, schedule.assigned_inspector_id])
    .filter(Boolean))];
  const { data: profileData } = userIds.length
    ? await admin.from('profiles').select('id, full_name, email, access_role').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profileData || []).map((profile) => [profile.id, profile]));

  return (schedules || []).map((schedule) => ({
    ...schedule,
    driver_profile_name: profileMap.get(schedule.driver_user_id)?.full_name || '',
    driver_profile_email: profileMap.get(schedule.driver_user_id)?.email || '',
    inspector_name: profileMap.get(schedule.assigned_inspector_id)?.full_name || '',
    inspector_email: profileMap.get(schedule.assigned_inspector_id)?.email || '',
  }));
}

async function enrichInspections(admin, inspections) {
  const userIds = [...new Set((inspections || []).map((inspection) => inspection.user_id).filter(Boolean))];
  const { data: profileData } = userIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profileData || []).map((profile) => [profile.id, profile]));

  return Promise.all((inspections || []).map(async (inspection) => ({
    ...inspection,
    inspector_name: profileMap.get(inspection.user_id)?.full_name || profileMap.get(inspection.user_id)?.email || '',
    inspector_email: profileMap.get(inspection.user_id)?.email || '',
    inspection_photos: await Promise.all((inspection.inspection_photos || []).map(async (photo) => {
      if (!photo.storage_path) return photo;
      const { data: signedUrl } = await admin.storage
        .from('inspection-photos')
        .createSignedUrl(photo.storage_path, 60 * 60);
      return { ...photo, public_url: signedUrl?.signedUrl || '' };
    })),
  })));
}

async function handleScheduleAction(request, response) {
  const auth = await getScheduleAuth(request, response);
  if (!auth) return true;

  const { admin, user, profile } = auth;
  const body = request.body || {};
  const canManage = adminRoles.has(profile.access_role);

  try {
    if (body.action === 'schedule-list') {
      let query = admin
        .from('inspection_schedules')
        .select('*')
        .order('scheduled_date', { ascending: true })
        .order('created_at', { ascending: false });
      if (profile.access_role === 'driver') query = query.eq('driver_user_id', user.id);
      else if (inspectorRoles.has(profile.access_role)) query = query.eq('assigned_inspector_id', user.id);
      else if (!canManage) query = query.eq('driver_user_id', '00000000-0000-0000-0000-000000000000');
      const { data, error } = await query;
      if (error) throw error;
      json(response, 200, { schedules: await enrichSchedules(admin, data || []) });
      return true;
    }

    if (body.action === 'schedule-get') {
      if (!body.id) throw new Error('Agendamento obrigatório.');
      let query = admin
        .from('inspection_schedules')
        .select('*')
        .eq('id', body.id);
      if (profile.access_role === 'driver') query = query.eq('driver_user_id', user.id);
      else if (inspectorRoles.has(profile.access_role)) query = query.eq('assigned_inspector_id', user.id);
      else if (!canManage) query = query.eq('driver_user_id', '00000000-0000-0000-0000-000000000000');
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      const [schedule] = await enrichSchedules(admin, data ? [data] : []);
      json(response, 200, { schedule: schedule || null });
      return true;
    }

    if (body.action === 'create') {
      const payload = {
        driver_user_id: canManage ? (body.driver_user_id || null) : user.id,
        driver_name: cleanText(body.driver_name || profile.full_name || user.email),
        truck_plate: cleanPlate(body.truck_plate),
        trailer_plate: cleanPlate(body.trailer_plate),
        scheduled_date: cleanText(body.scheduled_date),
        scheduled_time: cleanText(body.scheduled_time) || null,
        notes: cleanText(body.notes) || null,
        status: canManage && body.assigned_inspector_id ? 'assigned' : 'scheduled',
        assigned_inspector_id: canManage && body.assigned_inspector_id ? body.assigned_inspector_id : null,
      };
      if (!payload.driver_name || !payload.truck_plate || !payload.trailer_plate || !isDate(payload.scheduled_date)) {
        throw new Error('Motorista, placas e data da vistoria são obrigatórios.');
      }
      if (!isValidPlate(payload.truck_plate) || !isValidPlate(payload.trailer_plate)) {
        throw new Error(INVALID_PLATE_MESSAGE);
      }
      const { data, error } = await admin.from('inspection_schedules').insert(payload).select().single();
      if (error) throw error;
      let push = null;
      if (data.assigned_inspector_id) {
        try {
          push = await sendScheduleAssignmentPush(admin, data);
        } catch (pushError) {
          push = { error: pushError.message };
        }
      }
      await broadcastAdminEvent(admin, 'schedule:upsert', { id: data.id, isNew: true });
      json(response, 200, { schedule: data, push });
      return true;
    }

    if (body.action === 'update') {
      if (!canManage) throw new Error('Somente administradores podem atualizar agendamentos.');
      if (!body.id) throw new Error('Agendamento obrigatório.');
      const update = { updated_at: new Date().toISOString() };
      if ('assigned_inspector_id' in body) update.assigned_inspector_id = body.assigned_inspector_id || null;
      if ('driver_name' in body) update.driver_name = cleanText(body.driver_name);
      if ('truck_plate' in body) update.truck_plate = cleanPlate(body.truck_plate);
      if ('trailer_plate' in body) update.trailer_plate = cleanPlate(body.trailer_plate);
      if ('scheduled_date' in body) {
        if (!isDate(body.scheduled_date)) throw new Error('Data de agendamento inválida.');
        update.scheduled_date = cleanText(body.scheduled_date);
      }
      if ('scheduled_time' in body) update.scheduled_time = cleanText(body.scheduled_time) || null;
      if ('notes' in body) update.notes = cleanText(body.notes) || null;
      if ('status' in body) {
        if (!scheduleStatuses.has(body.status)) throw new Error('Status de agendamento inválido.');
        update.status = body.status;
      } else if ('assigned_inspector_id' in body) {
        update.status = body.assigned_inspector_id ? 'assigned' : 'scheduled';
      }
      if ((update.truck_plate && !isValidPlate(update.truck_plate)) || (update.trailer_plate && !isValidPlate(update.trailer_plate))) {
        throw new Error(INVALID_PLATE_MESSAGE);
      }
      const { data: previousSchedule } = await admin
        .from('inspection_schedules')
        .select('assigned_inspector_id,status')
        .eq('id', body.id)
        .maybeSingle();
      const { data, error } = await admin.from('inspection_schedules').update(update).eq('id', body.id).select().single();
      if (error) throw error;
      let push = null;
      const becameAssigned =
        data.assigned_inspector_id &&
        (data.assigned_inspector_id !== previousSchedule?.assigned_inspector_id ||
          (previousSchedule?.status !== 'assigned' && data.status === 'assigned'));
      if (becameAssigned) {
        try {
          push = await sendScheduleAssignmentPush(admin, data);
        } catch (pushError) {
          push = { error: pushError.message };
        }
      }
      await broadcastAdminEvent(admin, 'schedule:upsert', { id: data.id });
      json(response, 200, { schedule: data, push });
      return true;
    }

    if (body.action === 'delete') {
      if (!canManage) throw new Error('Somente administradores podem excluir agendamentos.');
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [body.id].filter(Boolean);
      if (!ids.length) throw new Error('Informe ao menos um agendamento.');
      const { error } = await admin.from('inspection_schedules').delete().in('id', ids);
      if (error) throw error;
      await broadcastAdminEvent(admin, 'schedule:delete', { ids });
      json(response, 200, { ok: true, deleted: ids.length });
      return true;
    }
  } catch (error) {
    json(response, 400, {
      error: error.message || 'Não foi possível processar o agendamento.',
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return true;
  }

  return false;
}

export default async function handler(request, response) {
  if (String(request.body?.action || '').startsWith('schedule-') || ['create', 'update', 'delete'].includes(request.body?.action)) {
    const handled = await handleScheduleAction(request, response);
    if (handled) return;
  }

  const admin = await getAdmin(request, response);
  if (!admin) return;

  if (request.method === 'POST' && request.body?.action === 'inspection-get') {
    const id = cleanText(request.body?.id);
    if (!id) {
      json(response, 400, { error: 'ID da vistoria obrigatório.' });
      return;
    }

    const { data, error } = await admin
      .from('inspections')
      .select('*, inspection_photos(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      json(response, 400, { error: error.message, code: error.code, details: error.details });
      return;
    }

    const [inspection] = await enrichInspections(admin, data ? [data] : []);
    json(response, 200, { inspection: inspection || null });
    return;
  }

  if (request.method === 'GET' || (request.method === 'POST' && request.body?.action === 'list')) {
    const { data, error } = await admin
      .from('inspections')
      .select('*, inspection_photos(*)')
      .order('created_at', { ascending: false });

    if (error) {
      json(response, 400, { error: error.message, code: error.code, details: error.details });
    } else {
      const inspections = await enrichInspections(admin, data || []);
      json(response, 200, { inspections });
    }
    return;
  }

  if (request.method === 'PATCH') {
    const { id, status } = request.body || {};
    const rejectionReason = cleanText(request.body?.rejection_reason);
    if (!id || !status) {
      json(response, 400, { error: 'ID e status da vistoria são obrigatórios.' });
      return;
    }

    if (!['approved', 'rejected'].includes(status)) {
      json(response, 400, { error: 'Status de vistoria inválido.' });
      return;
    }

    if (status === 'rejected' && !rejectionReason) {
      json(response, 400, { error: 'Informe o motivo da reprovação.' });
      return;
    }

    const updatePayload = { status };
    if (status === 'rejected') {
      updatePayload.observations = `Motivo da reprovação: ${rejectionReason}`;
    }

    const { data, error } = await admin
      .from('inspections')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      json(response, 400, { error: error.message, code: error.code, details: error.details });
    } else {
      let push = null;
      try {
        const { data: schedule } = await admin
          .from('inspection_schedules')
          .select('driver_user_id')
          .eq('inspection_id', data.id)
          .maybeSingle();
        const recipientUserId = schedule?.driver_user_id || data.user_id;
        push = await sendDecisionPush(admin, data, recipientUserId, rejectionReason);
      } catch (pushError) {
        push = { error: pushError.message };
      }
      await broadcastAdminEvent(admin, 'inspection:upsert', { id: data.id });
      json(response, 200, { inspection: data, push });
    }
    return;
  }

  if (request.method === 'DELETE') {
    const ids = Array.isArray(request.body?.ids)
      ? request.body.ids.filter(Boolean)
      : [request.body?.id].filter(Boolean);

    if (!ids.length) {
      json(response, 400, { error: 'Informe ao menos uma vistoria para excluir.' });
      return;
    }

    const { data: photos, error: photosLoadError } = await admin
      .from('inspection_photos')
      .select('inspection_id, storage_path')
      .in('inspection_id', ids);

    if (photosLoadError) {
      json(response, 400, { error: photosLoadError.message, code: photosLoadError.code, details: photosLoadError.details });
      return;
    }

    const storagePaths = (photos || []).map((photo) => photo.storage_path).filter(Boolean);
    if (storagePaths.length) {
      await admin.storage.from('inspection-photos').remove(storagePaths);
    }

    const { error: photoDeleteError } = await admin
      .from('inspection_photos')
      .delete()
      .in('inspection_id', ids);

    if (photoDeleteError) {
      json(response, 400, { error: photoDeleteError.message, code: photoDeleteError.code, details: photoDeleteError.details });
      return;
    }

    const { error: deleteError } = await admin
      .from('inspections')
      .delete()
      .in('id', ids);

    if (deleteError) {
      json(response, 400, { error: deleteError.message, code: deleteError.code, details: deleteError.details });
      return;
    }

    await broadcastAdminEvent(admin, 'inspection:delete', { ids });
    json(response, 200, { ok: true, deleted: ids.length });
    return;
  }

  json(response, 405, { error: 'Método não permitido.' });
}
