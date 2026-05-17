import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIG_BUCKET = 'system-config';
const CONFIG_PATH = 'checklist-models.json';
const adminRoles = new Set(['admin']);

function json(response, status, body) {
  response.status(status).json(body);
}

function readToken(request, body = {}) {
  return String(body.access_token || request.headers.authorization || '')
    .replace('Bearer ', '')
    .trim();
}

function defaultItems() {
  return [
    { id: 'item-101', code: '1.01', label: 'Lateral direita do veículo', category: 'Inspeção externa', aggregator: 'Lateral direita', field_type: 'photo_required', required: true, active: true },
    { id: 'item-102', code: '1.02', label: 'Lateral esquerda do veículo', category: 'Inspeção externa', aggregator: 'Lateral esquerda', field_type: 'photo_required', required: true, active: true },
    { id: 'item-103', code: '1.03', label: 'Traseira da carreta', category: 'Inspeção externa', aggregator: 'Traseira da carreta', field_type: 'photo_required', required: true, active: true },
    { id: 'item-104', code: '1.04', label: 'Cabine do veículo', category: 'Inspeção interna', aggregator: 'Cabine do veículo', field_type: 'photo_required', required: true, active: true },
    { id: 'item-105', code: '1.05', label: 'Cones', category: 'Inspeção externa', aggregator: 'Cones', field_type: 'photo_optional', required: false, active: true },
    { id: 'item-106', code: '1.06', label: 'Calços', category: 'Inspeção externa', aggregator: 'Calços', field_type: 'photo_optional', required: false, active: true },
    { id: 'item-107', code: '1.07', label: 'Extintor', category: 'Inspeção externa', aggregator: 'Extintor', field_type: 'photo_optional', required: false, active: true },
    { id: 'item-108', code: '1.08', label: 'Placas de simbologia', category: 'Inspeção externa', aggregator: 'Placas de simbologia', field_type: 'photo_optional', required: false, active: true },
  ];
}

function defaultStatuses() {
  return [
    { id: 'pending', label: 'Pendente', color: '#f59e0b', order: 1, active: true },
    { id: 'in_review', label: 'Em análise', color: '#0b74de', order: 2, active: true },
    { id: 'approved', label: 'Aprovada', color: '#0f9f5f', order: 3, active: true },
    { id: 'rejected', label: 'Reprovada', color: '#d92d20', order: 4, active: true },
    { id: 'finished', label: 'Finalizada', color: '#475467', order: 5, active: true },
  ];
}

function defaultPermissions(createRoles = ['admin']) {
  return {
    create: createRoles,
    approve: ['admin'],
    view: ['admin', ...createRoles],
    edit: ['admin'],
    delete: ['admin'],
    notify: ['admin'],
  };
}

function defaultCategories() {
  return [
    { id: 'autocheck', name: 'Autocheck', icon: 'user-check', color: '#0f9f5f', pdf_model_id: 'pdf-autocheck', flow: 'autocheck', destination: 'autocheck', sort_order: 1, active: true, permissions: defaultPermissions(['driver']), statuses: defaultStatuses() },
    { id: 'schedules', name: 'Agendamentos', icon: 'calendar-days', color: '#0b74de', pdf_model_id: 'pdf-agendamentos', flow: 'schedule', destination: 'schedules', sort_order: 2, active: true, permissions: defaultPermissions(['driver', 'inspector']), statuses: defaultStatuses() },
    { id: 'aggregates', name: 'Vistoria Agregados', icon: 'clipboard-check', color: '#f59e0b', pdf_model_id: 'pdf-agregados', flow: 'inspection', destination: 'inspector', sort_order: 3, active: true, permissions: defaultPermissions(['inspector']), statuses: defaultStatuses() },
  ];
}

function defaultPdfModels() {
  return [
    {
      id: 'pdf-autocheck',
      name: 'PDF Autocheck',
      active: true,
      used_by_history: false,
      pdf: defaultPdfConfig('AUTOCHECK MATRIZ'),
    },
    {
      id: 'pdf-agendamentos',
      name: 'PDF Agendamentos',
      active: true,
      used_by_history: false,
      pdf: defaultPdfConfig('VISTORIA AGENDADA'),
    },
    {
      id: 'pdf-agregados',
      name: 'PDF Vistoria Agregados',
      active: true,
      used_by_history: false,
      pdf: defaultPdfConfig('VISTORIA AGREGADOS'),
    },
  ];
}

function defaultPdfConfig(subtitle = 'AUTOCHECK MATRIZ') {
  return {
    title: 'D-OLHO NA SEGURANÇA - CHECKLIST',
    subtitle,
    code: '',
    unit: 'Matriz',
    frequency: 'A cada vistoria',
    company: 'Express One Pomuceno',
    logo_url: '/logo-en.png',
    primary_color: '#0b74de',
    footer: 'Relatório gerado pelo sistema Vistorias | EN',
    object_label: 'Motorista',
    signature_label: 'ASSINATURA DO VISTORIADOR',
    table_model: 'standard',
    default_text: '',
    show_annexes: true,
    show_observations: true,
    show_auditor: true,
  };
}

function defaultVersion(modelId = 'autocheck-matriz') {
  return {
    id: `${modelId}-v1`,
    version: 1,
    active: true,
    created_at: new Date().toISOString(),
    pdf: defaultPdfConfig(),
    items: defaultItems(),
  };
}

function defaultConfig() {
  return {
    updated_at: new Date().toISOString(),
    categories: defaultCategories(),
    pdf_models: defaultPdfModels(),
    models: [{
      id: 'autocheck-matriz',
      name: 'Autocheck Matriz',
      description: 'Modelo padrão do checklist atual.',
      category_id: 'autocheck',
      active: true,
      current_version_id: 'autocheck-matriz-v1',
      versions: [defaultVersion('autocheck-matriz')],
    }],
  };
}

function activeVersion(model) {
  return model?.versions?.find((version) => version.id === model.current_version_id)
    || model?.versions?.find((version) => version.active)
    || model?.versions?.[model.versions.length - 1]
    || null;
}

function publicConfig(config) {
  const categories = config.categories || defaultCategories();
  const pdfModels = config.pdf_models || defaultPdfModels();
  return {
    ...config,
    categories: categories.filter((category) => category.active !== false),
    pdf_models: pdfModels.filter((model) => model.active !== false),
    models: (config.models || []).filter((model) => model.active !== false).map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description || '',
      category_id: model.category_id || categories[0]?.id || 'autocheck',
      active: model.active !== false,
      current_version_id: model.current_version_id,
      current_version: activeVersion(model),
    })),
  };
}

async function client() {
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

async function ensureBucket(admin) {
  const { data: buckets } = await admin.storage.listBuckets();
  if (!(buckets || []).some((bucket) => bucket.name === CONFIG_BUCKET)) {
    await admin.storage.createBucket(CONFIG_BUCKET, { public: false });
  }
}

async function loadConfig(admin) {
  await ensureBucket(admin);
  const { data, error } = await admin.storage.from(CONFIG_BUCKET).download(CONFIG_PATH);
  if (error || !data) {
    const config = defaultConfig();
    await saveConfig(admin, config);
    return config;
  }
  try {
    const parsed = JSON.parse(await data.text());
    const defaults = defaultConfig();
    const pdfModels = parsed.pdf_models?.length ? parsed.pdf_models.map(normalizePdfModel) : defaults.pdf_models;
    const categories = (parsed.categories?.length ? parsed.categories : defaults.categories)
      .filter((category) => String(category?.name || '').trim())
      .map((category) => normalizeCategory(category, category, pdfModels))
      .map((category) => (
        category.id === 'aggregates' && category.name === 'Vistorias de Agregados'
          ? { ...category, name: 'Vistoria Agregados', slug: 'vistoria-agregados' }
          : category
      ));
    const shouldSaveCategories = (parsed.categories || []).length !== categories.length
      || categories.some((category, index) => category.name !== parsed.categories?.[index]?.name);
    if (shouldSaveCategories) {
      await saveConfig(admin, { ...defaults, ...parsed, categories });
    }
    return {
      ...defaults,
      ...parsed,
      pdf_models: pdfModels,
      categories,
      models: parsed.models?.length ? parsed.models.map((model) => ({
        ...model,
        category_id: model.category_id || defaults.models[0].category_id,
      })) : defaults.models,
    };
  } catch {
    return defaultConfig();
  }
}

async function saveConfig(admin, config) {
  await ensureBucket(admin);
  const body = JSON.stringify({ ...config, updated_at: new Date().toISOString() }, null, 2);
  const { error } = await admin.storage.from(CONFIG_BUCKET).upload(CONFIG_PATH, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
}

async function authorize(admin, request, response, body, requireAdmin = false) {
  const bearer = readToken(request, body);
  if (!bearer) {
    json(response, 401, { error: 'Token de autorização ausente.' });
    return null;
  }
  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  if (userError || !userData?.user) {
    json(response, 401, { error: 'Token de autorização inválido.' });
    return null;
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('access_role, active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.active === false || (requireAdmin && !adminRoles.has(profile?.access_role))) {
    json(response, 403, { error: 'Usuário sem permissão para modelos de checklist.' });
    return null;
  }
  return { user: userData.user, profile };
}

function normalizeItem(item, index) {
  return {
    id: item.id || `item-${Date.now()}-${index}`,
    code: String(item.code || '').trim() || `${index + 1}`,
    label: String(item.label || item.name || '').trim() || 'Novo item',
    category: String(item.category || '').trim() || 'Geral',
    aggregator: String(item.aggregator || item.label || '').trim() || 'Geral',
    field_type: item.field_type || 'standard',
    required: Boolean(item.required),
    active: item.active !== false,
    help_text: String(item.help_text || '').trim(),
  };
}

function normalizeRoleList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .length ? String(value || '').split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

function normalizeStatus(status, index) {
  return {
    id: status.id || String(status.label || `status-${index + 1}`).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `status-${index + 1}`,
    label: String(status.label || '').trim() || 'Novo status',
    color: status.color || '#0b74de',
    order: Number(status.order) || index + 1,
    active: status.active !== false,
  };
}

function normalizePdfModel(input, previous) {
  const cleanName = String(input.name || previous?.name || '').trim().replace(/\s+/g, ' ');
  if (!cleanName) throw new Error('Informe o nome do modelo de PDF.');
  const pdf = { ...defaultPdfConfig(), ...(previous?.pdf || {}), ...(input.pdf || {}) };
  return {
    id: input.id || previous?.id || slugify(cleanName) || `pdf-${Date.now()}`,
    name: cleanName,
    active: input.active !== false,
    used_by_history: Boolean(input.used_by_history || previous?.used_by_history),
    created_at: previous?.created_at || input.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pdf,
  };
}

function normalizeAppField(field, index) {
  return {
    id: field.id || `app-field-${Date.now()}-${index}`,
    label: String(field.label || field.name || '').trim() || 'Campo',
    field_type: field.field_type || 'text',
    active: field.active !== false,
    required: Boolean(field.required),
    show_in_app: field.show_in_app !== false,
    show_in_pdf: field.show_in_pdf !== false,
    show_in_panel: field.show_in_panel !== false,
    placeholder: String(field.placeholder || '').trim(),
    help_text: String(field.help_text || '').trim(),
    order: Number(field.order) || index + 1,
  };
}

function normalizePhotoField(field, index) {
  const label = String(field.label || field.name || '').trim() || 'Foto';
  const minPhotos = Math.max(0, Number(field.min_photos) || (field.required ? 1 : 0));
  const maxPhotos = Math.max(1, Number(field.max_photos) || (field.evidence_type === 'multiple' ? Math.max(2, minPhotos) : 1));
  return {
    id: field.id || `photo-${Date.now()}-${index}`,
    code: String(field.code || '').trim() || `A.${String(index + 1).padStart(2, '0')}`,
    label,
    evidence_type: field.evidence_type || (maxPhotos > 1 ? 'multiple' : 'single'),
    field_type: field.required ? 'photo_required' : 'photo_optional',
    required: Boolean(field.required),
    min_photos: minPhotos,
    max_photos: maxPhotos,
    show_in_pdf: field.show_in_pdf !== false,
    show_in_panel: field.show_in_panel !== false,
    allow_observation: Boolean(field.allow_observation),
    show_conformity: field.show_conformity !== false,
    require_nonconformity_note: field.require_nonconformity_note !== false,
    auto_compress: field.auto_compress !== false,
    auto_open_camera: Boolean(field.auto_open_camera),
    order: Number(field.order) || index + 1,
    active: field.active !== false,
  };
}

function normalizeTableItem(item, index) {
  const minPhotos = Math.max(0, Number(item.min_photos) || (item.requires_photo ? 1 : 0));
  const maxPhotos = Math.max(1, Number(item.max_photos) || Math.max(1, minPhotos));
  return {
    id: item.id || `table-item-${Date.now()}-${index}`,
    code: String(item.code || '').trim() || `${index + 1}`,
    label: String(item.label || item.requirement || item.name || '').trim() || 'Requisito',
    category: String(item.category || '').trim() || 'Vistoria Agregados',
    aggregator: String(item.aggregator || item.category || '').trim() || 'Vistoria Agregados',
    field_type: 'applicable_item',
    points: Number(item.points) || 0,
    required: Boolean(item.required),
    requires_photo: Boolean(item.requires_photo),
    min_photos: minPhotos,
    max_photos: maxPhotos,
    allow_multiple: item.allow_multiple !== false && maxPhotos > 1,
    default_answer: ['applicable', 'na', 'Aplicável', 'N/A'].includes(item.default_answer) ? item.default_answer : 'na',
    attachment_code: String(item.attachment_code || '').trim(),
    requires_observation: Boolean(item.requires_observation || item.allow_observation),
    allow_observation: Boolean(item.allow_observation || item.requires_observation),
    show_in_app: item.show_in_app !== false,
    show_in_pdf: item.show_in_pdf !== false,
    show_in_panel: item.show_in_panel !== false,
    order: Number(item.order) || index + 1,
    active: item.active !== false,
  };
}

function slugify(value, fallback = '') {
  return String(value || fallback || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCategory(input, previous, pdfModels = defaultPdfModels()) {
  if (Object.prototype.hasOwnProperty.call(input, 'name') && !String(input.name || '').trim()) throw new Error('Informe o nome da categoria.');
  if (Object.prototype.hasOwnProperty.call(input, 'icon') && !String(input.icon || '').trim()) throw new Error('Informe o ícone da categoria.');
  if (Object.prototype.hasOwnProperty.call(input, 'color') && !String(input.color || '').trim()) throw new Error('Informe a cor da categoria.');
  if (Object.prototype.hasOwnProperty.call(input, 'flow') && !String(input.flow || '').trim()) throw new Error('Selecione o fluxo da categoria.');
  if (Object.prototype.hasOwnProperty.call(input, 'destination') && !String(input.destination || '').trim()) throw new Error('Selecione o destino operacional da categoria.');
  if (Object.prototype.hasOwnProperty.call(input, 'pdf_model_id') && !String(input.pdf_model_id || '').trim()) throw new Error('Selecione o modelo de PDF do tipo de vistoria.');
  const cleanName = String(input.name || previous?.name || '').trim().replace(/\s+/g, ' ');
  const cleanIcon = String(input.icon || previous?.icon || '').trim();
  const cleanColor = String(input.color || previous?.color || '').trim();
  const cleanFlow = String(input.flow || previous?.flow || '').trim();
  const cleanDestination = String(input.destination || previous?.destination || '').trim();
  const cleanPdfModelId = String(input.pdf_model_id || previous?.pdf_model_id || pdfModels?.[0]?.id || '').trim();
  if (!cleanName) throw new Error('Informe o nome da categoria.');
  if (!cleanIcon) throw new Error('Informe o ícone da categoria.');
  if (!cleanColor) throw new Error('Informe a cor da categoria.');
  if (!cleanFlow) throw new Error('Selecione o fluxo da categoria.');
  if (!cleanDestination) throw new Error('Selecione o destino operacional da categoria.');
  if (!cleanPdfModelId) throw new Error('Selecione o modelo de PDF do tipo de vistoria.');
  if (!(pdfModels || []).some((model) => model.id === cleanPdfModelId)) throw new Error('Modelo de PDF vinculado não encontrado.');
  const id = slugify(input.id || previous?.id || cleanName) || `category-${Date.now()}`;
  const permissions = {
    ...defaultPermissions(),
    ...(previous?.permissions || {}),
    ...(input.permissions || {}),
  };
  if (!normalizeRoleList(permissions.create, []).length) throw new Error('Selecione quem pode criar este tipo de vistoria.');

  return {
    id,
    slug: slugify(cleanName),
    name: cleanName,
    icon: cleanIcon,
    color: cleanColor,
    pdf_model_id: cleanPdfModelId,
    flow: cleanFlow,
    destination: cleanDestination,
    sort_order: Number(input.sort_order || previous?.sort_order || 999),
    pdf: {
      ...(previous?.pdf || {}),
      ...(input.pdf || {}),
    },
    app_fields: (Object.prototype.hasOwnProperty.call(input, 'app_fields') ? input.app_fields || [] : previous?.app_fields || []).map(normalizeAppField),
    photo_fields: (Object.prototype.hasOwnProperty.call(input, 'photo_fields') ? input.photo_fields || [] : previous?.photo_fields || []).map(normalizePhotoField),
    table_items: (Object.prototype.hasOwnProperty.call(input, 'table_items') ? input.table_items || [] : previous?.table_items || []).map(normalizeTableItem),
    active: input.active !== false,
    permissions: {
      create: normalizeRoleList(permissions.create, ['admin']),
      approve: normalizeRoleList(permissions.approve, ['admin']),
      view: normalizeRoleList(permissions.view, ['admin']),
      edit: normalizeRoleList(permissions.edit, ['admin']),
      delete: normalizeRoleList(permissions.delete, ['admin']),
      notify: normalizeRoleList(permissions.notify, ['admin']),
    },
    statuses: (input.statuses?.length ? input.statuses : previous?.statuses || defaultStatuses()).map(normalizeStatus),
  };
}

function normalizeModel(input, previous, categories = defaultCategories()) {
  const modelId = input.id || previous?.id || `model-${Date.now()}`;
  const previousVersion = activeVersion(previous) || defaultVersion(modelId);
  const validCategoryIds = new Set((categories || []).map((category) => category.id));
  const categoryId = input.category_id || previous?.category_id || categories?.[0]?.id || 'autocheck';
  if (!validCategoryIds.has(categoryId)) {
    throw new Error('Selecione uma categoria valida para o modelo.');
  }
  const nextVersionNumber = previous ? Math.max(...(previous.versions || []).map((version) => Number(version.version) || 0), 0) + 1 : 1;
  const version = {
    id: `${modelId}-v${nextVersionNumber}`,
    version: nextVersionNumber,
    active: true,
    created_at: new Date().toISOString(),
    pdf: {
      ...(previousVersion.pdf || {}),
      ...(input.pdf || {}),
    },
    items: (input.items || previousVersion.items || []).map(normalizeItem),
  };

  return {
    id: modelId,
    name: String(input.name || previous?.name || 'Novo modelo').trim(),
    description: String(input.description || previous?.description || '').trim(),
    category_id: categoryId,
    active: input.active !== false,
    current_version_id: version.id,
    versions: [
      ...(previous?.versions || []).map((item) => ({ ...item, active: false })),
      version,
    ],
  };
}

function modelForCategory(models, categoryId, modelId) {
  return (models || []).find((item) => modelId && item.id === modelId)
    || (models || []).find((item) => item.category_id === categoryId && item.active !== false)
    || (models || []).find((item) => item.active !== false)
    || defaultConfig().models[0];
}

function pdfForCategory(config, category, version) {
  const pdfModels = config.pdf_models || defaultPdfModels();
  const linked = pdfModels.find((model) => model.id === category?.pdf_model_id && model.active !== false)
    || pdfModels.find((model) => model.id === category?.pdf_model_id)
    || pdfModels.find((model) => model.active !== false);
  return {
    ...(linked?.pdf || version?.pdf || defaultPdfConfig()),
    ...(category?.pdf || {}),
    pdf_model_id: linked?.id || category?.pdf_model_id || '',
  };
}

function itemsForCategory(category, version) {
  const tableItems = (category?.table_items || []).filter((item) => item.active !== false && item.show_in_app !== false);
  const photoItems = (category?.photo_fields || []).filter((item) => item.active !== false);
  if (!tableItems.length && !photoItems.length) return version?.items || defaultItems();
  const mappedTableItems = tableItems.map((item) => ({
    ...item,
    label: item.label,
    field_type: item.field_type,
    required: item.required,
    active: item.active,
  }));
  const mappedPhotoItems = photoItems.map((item) => ({
    ...item,
    category: 'Evidências fotográficas',
    aggregator: item.label,
    field_type: item.required ? 'photo_required' : 'photo_optional',
    required: item.required,
  }));
  return [...mappedTableItems, ...mappedPhotoItems]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id || candidate.code === item.code) === index)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
}

function appFieldsForCategory(category) {
  return (category?.app_fields || [])
    .filter((item) => item.active !== false && item.show_in_app !== false)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
}

function photoFieldsForCategory(category) {
  return (category?.photo_fields || [])
    .filter((item) => item.active !== false)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
}

function applicableItemsForCategory(category) {
  return (category?.table_items || [])
    .filter((item) => item.active !== false && item.show_in_app !== false)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
}

export default async function handler(request, response) {
  if (!supabaseUrl || !serviceKey) {
    json(response, 500, { error: 'Credenciais do Supabase não configuradas.' });
    return;
  }
  if (!['GET', 'POST'].includes(request.method)) {
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }

  const admin = await client();
  const body = request.body || {};
  const query = request.query || {};
  const action = body.action || (query.models === 'active' ? 'get-active' : query.action) || 'list';
  const requireAdmin = !['list', 'get-active'].includes(action);
  const auth = await authorize(admin, request, response, body, requireAdmin);
  if (!auth) return;

  try {
    const config = await loadConfig(admin);

    if (action === 'list') {
      const normalizedConfig = {
        ...config,
        categories: config.categories || defaultCategories(),
      };
      json(response, 200, adminRoles.has(auth.profile?.access_role) ? normalizedConfig : publicConfig(normalizedConfig));
      return;
    }

    if (action === 'get-active') {
      const categories = config.categories || defaultCategories();
      const requestedCategoryId = body.category_id || query.category_id;
      const requestedModelId = body.model_id || query.model_id;
      const model = modelForCategory(config.models, requestedCategoryId, requestedModelId);
      const category = categories.find((item) => item.id === requestedCategoryId) || categories.find((item) => item.id === model?.category_id) || null;
      const version = activeVersion(model);
      const pdf = pdfForCategory(config, category, version);
      const items = itemsForCategory(category, version);
      const app_fields = appFieldsForCategory(category);
      const photo_fields = photoFieldsForCategory(category);
      const applicable_items = applicableItemsForCategory(category);
      json(response, 200, {
        model: { ...model, category_id: category?.id || model?.category_id, current_version: { ...version, pdf, items, app_fields, photo_fields, applicable_items }, category },
        categories: categories.filter((item) => item.active !== false),
        pdf_models: (config.pdf_models || defaultPdfModels()).filter((item) => item.active !== false),
      });
      return;
    }

    if (action === 'save') {
      const categories = config.categories || defaultCategories();
      const previous = (config.models || []).find((model) => model.id === body.model?.id);
      const nextModel = normalizeModel(body.model || {}, previous, categories);
      const models = [
        nextModel,
        ...(config.models || []).filter((model) => model.id !== nextModel.id),
      ];
      await saveConfig(admin, { ...config, models });
      json(response, 200, { model: nextModel });
      return;
    }

    if (action === 'duplicate') {
      const source = (config.models || []).find((model) => model.id === body.id);
      if (!source) throw new Error('Modelo não encontrado.');
      const version = activeVersion(source) || defaultVersion(source.id);
      const copyId = `model-${Date.now()}`;
      const copy = normalizeModel({
        id: copyId,
        name: `${source.name} - Cópia`,
        description: source.description,
        category_id: source.category_id || 'autocheck',
        pdf: version.pdf,
        items: version.items,
      }, null, config.categories || defaultCategories());
      await saveConfig(admin, { ...config, models: [copy, ...(config.models || [])] });
      json(response, 200, { model: copy });
      return;
    }

    if (action === 'set-active') {
      const models = (config.models || []).map((model) => (
        model.id === body.id ? { ...model, active: body.active !== false } : model
      ));
      await saveConfig(admin, { ...config, models });
      json(response, 200, { ok: true });
      return;
    }

    if (action === 'save-pdf-model') {
      const baseModels = config.pdf_models || defaultPdfModels();
      const previous = baseModels.find((model) => model.id === body.pdf_model?.id);
      const nextModel = normalizePdfModel(body.pdf_model || {}, previous);
      const duplicate = baseModels.some((model) => (
        model.id !== nextModel.id && slugify(model.name) === slugify(nextModel.name)
      ));
      if (duplicate) throw new Error('Ja existe um modelo de PDF com este nome.');
      const pdf_models = [nextModel, ...baseModels.filter((model) => model.id !== nextModel.id)];
      await saveConfig(admin, { ...config, pdf_models });
      json(response, 200, { pdf_model: nextModel });
      return;
    }

    if (action === 'duplicate-pdf-model') {
      const source = (config.pdf_models || defaultPdfModels()).find((model) => model.id === body.id);
      if (!source) throw new Error('Modelo de PDF não encontrado.');
      const copy = normalizePdfModel({
        id: `pdf-${Date.now()}`,
        name: `${source.name} - Cópia`,
        active: true,
        pdf: source.pdf,
      });
      await saveConfig(admin, { ...config, pdf_models: [copy, ...(config.pdf_models || defaultPdfModels())] });
      json(response, 200, { pdf_model: copy });
      return;
    }

    if (action === 'set-pdf-model-active') {
      const pdf_models = (config.pdf_models || defaultPdfModels()).map((model) => (
        model.id === body.id ? { ...model, active: body.active !== false } : model
      ));
      await saveConfig(admin, { ...config, pdf_models });
      json(response, 200, { ok: true });
      return;
    }

    if (action === 'delete-pdf-model') {
      const inUse = (config.categories || defaultCategories()).some((category) => category.pdf_model_id === body.id);
      if (inUse) throw new Error('Este modelo de PDF está vinculado a um tipo de vistoria. Inative ou remova o vínculo antes de excluir.');
      const pdf_models = (config.pdf_models || defaultPdfModels()).filter((model) => model.id !== body.id);
      await saveConfig(admin, { ...config, pdf_models });
      json(response, 200, { ok: true });
      return;
    }

    if (action === 'save-category') {
      const baseCategories = config.categories || defaultCategories();
      const previous = baseCategories.find((category) => category.id === body.category?.id);
      const nextCategory = normalizeCategory(body.category || {}, previous, config.pdf_models || defaultPdfModels());
      const duplicate = baseCategories.some((category) => (
        category.id !== nextCategory.id
        && slugify(category.name || category.slug) === nextCategory.slug
      ));
      if (duplicate) throw new Error('Ja existe uma categoria com este nome.');
      const categories = [
        nextCategory,
        ...baseCategories.filter((category) => category.id !== nextCategory.id),
      ];
      await saveConfig(admin, { ...config, categories });
      json(response, 200, { category: nextCategory });
      return;
    }

    if (action === 'set-category-active') {
      const categories = (config.categories || defaultCategories()).map((category) => (
        category.id === body.id ? { ...category, active: body.active !== false } : category
      ));
      await saveConfig(admin, { ...config, categories });
      json(response, 200, { ok: true });
      return;
    }

    if (action === 'delete-category') {
      const inUse = (config.models || []).some((model) => model.category_id === body.id);
      if (inUse) throw new Error('Esta categoria ja esta em uso por um modelo. Inative a categoria em vez de excluir.');
      const { data: inspections } = await admin.from('inspections').select('id,type,applicable').limit(1000);
      const usedByInspection = (inspections || []).some((inspection) => {
        const categoryId = inspection.applicable?.__checklist_model?.category_id;
        if (categoryId === body.id) return true;
        const type = String(inspection.type || '').toLowerCase();
        return (body.id === 'autocheck' && type.includes('autocheck'))
          || (body.id === 'schedules' && type.includes('agendada'))
          || (body.id === 'aggregates' && (type.includes('checklist') || type.includes('agregados')));
      });
      if (usedByInspection) throw new Error('Este tipo de vistoria já possui vistorias no histórico. Inative em vez de excluir.');
      const categories = (config.categories || defaultCategories()).filter((category) => category.id !== body.id);
      await saveConfig(admin, { ...config, categories });
      json(response, 200, { ok: true });
      return;
    }

    json(response, 400, { error: 'Acao invalida.' });
  } catch (error) {
    json(response, 400, { error: error.message || 'Não foi possível processar os modelos.' });
  }
}
