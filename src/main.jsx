import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Camera,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Home,
  Info,
  LogOut,
  Mail,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente.');
}

const AUTH_STORAGE_KEY = 'vistorias-web-auth-v3';
clearLegacyAuthStorage();

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const LOGO_URL = '/logo-en.png';
const REPORT_LOGO_URL = '/logo-en.png';
const HERO_IMAGE_URL = '/login-hero.jpeg';
const INITIAL_ADMIN_EMAIL = 'admin@expressonepomuceno.com.br';
const PROFILE_LOAD_TIMEOUT_MS = 8000;
const REALTIME_REFRESH_DEBOUNCE_MS = 1500;
const ADMIN_REALTIME_CHANNEL = 'admin-panel-live';
const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;
const ADMIN_ROLES = new Set(['admin']);
const INSPECTOR_ROLES = new Set(['app', 'inspector']);
const DRIVER_ROLE = 'driver';

function isAutocheckInspection(inspection) {
  return String(inspection?.type || '').toLowerCase().includes('autocheck');
}

function normalizeRouteKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function categoryViewId(categoryId) {
  return `category:${categoryId}`;
}

function inspectionCategoryInfo(inspection = {}) {
  const model = inspection.applicable?.__checklist_model || {};
  return {
    id: model.category_id || model.category?.id || '',
    name: model.category?.name || '',
    type: inspection.type || '',
  };
}

function inspectionMatchesCategory(inspection, category) {
  if (!category) return false;
  const info = inspectionCategoryInfo(inspection);
  if (info.id && info.id === category.id) return true;

  const keys = new Set([
    normalizeRouteKey(info.name),
    normalizeRouteKey(info.type),
  ].filter(Boolean));
  const categoryKeys = [
    category.id,
    category.slug,
    category.name,
  ].map(normalizeRouteKey).filter(Boolean);

  if (categoryKeys.some((key) => keys.has(key))) return true;
  if (category.id === 'autocheck') return isAutocheckInspection(inspection);
  if (category.id === 'aggregates') return !isAutocheckInspection(inspection) && !String(info.type || '').toLowerCase().includes('agendada');
  return false;
}

function normalizePlate(value = '') {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function formatPlate(value = '') {
  const clean = normalizePlate(value);
  if (/^[A-Z]{3}\d{4}$/.test(clean)) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  return clean;
}

function isValidPlate(value = '') {
  const clean = normalizePlate(value);
  return /^[A-Z]{3}\d{4}$/.test(clean) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(clean);
}

const requiredRows = [
  ['1.01', 'Lateral Direita do Veículo', '2-Inspeção Externa', 'Lateral Direita'],
  ['1.02', 'Lateral Esquerda do Veículo', '2-Inspeção Externa', 'Lateral Esquerda'],
  ['1.03', 'Traseira da Carreta', '2-Inspeção Externa', 'Traseira da Carreta'],
  ['1.04', 'Cabine do Veículo', '1-Inspeção Interna', 'Cabine do Veículo'],
];

const conditionalRows = [
  ['1.05', 'Cones', '2-Inspeção Externa', 'Cones'],
  ['1.06', 'Calços', '2-Inspeção Externa', 'Calços'],
  ['1.07', 'Extintor', '2-Inspeção Externa', 'Extintor'],
  ['1.08', 'Placas de Simbologia', '2-Inspeção Externa', 'Placas de Simbologia'],
];

const ROLE_OPTIONS = [
  { value: 'driver', label: 'Motorista' },
  { value: 'inspector', label: 'Vistoriador' },
  { value: 'app', label: 'App' },
  { value: 'admin', label: 'Administrador' },
];

const INSPECTION_ICON_OPTIONS = [
  { value: 'clipboard-check', label: 'Checklist', Icon: ClipboardCheck },
  { value: 'user-check', label: 'Motorista', Icon: UserCheck },
  { value: 'calendar-days', label: 'Agenda', Icon: CalendarDays },
  { value: 'camera', label: 'Fotos', Icon: Camera },
  { value: 'file-text', label: 'Documento', Icon: FileText },
  { value: 'shield-check', label: 'Segurança', Icon: ShieldCheck },
  { value: 'users', label: 'Equipe', Icon: Users },
  { value: 'settings', label: 'Operação', Icon: Settings },
];

const DEFAULT_APP_STEP_FIELDS = [
  { id: 'truck_plate', label: 'Placa cavalo', field_type: 'truck_plate', required: true, active: true, show_in_app: true, show_in_pdf: true, order: 1 },
  { id: 'trailer_plate', label: 'Placa carreta', field_type: 'trailer_plate', required: true, active: true, show_in_app: true, show_in_pdf: true, order: 2 },
  { id: 'driver_name', label: 'Nome do motorista', field_type: 'driver', required: true, active: true, show_in_app: true, show_in_pdf: true, order: 3 },
];

function itemKey(item) {
  return item?.id || item?.label || '';
}

function sortedActive(items = []) {
  return [...items]
    .filter((item) => item?.active !== false && item?.show_in_app !== false)
    .sort((left, right) => (Number(left.order) || 999) - (Number(right.order) || 999));
}

function modelVersionForCategory(config, categoryId) {
  const model = (config?.models || []).find((item) => item.category_id === categoryId)
    || (config?.models || []).find((item) => item.active !== false);
  return model?.versions?.find((version) => version.id === model.current_version_id)
    || model?.versions?.find((version) => version.active)
    || model?.versions?.[model.versions.length - 1]
    || null;
}

function seedCategoryRequirements(category, config) {
  const version = modelVersionForCategory(config, category?.id);
  const versionItems = sortedActive(version?.items || []);
  const photoFields = category?.photo_fields?.length
    ? category.photo_fields
    : versionItems
      .filter((item) => item.field_type === 'photo_required' || (item.required && item.field_type === 'photo_optional'))
      .map((item, index) => ({
        id: item.id,
        code: item.code || `A.${String(index + 1).padStart(2, '0')}`,
        label: item.label,
        required: item.required !== false,
        min_photos: item.required === false ? 0 : 1,
        max_photos: 1,
        show_conformity: item.show_conformity !== false,
        require_nonconformity_note: item.require_nonconformity_note !== false,
        show_in_app: true,
        show_in_pdf: true,
        active: item.active !== false,
        order: Number(item.order) || index + 1,
      }));
  const tableItems = category?.table_items?.length
    ? category.table_items
    : versionItems
      .filter((item) => item.field_type === 'photo_optional' && !item.required)
      .map((item, index) => ({
        id: item.id,
        code: item.code || `${index + 1}`,
        label: item.label,
        category: item.category || 'Checklist',
        aggregator: item.aggregator || item.label,
        requires_photo: true,
        required: false,
        min_photos: 0,
        max_photos: 1,
        show_in_app: true,
        show_in_pdf: true,
        active: item.active !== false,
        order: Number(item.order) || index + 1,
      }));
  const appFields = Array.isArray(category?.app_fields) ? category.app_fields : DEFAULT_APP_STEP_FIELDS;
  const signatureField = appFields.find((item) => item.field_type === 'signature');
  const nextAppFields = signatureField ? appFields : [
    ...appFields,
    {
      id: `signature-${category?.id || 'default'}`,
      label: 'Assinatura do Vistoriador',
      field_type: 'signature',
      required: true,
      active: true,
      show_in_app: true,
      show_in_pdf: true,
      order: appFields.length + 1,
    },
  ];
  return {
    ...category,
    permissions: {
      create: category?.permissions?.create?.length ? category.permissions.create : ['admin'],
      approve: category?.permissions?.approve?.length ? category.permissions.approve : ['admin'],
      view: category?.permissions?.view?.length ? category.permissions.view : ['admin'],
      edit: category?.permissions?.edit?.length ? category.permissions.edit : ['admin'],
      delete: category?.permissions?.delete?.length ? category.permissions.delete : ['admin'],
      notify: category?.permissions?.notify?.length ? category.permissions.notify : ['admin'],
    },
    app_fields: nextAppFields,
    photo_fields: photoFields,
    table_items: tableItems,
  };
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Tempo esgotado ao carregar o perfil.')), timeoutMs);
    }),
  ]);
}

function clearLegacyAuthStorage() {
  if (typeof window === 'undefined') return;
  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token') && key !== AUTH_STORAGE_KEY) {
      keys.push(key);
    }
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
}

function logoutLocal() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  clearLegacyAuthStorage();
  window.location.reload();
}

function clearLocalSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  clearLegacyAuthStorage();
}

function getStoredSession() {
  try {
    const value = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
    return value?.currentSession || value;
  } catch {
    return null;
  }
}

function storeSession(session) {
  if (!session?.access_token) return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function safeFileName(value) {
  return String(value || 'vistoria')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'vistoria';
}

async function waitForImages(root) {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }));
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imageSourceToDataUrl(source) {
  if (!source || source.startsWith('data:') || source.startsWith('blob:')) return source;
  try {
    const response = await fetch(source, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) return source;
    const blob = await response.blob();
    return readBlobAsDataUrl(blob);
  } catch {
    return source;
  }
}

async function createPdfExportClone(root) {
  const host = document.createElement('div');
  host.className = 'pdf-export-host';
  const clone = root.cloneNode(true);
  host.appendChild(clone);
  document.body.appendChild(host);

  const sourceImages = Array.from(root.querySelectorAll('img'));
  const clonedImages = Array.from(clone.querySelectorAll('img'));
  await Promise.all(clonedImages.map(async (image, index) => {
    const original = sourceImages[index];
    const source = original?.currentSrc || original?.src || image.currentSrc || image.src;
    const dataUrl = await imageSourceToDataUrl(source);
    image.removeAttribute('crossorigin');
    image.src = dataUrl;
  }));
  await waitForImages(clone);

  return { host, clone };
}

async function downloadInspectionPdf(inspection) {
  const root = document.querySelector('.print-document');
  if (!root) throw new Error('Relatório não encontrado na tela.');
  const { host, clone } = await createPdfExportClone(root);

  try {
    const pages = Array.from(clone.querySelectorAll('.pdf-page'));
    if (!pages.length) throw new Error('Páginas do relatório não encontradas.');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const width = page.offsetWidth;
      const height = page.offsetHeight;
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        scale: 1.05,
        useCORS: false,
        allowTaint: true,
        logging: false,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
      });
      const imageData = canvas.toDataURL('image/jpeg', 0.72);
      if (index > 0) pdf.addPage();
      pdf.addImage(imageData, 'JPEG', 0, 0, PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM, undefined, 'FAST');
    }

    const name = safeFileName([
      'vistoria',
      inspection?.driver_name,
      inspection?.truck_plate,
      inspection?.created_at ? new Date(inspection.created_at).toISOString().slice(0, 10) : '',
    ].filter(Boolean).join('-'));
    pdf.save(`${name}.pdf`);
  } finally {
    host.remove();
  }
}
function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [inspections, setInspections] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [checklistConfig, setChecklistConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState(() => window.localStorage.getItem('vistorias:selectedInspectionId') || '');
  const [selectedInspectorId, setSelectedInspectorId] = useState(() => window.localStorage.getItem('vistorias:selectedInspectorId') || null);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState(() => window.localStorage.getItem('vistorias:activeView') || 'home');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [webNotifications, setWebNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [scheduleToOpenId, setScheduleToOpenId] = useState('');
  const [panelDialog, setPanelDialog] = useState(null);
  const selectedRef = useRef(selected);
  const inspectionsRef = useRef(inspections);
  const schedulesRef = useRef(schedules);
  const loadingInspectionsRef = useRef(false);
  const profileRef = useRef(profile);
  const authLoadRef = useRef(0);
  const realtimeRefreshTimerRef = useRef(null);
  const scheduleRefreshTimerRef = useRef(null);
  const dialogResolveRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    inspectionsRef.current = inspections;
  }, [inspections]);

  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

  useEffect(() => {
    window.localStorage.setItem('vistorias:activeView', activeView);
  }, [activeView]);

  useEffect(() => {
    if (selectedInspectorId) window.localStorage.setItem('vistorias:selectedInspectorId', selectedInspectorId);
    else window.localStorage.removeItem('vistorias:selectedInspectorId');
  }, [selectedInspectorId]);

  useEffect(() => {
    if (selectedInspectionId) window.localStorage.setItem('vistorias:selectedInspectionId', selectedInspectionId);
    else window.localStorage.removeItem('vistorias:selectedInspectionId');
  }, [selectedInspectionId]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  function scheduleInspectionsRefresh() {
    if (realtimeRefreshTimerRef.current) window.clearTimeout(realtimeRefreshTimerRef.current);
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      loadInspections({ silent: true });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  function scheduleSchedulesRefresh() {
    if (scheduleRefreshTimerRef.current) window.clearTimeout(scheduleRefreshTimerRef.current);
    scheduleRefreshTimerRef.current = window.setTimeout(() => {
      scheduleRefreshTimerRef.current = null;
      loadSchedules({ silent: true });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  function closePanelDialog(result) {
    const resolve = dialogResolveRef.current;
    dialogResolveRef.current = null;
    setPanelDialog(null);
    if (resolve) resolve(result);
  }

  function openPanelDialog(dialog) {
    return new Promise((resolve) => {
      dialogResolveRef.current = resolve;
      setPanelDialog(dialog);
    });
  }

  function confirmPanelDialog(options) {
    return openPanelDialog({
      type: 'confirm',
      title: options.title || 'Confirmar ação',
      message: options.message,
      confirmLabel: options.confirmLabel || 'Confirmar',
      tone: options.tone || 'danger',
    });
  }

  function promptPanelDialog(options) {
    return openPanelDialog({
      type: 'prompt',
      title: options.title || 'Informe os dados',
      message: options.message,
      confirmLabel: options.confirmLabel || 'Confirmar',
      placeholder: options.placeholder || '',
      value: '',
      tone: options.tone || 'primary',
    });
  }

  function addWebNotification(kind, record) {
    if (!record?.id || !ADMIN_ROLES.has(profileRef.current?.access_role)) return;
    const isSchedule = kind === 'schedule';
    const driver = record.driver_profile_name || record.driver_name || record.inspector_name || 'Usuário';
    const plate = record.truck_plate || record.trailer_plate || 'Sem placa';
    const createdAt = record.created_at || new Date().toISOString();
    const notification = {
      id: `${kind}:${record.id}`,
      kind,
      recordId: record.id,
      title: isSchedule ? 'Novo agendamento' : 'Nova vistoria',
      body: `${isSchedule ? 'Novo agendamento' : 'Nova vistoria'} enviada por ${driver} - ${plate}`,
      driver,
      plate,
      createdAt,
      status: record.status || (isSchedule ? 'scheduled' : 'completed'),
      read: false,
      record,
    };
    setWebNotifications((current) => [
      notification,
      ...current.filter((item) => item.id !== notification.id),
    ].slice(0, 30));
  }

  function sortByNewest(items) {
    return [...items].sort((left, right) => (
      new Date(right.created_at || right.completed_at || right.scheduled_date || 0).getTime()
      - new Date(left.created_at || left.completed_at || left.scheduled_date || 0).getTime()
    ));
  }

  function sortSchedules(items) {
    return [...items].sort((left, right) => {
      const leftDate = new Date(`${left.scheduled_date || '9999-12-31'}T${left.scheduled_time || '23:59'}`).getTime();
      const rightDate = new Date(`${right.scheduled_date || '9999-12-31'}T${right.scheduled_time || '23:59'}`).getTime();
      if (leftDate !== rightDate) return leftDate - rightDate;
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    });
  }

  function mergeInspection(inspection, { notify = false } = {}) {
    if (!inspection?.id) return;
    const alreadyExists = inspectionsRef.current.some((item) => item.id === inspection.id);
    setInspections((current) => {
      const next = sortByNewest([
        inspection,
        ...current.filter((item) => item.id !== inspection.id),
      ]);
      inspectionsRef.current = next;
      return next;
    });
    setSelected((current) => (current?.id === inspection.id ? { ...current, ...inspection } : current));
    if (notify && !alreadyExists) addWebNotification('inspection', inspection);
  }

  function removeInspections(ids) {
    const idSet = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
    if (!idSet.size) return;
    setInspections((current) => {
      const next = current.filter((item) => !idSet.has(item.id));
      inspectionsRef.current = next;
      return next;
    });
    setSelected((current) => (current?.id && idSet.has(current.id) ? null : current));
    setSelectedInspectionId((current) => (idSet.has(current) ? '' : current));
  }

  function mergeSchedule(schedule, { notify = false } = {}) {
    if (!schedule?.id) return;
    const alreadyExists = schedulesRef.current.some((item) => item.id === schedule.id);
    setSchedules((current) => {
      const next = sortSchedules([
        schedule,
        ...current.filter((item) => item.id !== schedule.id),
      ]);
      schedulesRef.current = next;
      return next;
    });
    if (notify && !alreadyExists) addWebNotification('schedule', schedule);
  }

  function removeSchedules(ids) {
    const idSet = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
    if (!idSet.size) return;
    setSchedules((current) => {
      const next = current.filter((item) => !idSet.has(item.id));
      schedulesRef.current = next;
      return next;
    });
  }

  async function refreshInspectionById(id, options = {}) {
    if (!id || !ADMIN_ROLES.has(profileRef.current?.access_role)) return;
    try {
      const response = await authedApiFetch('/api/admin-inspections', {
        body: JSON.stringify({ action: 'inspection-get', id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar a vistoria.');
      if (payload.inspection) mergeInspection(payload.inspection, options);
      else removeInspections(id);
    } catch {
      scheduleInspectionsRefresh();
    }
  }

  async function refreshScheduleById(id, options = {}) {
    if (!id || (!ADMIN_ROLES.has(profileRef.current?.access_role) && profileRef.current?.access_role !== DRIVER_ROLE)) return;
    try {
      const response = await authedApiFetch('/api/admin-inspections', {
        body: JSON.stringify({ action: 'schedule-get', id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar o agendamento.');
      if (payload.schedule) mergeSchedule(payload.schedule, options);
      else removeSchedules(id);
    } catch {
      scheduleSchedulesRefresh();
    }
  }

  function openWebNotification(notification) {
    setWebNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, read: true } : item
    )));
    setNotificationsOpen(false);

    if (notification.kind === 'schedule') {
      closeInspection();
      setActiveView('schedules');
      setScheduleToOpenId(notification.recordId);
      return;
    }

    const inspection = inspections.find((item) => item.id === notification.recordId) || notification.record;
    if (inspection) {
      setActiveView(isAutocheckInspection(inspection) ? 'autocheck' : 'inspector');
      openInspection(inspection);
    }
  }

  useEffect(() => {
    let alive = true;

    async function resolveSession(nextSession) {
      const requestId = authLoadRef.current + 1;
      authLoadRef.current = requestId;
      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        setLoadingSession(false);
        setLoadingProfile(false);
        return;
      }

      try {
        setLoadingProfile(true);
        if (!alive || authLoadRef.current !== requestId) return;
        await withTimeout(loadProfile(nextSession.user, nextSession), PROFILE_LOAD_TIMEOUT_MS);
      } catch (sessionError) {
        if (!alive || authLoadRef.current !== requestId) return;
        setError(sessionError.message || 'Não foi possível carregar a sessão.');
        if (!profileRef.current) setProfile(null);
      } finally {
        if (alive && authLoadRef.current === requestId) {
          setLoadingSession(false);
          setLoadingProfile(false);
        }
      }
    }

    resolveSession(getStoredSession());

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ADMIN_ROLES.has(profile?.access_role)) {
      loadInspections();
      loadProfiles();
      loadSchedules();
      loadChecklistConfig();
    } else if (profile?.access_role === DRIVER_ROLE) {
      loadSchedules();
    }
  }, [profile?.id, profile?.access_role]);

  useEffect(() => {
    if (!ADMIN_ROLES.has(profile?.access_role) && profile?.access_role !== DRIVER_ROLE) return undefined;

    const token = (session || getStoredSession())?.access_token;
    if (token) supabase.realtime.setAuth(token);

    const channel = supabase
      .channel(ADMIN_REALTIME_CHANNEL)
      .on('broadcast', { event: 'inspection:upsert' }, ({ payload }) => {
        refreshInspectionById(payload?.id, { notify: Boolean(payload?.isNew) });
      })
      .on('broadcast', { event: 'inspection:delete' }, ({ payload }) => {
        removeInspections(payload?.ids || payload?.id);
      })
      .on('broadcast', { event: 'schedule:upsert' }, ({ payload }) => {
        refreshScheduleById(payload?.id, { notify: Boolean(payload?.isNew) });
      })
      .on('broadcast', { event: 'schedule:delete' }, ({ payload }) => {
        removeSchedules(payload?.ids || payload?.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspections' }, (payload) => {
        const id = payload.new?.id || payload.old?.id;
        if (payload.eventType === 'DELETE') {
          removeInspections(id);
          return;
        }
        if (id) refreshInspectionById(id, { notify: payload.eventType === 'INSERT' });
        else scheduleInspectionsRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspection_photos' }, (payload) => {
        const inspectionId = payload.new?.inspection_id || payload.old?.inspection_id;
        if (inspectionId) refreshInspectionById(inspectionId);
        else scheduleInspectionsRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspection_schedules' }, (payload) => {
        const id = payload.new?.id || payload.old?.id;
        if (payload.eventType === 'DELETE') {
          removeSchedules(id);
          return;
        }
        if (id) refreshScheduleById(id, { notify: payload.eventType === 'INSERT' });
        else scheduleSchedulesRefresh();
      })
      .subscribe();

    return () => {
      if (realtimeRefreshTimerRef.current) window.clearTimeout(realtimeRefreshTimerRef.current);
      if (scheduleRefreshTimerRef.current) window.clearTimeout(scheduleRefreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.access_role, session?.access_token]);

  async function loadProfile(user, sourceSession = session) {
    const userId = typeof user === 'string' ? user : user.id;
    const userEmail = typeof user === 'string' ? '' : user.email;
    const userMetadata = typeof user === 'string' ? {} : user.user_metadata || {};

    try {
      const fallbackProfile = await loadServerProfile(sourceSession, userMetadata);
      if (!fallbackProfile) throw new Error('Perfil não encontrado.');
      setError('');
      setProfile(normalizeProfile(fallbackProfile, userMetadata));
      return;
    } catch (profileError) {
      if (String(userEmail || '').toLowerCase() !== INITIAL_ADMIN_EMAIL) {
        setError(profileError.message || 'Não foi possível carregar o perfil.');
      }
    }

    if (String(userEmail || '').toLowerCase() === INITIAL_ADMIN_EMAIL) {
      const repaired = {
        id: userId,
        email: INITIAL_ADMIN_EMAIL,
        full_name: 'Administrador',
        access_role: 'admin',
        active: true,
        avatar_url: '',
        job_title: userMetadata.job_title || 'Administrador',
      };
      setProfile(repaired);
      await repairProfile(repaired, sourceSession);
      return;
    }

    setProfile(null);
  }

  async function repairLargeAuthSession() {
    const refreshToken = session?.refresh_token || getStoredSession()?.refresh_token;
    if (!refreshToken) {
      clearLocalSession();
      throw new Error('Sessão inválida. Entre novamente.');
    }

    const response = await fetch('/api/repair-auth-session', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.session?.access_token || !payload.session?.refresh_token) {
      clearLocalSession();
      throw new Error(payload.error || 'Não foi possível reparar a sessão.');
    }

    storeSession(payload.session);
    setSession(payload.session);
    await loadProfile(payload.session.user, payload.session);
    return payload.session;
  }
  async function authedApiFetch(path, options = {}) {
    let currentSession = session || getStoredSession();
    let token = currentSession?.access_token;
    if (!token) throw new Error('Sessão expirada. Entre novamente.');

    const request = (accessToken) => {
      const body = options.body ? JSON.parse(options.body) : {};
      return fetch(path, {
        ...options,
        method: options.method || 'POST',
        credentials: 'omit',
        headers: {
          ...(options.headers || {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list', ...body, access_token: accessToken }),
      });
    };

    let response = await request(token);
    if (response.status === 494) {
      const cleanSession = await repairLargeAuthSession();
      token = cleanSession.access_token;
      response = await request(token);
    }
    if (response.status === 401) {
      try {
        const cleanSession = await repairLargeAuthSession();
        token = cleanSession.access_token;
        response = await request(token);
      } catch {
        setSession(null);
        setProfile(null);
        throw new Error('Sessão expirada. Entre novamente.');
      }
    }
    return response;
  }

  function normalizeProfile(profileData, userMetadata = {}) {
    return {
      ...profileData,
      avatar_url: profileData.avatar_url || '',
      job_title: userMetadata.job_title || profileData.job_title || defaultJobTitle(profileData.access_role),
    };
  }

  async function loadServerProfile(sourceSession, userMetadata = {}) {
    const token = sourceSession?.access_token;
    if (!token) return null;

    try {
      const response = await fetch('/api/session-profile', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 494 || response.status === 401) {
        try {
          const cleanSession = await repairLargeAuthSession();
          return loadServerProfile(cleanSession, cleanSession.user?.user_metadata || {});
        } catch (repairError) {
          setSession(null);
          setProfile(null);
          throw repairError;
        }
      }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o perfil.');
      return payload.profile || null;
    } catch (profileError) {
      if (userMetadata.access_role === 'admin') {
        return {
          id: sourceSession.user.id,
          email: sourceSession.user.email,
          full_name: userMetadata.name || userMetadata.full_name || 'Administrador',
          access_role: 'admin',
          active: true,
          avatar_url: '',
          job_title: userMetadata.job_title || 'Administrador do painel',
        };
      }
      setError(profileError.message);
      return null;
    }
  }

  async function repairProfile(profileData, sourceSession = session) {
    const token = sourceSession?.access_token;
    if (!token) return;

    await fetch('/api/manage-user', {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'repair-profile', profile: profileData, access_token: token }),
    }).catch(() => null);
  }

  async function loadInspections({ silent = false } = {}) {
    if (loadingInspectionsRef.current) return;
    loadingInspectionsRef.current = true;
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const response = await authedApiFetch('/api/admin-inspections');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as vistorias.');
      const nextInspections = payload.inspections || [];
      setInspections(nextInspections);
      setSelected((current) => {
        if (!current) return null;
        return nextInspections.find((item) => item.id === current.id) || current;
      });
    } catch (loadError) {
      if (!silent) {
        setError(loadError.message);
        setInspections([]);
      }
    }

    if (!silent) setLoading(false);
    loadingInspectionsRef.current = false;
  }

  async function loadProfiles() {
    try {
      const response = await authedApiFetch('/api/admin-profiles');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os usuários.');
      setProfiles(payload.profiles || []);
    } catch (profilesError) {
      setError(profilesError.message);
      setProfiles([]);
    }
  }

  async function loadSchedules({ silent = false } = {}) {
    if (!silent) setError('');
    try {
      const response = await authedApiFetch('/api/admin-inspections', {
        body: JSON.stringify({ action: 'schedule-list' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os agendamentos.');
      setSchedules(payload.schedules || []);
    } catch (scheduleError) {
      if (!silent) {
        setError(scheduleError.message);
        setSchedules([]);
      }
    }
  }

  async function loadChecklistConfig() {
    try {
      const response = await authedApiFetch('/api/mobile-inspections?models=active');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os modelos.');
      setChecklistConfig(payload);
    } catch (configError) {
      setError(configError.message);
      setChecklistConfig(null);
    }
  }

  async function saveChecklistCategory(category) {
    const response = await authedApiFetch('/api/mobile-inspections?models=active', {
      body: JSON.stringify({ action: 'save-category', category }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar os requisitos.');
    await loadChecklistConfig();
    await notifyMobileConfigChanged();
    return payload.category;
  }

  async function deleteChecklistCategory(id) {
    const response = await authedApiFetch('/api/mobile-inspections?models=active', {
      body: JSON.stringify({ action: 'set-category-active', id, active: false }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível excluir o tipo de vistoria.');
    await loadChecklistConfig();
    await notifyMobileConfigChanged();
    return payload;
  }

  async function notifyMobileConfigChanged() {
    const channel = supabase.channel('mobile-config-live');
    try {
      await new Promise((resolve) => {
        const timeout = window.setTimeout(resolve, 1200);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            window.clearTimeout(timeout);
            resolve();
          }
        });
      });
      await channel.send({
        type: 'broadcast',
        event: 'checklist:config',
        payload: { updated_at: new Date().toISOString() },
      });
    } catch {
      // O app ainda atualiza ao abrir; o broadcast apenas evita recarregamento manual.
    } finally {
      supabase.removeChannel(channel);
    }
  }

  async function saveSchedule(payload) {
    const response = await authedApiFetch('/api/admin-inspections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody.error || 'Não foi possível salvar o agendamento.');
    await loadSchedules();
    return responseBody.schedule;
  }

  async function deleteSchedule(id) {
    if (!id) return;
    const confirmed = await confirmPanelDialog({
      title: 'Excluir agendamento',
      message: 'Excluir este agendamento?',
      confirmLabel: 'Excluir',
    });
    if (!confirmed) return;
    const response = await authedApiFetch('/api/admin-inspections', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(responseBody.error || 'Não foi possível excluir o agendamento.');
      return;
    }
    await loadSchedules();
  }

  async function setInspectionStatus(status) {
    if (!selected) return;
    let rejectionReason = '';
    if (status === 'rejected') {
      rejectionReason = await promptPanelDialog({
        title: 'Motivo da reprovação',
        message: 'Informe o motivo da reprovação.',
        placeholder: 'Descreva o motivo',
        confirmLabel: 'Reprovar',
      }) || '';
      if (!rejectionReason.trim()) return;
    }

    const response = await authedApiFetch('/api/admin-inspections', {
      method: 'PATCH',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: selected.id, status, rejection_reason: rejectionReason }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || 'Não foi possível atualizar a vistoria.');
      return;
    }

    await loadInspections();
    setSelected((current) => ({
      ...current,
      status,
      observations: status === 'rejected' ? `Motivo da reprovação: ${rejectionReason}` : current?.observations,
    }));
  }

  async function deleteInspections(ids) {
    const selectedIds = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
    if (!selectedIds.length) return;

    const confirmed = await confirmPanelDialog({
      title: selectedIds.length === 1 ? 'Excluir vistoria' : 'Excluir vistorias',
      message: selectedIds.length === 1
        ? 'Excluir esta vistoria? Esta ação não poderá ser desfeita.'
        : `Excluir ${selectedIds.length} vistorias? Esta ação não poderá ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (!confirmed) return;

    const response = await authedApiFetch('/api/admin-inspections', {
      method: 'DELETE',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || 'Não foi possível excluir a vistoria.');
      return;
    }

    closeInspection();
    await loadInspections();
  }

  const checklistGroups = useMemo(() => {
    const profileMap = new Map(profiles.map((item) => [item.id, item]));
    const groups = new Map();

    inspections.filter((inspection) => !isAutocheckInspection(inspection)).forEach((inspection) => {
      const inspectorId = inspection.user_id || 'unknown';
      const profileData = profileMap.get(inspectorId);
      const group = groups.get(inspectorId) || {
        id: inspectorId,
        name: profileData?.full_name || profileData?.email || inspection.driver_name || 'Vistoriador sem perfil',
        email: profileData?.email || '',
        inspections: [],
      };
      group.inspections.push(inspection);
      groups.set(inspectorId, group);
    });

    return Array.from(groups.values()).map((group) => {
      const total = group.inspections.length;
      const approved = group.inspections.filter((item) => item.status === 'approved').length;
      const rejected = group.inspections.filter((item) => item.status === 'rejected').length;
      const completed = group.inspections.filter((item) => ['completed', 'approved'].includes(item.status)).length;
      const pending = group.inspections.filter((item) => !['approved', 'rejected'].includes(item.status)).length;
      return {
        ...group,
        total,
        approved,
        rejected,
        completed,
        pending,
      };
    });
  }, [inspections, profiles]);

  const inspectionCategories = useMemo(() => {
    const categories = (checklistConfig?.categories || [])
      .filter((category) => (
        category?.active !== false
        && category.destination !== 'schedules'
        && category.flow !== 'schedule'
      ))
      .sort((left, right) => (Number(left.sort_order) || 999) - (Number(right.sort_order) || 999));

    return categories.length ? categories : [
      { id: 'aggregates', name: 'Vistoria Agregados', icon: 'clipboard-check', flow: 'inspection', destination: 'inspector', sort_order: 1 },
      { id: 'autocheck', name: 'Autocheck', icon: 'user-check', flow: 'autocheck', destination: 'autocheck', sort_order: 2 },
    ];
  }, [checklistConfig]);

  const activeCategory = useMemo(() => {
    if (!String(activeView || '').startsWith('category:')) return null;
    const categoryId = activeView.replace('category:', '');
    return inspectionCategories.find((category) => category.id === categoryId) || null;
  }, [activeView, inspectionCategories]);

  const categoryGroupsById = useMemo(() => {
    const profileMap = new Map(profiles.map((item) => [item.id, item]));
    const result = new Map();

    inspectionCategories.forEach((category) => {
      const groupByDriver = category.flow === 'autocheck' || category.destination === 'autocheck';
      const groups = new Map();

      inspections
        .filter((inspection) => inspectionMatchesCategory(inspection, category))
        .forEach((inspection) => {
          const groupId = groupByDriver ? (inspection.driver_name || 'Motorista sem nome') : (inspection.user_id || 'unknown');
          const profileData = profileMap.get(groupId);
          const group = groups.get(groupId) || {
            id: groupId,
            name: groupByDriver
              ? groupId
              : profileData?.full_name || profileData?.email || inspection.driver_name || 'Vistoriador sem perfil',
            email: groupByDriver ? '' : profileData?.email || '',
            inspections: [],
          };
          group.inspections.push(inspection);
          groups.set(groupId, group);
        });

      result.set(category.id, Array.from(groups.values()).map((group) => {
        const total = group.inspections.length;
        const approved = group.inspections.filter((item) => item.status === 'approved').length;
        const rejected = group.inspections.filter((item) => item.status === 'rejected').length;
        const completed = group.inspections.filter((item) => ['completed', 'approved'].includes(item.status)).length;
        const pending = group.inspections.filter((item) => !['approved', 'rejected'].includes(item.status)).length;
        return { ...group, total, approved, rejected, completed, pending };
      }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    });

    return result;
  }, [inspectionCategories, inspections, profiles]);

  const autocheckGroups = useMemo(() => {
    const groups = new Map();

    inspections.filter(isAutocheckInspection).forEach((inspection) => {
      const driverName = inspection.driver_name || 'Motorista sem nome';
      const group = groups.get(driverName) || {
        id: driverName,
        name: driverName,
        email: '',
        inspections: [],
      };
      group.inspections.push(inspection);
      groups.set(driverName, group);
    });

    return Array.from(groups.values()).map((group) => {
      const total = group.inspections.length;
      const approved = group.inspections.filter((item) => item.status === 'approved').length;
      const rejected = group.inspections.filter((item) => item.status === 'rejected').length;
      const completed = group.inspections.filter((item) => ['completed', 'approved'].includes(item.status)).length;
      const pending = group.inspections.filter((item) => !['approved', 'rejected'].includes(item.status)).length;
      return {
        ...group,
        total,
        approved,
        rejected,
        completed,
        pending,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [inspections]);

  const selectedInspector = useMemo(
    () => checklistGroups.find((group) => group.id === selectedInspectorId) || null,
    [checklistGroups, selectedInspectorId],
  );

  const selectedAutocheckGroup = useMemo(
    () => autocheckGroups.find((group) => group.id === selectedInspectorId) || null,
    [autocheckGroups, selectedInspectorId],
  );

  const activeCategoryGroups = activeCategory ? categoryGroupsById.get(activeCategory.id) || [] : [];
  const selectedCategoryGroup = useMemo(
    () => activeCategoryGroups.find((group) => group.id === selectedInspectorId) || null,
    [activeCategoryGroups, selectedInspectorId],
  );

  useEffect(() => {
    if (!selectedInspectionId) {
      setSelected(null);
      return;
    }
    const nextSelected = inspections.find((inspection) => inspection.id === selectedInspectionId);
    if (nextSelected) setSelected(nextSelected);
  }, [selectedInspectionId, inspections]);

  function openInspection(inspection) {
    setSelected(inspection);
    setSelectedInspectionId(inspection?.id || '');
  }

  function closeInspection() {
    setSelected(null);
    setSelectedInspectionId('');
  }

  if (loadingSession || (session && loadingProfile && !profile)) return <div className="center-state">Carregando...</div>;
  if (!session) return <LoginScreen />;
  if (profile?.access_role === DRIVER_ROLE) {
    return (
      <DriverSchedulePage
        profile={profile}
        schedules={schedules}
        onSave={saveSchedule}
        onLogout={logoutLocal}
      />
    );
  }
  if (profile && !ADMIN_ROLES.has(profile.access_role)) return <AccessDenied profile={profile} />;
  if (!profile) return <AccessSetupNotice />;

  return (
    <main className="admin-shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <img src={LOGO_URL} alt="EN" />
          <span>Vistorias | EN</span>
          <NotificationBell
            notifications={webNotifications}
            open={notificationsOpen}
            onToggle={(nextOpen) => setNotificationsOpen((current) => (
              typeof nextOpen === 'boolean' ? nextOpen : !current
            ))}
            onOpen={openWebNotification}
          />
        </div>
        <nav className="side-nav">
          <button className={activeView === 'home' ? 'active' : ''} onClick={() => {
            closeInspection();
            setActiveView('home');
          }}>
            <Home size={18} /> Início
          </button>
          <div className={(['inspector', 'autocheck', 'schedules'].includes(activeView) || String(activeView).startsWith('category:')) ? 'nav-dropdown open' : 'nav-dropdown'}>
            <button className="nav-dropdown-trigger" type="button">
              <FileText size={18} /> Vistorias <ChevronDown size={16} />
            </button>
            <div className="nav-dropdown-menu">
              {inspectionCategories.map((category) => {
                const viewId = categoryViewId(category.id);
                return (
                  <button className={activeView === viewId ? 'active' : ''} key={category.id} onClick={() => {
                    closeInspection();
                    setSelectedInspectorId(null);
                    setActiveView(viewId);
                  }}>
                    <InspectionIcon name={category.icon} size={18} /> {category.name}
                  </button>
                );
              })}
              <button className={activeView === 'schedules' ? 'active' : ''} onClick={() => {
                closeInspection();
                setSelectedInspectorId(null);
                setActiveView('schedules');
              }}>
                <CalendarDays size={18} /> Agendamentos
              </button>
            </div>
          </div>
          <button className={activeView === 'users' ? 'active' : ''} onClick={() => {
            closeInspection();
            setActiveView('users');
          }}>
            <Users size={18} /> Acessos
          </button>
          <button className={activeView === 'requirements' ? 'active' : ''} onClick={() => {
            closeInspection();
            setActiveView('requirements');
          }}>
            <Settings size={18} /> Requisitos
          </button>
        </nav>
        {error && <p className="error-box">{error}</p>}
        <div className="sidebar-fill" />
        <SidebarProfile profile={profile} onOpen={() => setProfileModalOpen(true)} onLogout={logoutLocal} />
      </aside>

      <section className="workspace">
        {activeView === 'users' ? (
          <AccessPanel profiles={profiles} onChanged={loadProfiles} currentUserId={session.user.id} onConfirm={confirmPanelDialog} />
        ) : activeView === 'requirements' ? (
          <RequirementsPanel
            config={checklistConfig}
            onReload={loadChecklistConfig}
            onSaveCategory={saveChecklistCategory}
            onDeleteCategory={deleteChecklistCategory}
            onConfirm={confirmPanelDialog}
          />
        ) : activeView === 'schedules' ? (
          <SchedulesWorkspace
            schedules={schedules}
            inspections={inspections}
            profiles={profiles}
            onSave={saveSchedule}
            onDelete={deleteSchedule}
            selected={selected}
            scheduleToOpenId={scheduleToOpenId}
            onScheduleOpened={() => setScheduleToOpenId('')}
            onOpenInspection={openInspection}
            onCloseInspection={closeInspection}
            setInspectionStatus={setInspectionStatus}
          />
        ) : activeView === 'home' ? (
          <HomeDashboard
            profile={profile}
            inspections={inspections}
            schedules={schedules}
            groups={checklistGroups}
            onOpenInspector={(group) => {
              setSelectedInspectorId(group.id);
              closeInspection();
              setActiveView('inspector');
            }}
          />
        ) : activeCategory ? (
          <ChecklistsWorkspace
            title={activeCategory.name}
            groupTitle={activeCategory.flow === 'autocheck' || activeCategory.destination === 'autocheck' ? 'Motoristas' : 'Vistoriadores'}
            emptyMessage={`Nenhuma vistoria ${activeCategory.name} recebida atÃ© agora.`}
            groups={activeCategoryGroups}
            inspector={selectedCategoryGroup}
            selectedInspectorId={selectedInspectorId}
            setSelectedInspectorId={setSelectedInspectorId}
            selected={selected}
            setSelected={openInspection}
            closeInspection={closeInspection}
            setInspectionStatus={setInspectionStatus}
            deleteInspections={deleteInspections}
          />
        ) : activeView === 'autocheck' ? (
          <ChecklistsWorkspace
            title="Autocheck"
            groupTitle="Motoristas"
            emptyMessage="Nenhuma vistoria Autocheck recebida até agora."
            groups={autocheckGroups}
            inspector={selectedAutocheckGroup}
            selectedInspectorId={selectedInspectorId}
            setSelectedInspectorId={setSelectedInspectorId}
            selected={selected}
            setSelected={openInspection}
            closeInspection={closeInspection}
            setInspectionStatus={setInspectionStatus}
            deleteInspections={deleteInspections}
          />
        ) : (
          <ChecklistsWorkspace
            title="Vistoria Agregados"
            groupTitle="Vistoriadores"
            groups={checklistGroups}
            inspector={selectedInspector}
            selectedInspectorId={selectedInspectorId}
            setSelectedInspectorId={setSelectedInspectorId}
            selected={selected}
            setSelected={openInspection}
            closeInspection={closeInspection}
            setInspectionStatus={setInspectionStatus}
            deleteInspections={deleteInspections}
          />
        )}
      </section>
      {profileModalOpen && (
        <ProfileModal
          profile={profile}
          onClose={() => setProfileModalOpen(false)}
          onSaved={async () => {
            const currentSession = session || getStoredSession();
            if (currentSession?.user) await loadProfile(currentSession.user, currentSession);
            await loadProfiles();
          }}
        />
      )}
      <PanelDialog
        dialog={panelDialog}
        onChange={(value) => setPanelDialog((current) => ({ ...current, value }))}
        onCancel={() => closePanelDialog(null)}
        onConfirm={() => closePanelDialog(panelDialog?.type === 'prompt' ? panelDialog.value : true)}
      />
    </main>
  );
}

function PanelDialog({ dialog, onChange, onCancel, onConfirm }) {
  if (!dialog) return null;
  const isDanger = dialog.tone === 'danger';
  const canConfirm = dialog.type !== 'prompt' || String(dialog.value || '').trim().length > 0;

  return (
    <div className="modal-backdrop panel-dialog-backdrop" role="dialog" aria-modal="true">
      <div className="panel-dialog-modal">
        <div className={`panel-dialog-icon ${isDanger ? 'danger' : 'primary'}`}>
          {isDanger ? <Trash2 size={22} /> : <Info size={22} />}
        </div>
        <div>
          <h2>{dialog.title}</h2>
          {dialog.message && <p>{dialog.message}</p>}
        </div>
        {dialog.type === 'prompt' && (
          <textarea
            className="panel-dialog-input"
            value={dialog.value || ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={dialog.placeholder}
            autoFocus
          />
        )}
        <div className="panel-dialog-actions">
          {dialog.type !== 'alert' && (
            <button className="secondary-action" type="button" onClick={onCancel}>Cancelar</button>
          )}
          <button
            className={`primary-action ${isDanger ? 'danger-action' : ''}`}
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {dialog.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationBell({ notifications, open, onToggle, onOpen }) {
  const unread = notifications.filter((item) => !item.read).length;
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onToggle(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onToggle(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onToggle]);

  return (
    <div className="web-notifications" ref={menuRef}>
      <button
        type="button"
        className={`notification-bell ${unread ? 'has-unread' : ''}`}
        onClick={() => onToggle()}
        aria-label="Notificações"
      >
        <Bell size={19} />
        {unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notification-menu">
          <div className="notification-menu-head">
            <strong>Notificações</strong>
            <small>{unread ? `${unread} não lida(s)` : 'Tudo em dia'}</small>
          </div>
          <div className="notification-menu-list">
            {notifications.length === 0 && <p className="notification-empty">Nenhuma novidade recebida.</p>}
            {notifications.map((notification) => (
              <button
                type="button"
                className={`notification-item-web ${notification.read ? 'read' : ''}`}
                key={notification.id}
                onClick={() => onOpen(notification)}
              >
                <span>{notification.kind === 'schedule' ? 'Agendamento' : 'Vistoria'}</span>
                <strong>{notification.body}</strong>
                <small>{formatDateTime(notification.createdAt)} · {notification.kind === 'schedule' ? scheduleStatusLabel(notification.status) : statusLabel(notification.status)}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HomeDashboard({ profile, inspections, schedules, groups, onOpenInspector }) {
  const totals = {
    total: inspections.length,
    completed: inspections.filter((item) => ['completed', 'approved'].includes(item.status)).length,
    pending: inspections.filter((item) => !['approved', 'rejected'].includes(item.status)).length,
    rejected: inspections.filter((item) => item.status === 'rejected').length,
    scheduled: schedules.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
  };

  return (
    <div className="dashboard-page">
      <header className="welcome-header">
        <h1>Vistorias | EN</h1>
        <p>Acompanhamento das vistorias de frota pesada</p>
      </header>

      <section className="stats-grid">
        <StatCard label="Total de Vistorias" value={totals.total} tone="blue" />
        <StatCard label="Concluídas" value={totals.completed} tone="green" />
        <StatCard label="Aguardando aprovação" value={totals.pending} tone="yellow" />
        <StatCard label="Vistorias agendadas" value={totals.scheduled} tone="blue" />
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2><Users size={22} /> Vistoriadores</h2>
            <p>Clique em um vistoriador para ver as vistorias realizadas por ele.</p>
          </div>
        </div>

        <div className="inspector-grid">
          {groups.map((group) => (
            <button className="inspector-card" key={group.id} onClick={() => onOpenInspector(group)}>
              <div className="inspector-card-head">
                <strong>{group.name}</strong>
                <span>{group.total}</span>
              </div>
              <small>{group.total} vistoria(s) realizadas</small>
              <div className="inspector-card-foot">
                <span>{group.completed} concluídas</span>
                <em>{group.pending} aguardando aprovação</em>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <article className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SidebarProfile({ profile, onOpen, onLogout }) {
  return (
    <div className="sidebar-profile">
      <button className="profile-summary" type="button" onClick={onOpen}>
        <Avatar profile={profile} />
        <span>
          <strong>{profile?.full_name || 'Administrador'}</strong>
          <small>{profile?.job_title || defaultJobTitle(profile?.access_role)}</small>
        </span>
      </button>
      <button className="logout-link" type="button" onClick={onLogout}>
        <LogOut size={22} /> Sair da Conta
      </button>
    </div>
  );
}

function Avatar({ profile }) {
  const initials = String(profile?.full_name || profile?.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (profile?.avatar_url) {
    return <img className="avatar-image" src={profile.avatar_url} alt="" />;
  }

  return <span className="avatar-fallback">{initials || 'U'}</span>;
}

function ProfileModal({ profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    job_title: profile?.job_title || defaultJobTitle(profile?.access_role),
    avatar_url: profile?.avatar_url || '',
  });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  function readAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage('');
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const maxSize = 640;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setForm((current) => ({ ...current, avatar_url: canvas.toDataURL('image/jpeg', 0.86) }));
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setMessage('Não foi possível carregar esta imagem.');
    };
    image.src = objectUrl;
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const token = getStoredSession()?.access_token;

    await fetch('/api/manage-user', {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update-self',
        full_name: form.full_name,
        job_title: form.job_title,
        avatar_url: form.avatar_url,
        access_token: token,
      }),
    }).catch(() => null);

    await onSaved();
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="profile-modal" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>Meu perfil</h2>
            <p>Personalize como seu usuário aparece no painel.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar perfil">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="avatar-editor">
          <Avatar profile={{ ...profile, ...form }} />
          <label>
            <Camera size={18} /> Alterar foto
            <input type="file" accept="image/*" onChange={readAvatar} />
          </label>
        </div>

        <label>
          Nome
          <input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
        </label>
        <label>
          Cargo
          <input value={form.job_title} onChange={(event) => setForm({ ...form, job_title: event.target.value })} placeholder="Ex: Assistente de Inteligencia Operacional" />
        </label>

        {message && <p className="info-box">{message}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-action"><Save size={18} /> {saving ? 'Salvando...' : 'Salvar perfil'}</button>
        </div>
      </form>
    </div>
  );
}

function InspectorChecklists({ inspector, selected, setSelected, setInspectionStatus }) {
  const inspections = inspector?.inspections || [];

  const counts = {
    pending: inspections.filter((item) => !['approved', 'rejected'].includes(item.status)).length,
    rejected: inspections.filter((item) => item.status === 'rejected').length,
    completed: inspections.filter((item) => ['completed', 'approved'].includes(item.status)).length,
  };

  if (!inspector) {
    return (
      <div className="empty-preview no-print">
        <Users size={38} />
        <p>Selecione um vistoriador na página inicial.</p>
      </div>
    );
  }

  if (selected) {
    return (
      <>
        <div className="toolbar no-print">
          <div>
            <h1>Visualização da vistoria</h1>
            <p>{inspector.name} - {selected.truck_plate || 'Sem placa'}</p>
          </div>
          <div className="toolbar-actions">
            <button onClick={() => setSelected(null)}>Voltar</button>
            <button onClick={() => setInspectionStatus('approved')}>
              <CheckCircle2 size={18} /> Aprovar
            </button>
            <button onClick={() => setInspectionStatus('rejected')}>
              <XCircle size={18} /> Reprovar
            </button>
            <DownloadPdfButton inspection={selected} />
          </div>
        </div>
        <ReportPreview inspection={selected} />
      </>
    );
  }

  return (
    <div className="checklists-page">
      <header className="checklists-header">
        <div>
          <h1>{inspector.name}</h1>
          <p>{inspector.email || 'Vistoriador'} Â· {inspections.length} checklist(s)</p>
        </div>
      </header>
      <div className="status-strip">
        <span><strong>{counts.pending}</strong> Aguardando aprovação</span>
        <span><strong>{counts.rejected}</strong> Reprovadas</span>
        <span><strong>{counts.completed}</strong> Concluídas</span>
      </div>
      <div className="checklist-list">
        {inspections.length === 0 && <div className="empty-card">Nenhuma vistoria encontrada.</div>}
        {inspections.map((inspection) => (
          <button className="checklist-row" key={inspection.id} onClick={() => setSelected(inspection)}>
            <span className={`status-dot ${inspection.status}`} />
            <div>
              <strong>{inspection.driver_name || 'Motorista não informado'}</strong>
              <em>{inspection.truck_plate || 'Sem cavalo'} / {inspection.trailer_plate || 'Sem carreta'}</em>
            </div>
            <p>{statusLabel(inspection.status)}</p>
            <time>{formatDate(inspection.created_at)}</time>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChecklistsWorkspace({
  title = 'Vistoria Agregados',
  groupTitle = 'Vistoriadores',
  emptyMessage = 'Nenhuma vistoria recebida até agora.',
  groups,
  inspector,
  selectedInspectorId,
  setSelectedInspectorId,
  selected,
  setSelected,
  closeInspection,
  setInspectionStatus,
  deleteInspections,
}) {
  const [inspectorSearch, setInspectorSearch] = useState('');
  const [inspectionSearch, setInspectionSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedInspector = inspector || groups[0] || null;
  const inspections = selectedInspector?.inspections || [];
  const filteredInspectors = groups.filter((group) => {
    const search = inspectorSearch.trim().toLowerCase();
    if (!search) return true;
    return [group.name, group.email].some((value) => String(value || '').toLowerCase().includes(search));
  });
  const filteredInspections = inspections.filter((inspection) => {
    const search = inspectionSearch.trim().toLowerCase();
    const matchesSearch = !search || [
      inspection.driver_name,
      inspection.truck_plate,
      inspection.trailer_plate,
      inspection.type,
    ].some((value) => String(value || '').toLowerCase().includes(search));
    const dateKey = inspection.created_at ? new Date(inspection.created_at).toISOString().slice(0, 10) : '';
    return matchesSearch && (!dateFrom || dateKey >= dateFrom) && (!dateTo || dateKey <= dateTo);
  });

  const counts = {
    pending: inspections.filter((item) => !['approved', 'rejected'].includes(item.status)).length,
    rejected: inspections.filter((item) => item.status === 'rejected').length,
    completed: inspections.filter((item) => ['completed', 'approved'].includes(item.status)).length,
  };

  useEffect(() => {
    setSelectedIds([]);
  }, [selectedInspector?.id, inspectionSearch, dateFrom, dateTo]);

  function toggleInspection(id) {
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  }

  async function deleteSelected(ids = selectedIds) {
    await deleteInspections(ids);
    setSelectedIds([]);
  }

  if (!selectedInspector) {
    return (
      <div className="empty-preview no-print">
        <Users size={38} />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  if (selected) {
    return (
      <>
        <div className="toolbar no-print">
          <div>
            <h1>Visualização da vistoria</h1>
            <p>{selectedInspector.name} - {selected.truck_plate || 'Sem placa'}</p>
          </div>
          <div className="toolbar-actions">
            <button onClick={closeInspection}>Voltar</button>
            <button onClick={() => setInspectionStatus('approved')}>
              <CheckCircle2 size={18} /> Aprovar
            </button>
            <button onClick={() => setInspectionStatus('rejected')}>
              <XCircle size={18} /> Reprovar
            </button>
            <button onClick={() => deleteSelected([selected.id])}>
              <Trash2 size={18} /> Excluir
            </button>
            <DownloadPdfButton inspection={selected} />
          </div>
        </div>
        <ReportPreview inspection={selected} />
      </>
    );
  }

  return (
    <div className="checklists-board">
      <aside className="checklists-inspector-panel">
        <div className="panel-title">
          <ClipboardCheck size={22} />
          <h1>{groupTitle}</h1>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            value={inspectorSearch}
            onChange={(event) => setInspectorSearch(event.target.value)}
            placeholder={`Buscar ${groupTitle.toLowerCase()}...`}
          />
        </label>
        <div className="inspector-pick-list">
          {filteredInspectors.map((group) => (
            <button
              className={`inspector-pick ${selectedInspectorId === group.id || (!selectedInspectorId && selectedInspector.id === group.id) ? 'active' : ''}`}
              key={group.id}
              onClick={() => {
                setSelectedInspectorId(group.id);
                closeInspection();
              }}
            >
              <Avatar profile={{ full_name: group.name, email: group.email }} />
              <span>
                <strong>{group.name}</strong>
                <small>{group.email || `${group.total} vistoria(s)`}</small>
              </span>
              <em>{group.total}</em>
            </button>
          ))}
        </div>
      </aside>

      <div className="checklists-detail-panel">
        <header className="checklists-header">
          <div>
            <h1>{selectedInspector.name}</h1>
            <p>{selectedInspector.email || title} · {inspections.length} vistoria(s)</p>
          </div>
          <div className="status-strip compact">
            <span><strong>{counts.pending}</strong> Aguardando aprovação</span>
            <span><strong>{counts.rejected}</strong> Reprovadas</span>
            <span><strong>{counts.completed}</strong> Concluídas</span>
          </div>
        </header>

        <div className="checklist-filters">
          <label className="search-field wide">
            <Search size={18} />
            <input
              value={inspectionSearch}
              onChange={(event) => setInspectionSearch(event.target.value)}
              placeholder="Buscar por nome do acompanhado ou placa..."
            />
          </label>
          <label>
            De
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>

        <div className="checklist-bulk-bar">
          <span>{selectedIds.length} selecionada(s)</span>
          <button type="button" onClick={() => deleteSelected()} disabled={!selectedIds.length}>
            <Trash2 size={16} /> Excluir selecionadas
          </button>
        </div>

        <div className="checklist-list">
          {filteredInspections.length === 0 && (
            <div className="empty-card">Nenhuma vistoria encontrada com estes filtros.</div>
          )}
          {filteredInspections.map((inspection) => (
            <article className="checklist-row" key={inspection.id}>
              <input
                className="checklist-select"
                type="checkbox"
                checked={selectedIds.includes(inspection.id)}
                onChange={() => toggleInspection(inspection.id)}
                aria-label={`Selecionar vistoria de ${inspection.driver_name || 'motorista não informado'}`}
              />
              <button className="checklist-open" type="button" onClick={() => setSelected(inspection)}>
                <span className={`status-dot ${inspection.status}`} />
                <div>
                  <strong>{inspection.driver_name || 'Motorista não informado'}</strong>
                  <em>{inspection.truck_plate || 'Sem cavalo'} / {inspection.trailer_plate || 'Sem carreta'}</em>
                </div>
                <p>{statusLabel(inspection.status)}</p>
                <time>{formatDate(inspection.created_at)}</time>
              </button>
              <button className="row-delete" type="button" onClick={() => deleteSelected([inspection.id])} title="Excluir vistoria">
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduleForm({ profiles = [], onSave, onCancel, compact = false }) {
  const [form, setForm] = useState({
    driver_name: '',
    truck_plate: '',
    trailer_plate: '',
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time: '',
    assigned_inspector_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const inspectors = profiles.filter((profile) => ['app', 'inspector'].includes(profile.access_role) && profile.active !== false);

  async function submit(event) {
    event.preventDefault();
    const truckPlate = formatPlate(form.truck_plate);
    const trailerPlate = formatPlate(form.trailer_plate);
    if (!isValidPlate(truckPlate) || !isValidPlate(trailerPlate)) {
      setMessage('Placa inválida. Verifique e tente novamente.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await onSave({
        action: 'create',
        ...form,
        truck_plate: truckPlate,
        trailer_plate: trailerPlate,
      });
      setMessage('Agendamento salvo.');
      setForm((current) => ({
        ...current,
        truck_plate: '',
        trailer_plate: '',
        notes: '',
      }));
      if (onCancel) onCancel();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={compact ? 'schedule-form compact' : 'schedule-form'} onSubmit={submit}>
      <label>
        Motorista
        <input value={form.driver_name} onChange={(event) => setForm({ ...form, driver_name: event.target.value })} required />
      </label>
      <label>
        Placa cavalo
        <input value={form.truck_plate} onChange={(event) => setForm({ ...form, truck_plate: formatPlate(event.target.value) })} placeholder="ABC-1234" required />
      </label>
      <label>
        Placa carreta
        <input value={form.trailer_plate} onChange={(event) => setForm({ ...form, trailer_plate: formatPlate(event.target.value) })} placeholder="ABC-1234" required />
      </label>
      <label>
        Dia
        <input type="date" value={form.scheduled_date} onChange={(event) => setForm({ ...form, scheduled_date: event.target.value })} required />
      </label>
      <label>
        Horário
        <input type="time" value={form.scheduled_time} onChange={(event) => setForm({ ...form, scheduled_time: event.target.value })} />
      </label>
      {!!inspectors.length && (
        <InspectorCombobox
          inspectors={inspectors}
          value={form.assigned_inspector_id}
          onChange={(assigned_inspector_id) => setForm({ ...form, assigned_inspector_id })}
        />
      )}
      <label className="wide-field">
        Observações
        <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ex: janela preferencial, doca, prioridade..." />
      </label>
      {message && <p className={message.includes('salvo') ? 'info-box' : 'error-box'}>{message}</p>}
      <div className="modal-actions">
        {onCancel && <button type="button" className="secondary-action" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="primary-action"><Save size={18} /> {saving ? 'Salvando...' : 'Agendar vistoria'}</button>
      </div>
    </form>
  );
}

function InspectorCombobox({ inspectors, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = inspectors.find((inspector) => inspector.id === value) || null;
  const filtered = inspectors.filter((inspector) => {
    const search = query.trim().toLowerCase();
    if (!search) return true;
    return [inspector.full_name, inspector.email]
      .some((item) => String(item || '').toLowerCase().includes(search));
  });
  const displayValue = open ? query : (selected?.full_name || selected?.email || 'A definir');

  function choose(id) {
    onChange(id);
    setQuery('');
    setOpen(false);
  }

  return (
    <label className="combobox-field">
      Direcionar para
      <div className="combobox">
        <input
          value={displayValue}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder="Pesquisar vistoriador..."
          autoComplete="off"
        />
        <button type="button" onClick={() => setOpen((current) => !current)} aria-label="Abrir lista de vistoriadores">
          <span aria-hidden="true">⌄</span>
        </button>
        {open && (
          <div className="combobox-menu">
            <button type="button" className={!value ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => choose('')}>
              <strong>A definir</strong>
              <small>Sem direcionamento</small>
            </button>
            {filtered.map((inspector) => (
              <button
                type="button"
                className={value === inspector.id ? 'active' : ''}
                key={inspector.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(inspector.id)}
              >
                <strong>{inspector.full_name || inspector.email}</strong>
                <small>{inspector.email}</small>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="combobox-empty">Nenhum vistoriador encontrado.</div>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

function SchedulesWorkspace({
  schedules,
  inspections = [],
  profiles,
  onSave,
  onDelete,
  selected,
  scheduleToOpenId,
  onScheduleOpened,
  onOpenInspection,
  onCloseInspection,
  setInspectionStatus,
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [detailSchedule, setDetailSchedule] = useState(null);
  const inspectors = profiles.filter((profile) => ['app', 'inspector'].includes(profile.access_role) && profile.active !== false);
  const inspectionsById = useMemo(
    () => new Map(inspections.map((inspection) => [inspection.id, inspection])),
    [inspections],
  );
  const filtered = schedules.filter((schedule) => {
    const matchesStatus = status === 'all'
      || (status === 'open' && !['completed', 'cancelled'].includes(schedule.status))
      || schedule.status === status;
    const text = [schedule.driver_name, schedule.truck_plate, schedule.trailer_plate, schedule.inspector_name, schedule.inspector_email]
      .join(' ')
      .toLowerCase();
    return matchesStatus && (!search.trim() || text.includes(search.trim().toLowerCase()));
  });
  const readySchedules = schedules.filter((schedule) => schedule.inspection_id && inspectionsById.has(schedule.inspection_id));

  useEffect(() => {
    if (!scheduleToOpenId) return;
    const target = schedules.find((schedule) => schedule.id === scheduleToOpenId);
    if (!target) return;
    setDetailSchedule(target);
    onScheduleOpened?.();
  }, [scheduleToOpenId, schedules, onScheduleOpened]);

  async function updateSchedule(schedule, patch) {
    await onSave({ action: 'update', id: schedule.id, ...patch });
  }

  function openScheduleInspection(schedule) {
    const inspection = inspectionsById.get(schedule.inspection_id);
    if (inspection) onOpenInspection(inspection);
  }

  if (selected) {
    return (
      <>
        <div className="toolbar no-print">
          <div>
            <h1>Vistoria agendada concluída</h1>
            <p>{selected.driver_name || 'Motorista'} - {selected.truck_plate || 'Sem placa'}</p>
          </div>
          <div className="toolbar-actions">
            <button onClick={onCloseInspection}>Voltar</button>
            <button onClick={() => setInspectionStatus('approved')}>
              <CheckCircle2 size={18} /> Aprovar
            </button>
            <button onClick={() => setInspectionStatus('rejected')}>
              <XCircle size={18} /> Reprovar
            </button>
            <DownloadPdfButton inspection={selected} />
          </div>
        </div>
        <ReportPreview inspection={selected} />
      </>
    );
  }

  return (
    <div className="schedules-page">
      <header className="checklists-header flat">
        <div>
          <h1>Vistorias Agendadas</h1>
          <p>{schedules.length} solicitação(ões) de motorista.</p>
        </div>
      </header>

      <div className="checklist-filters">
        <label className="search-field wide">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar motorista, placa ou vistoriador..." />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="open">Em aberto</option>
            <option value="scheduled">Aguardando direcionamento</option>
            <option value="assigned">Direcionada</option>
            <option value="completed">Concluída</option>
            <option value="cancelled">Cancelada</option>
            <option value="all">Todos</option>
          </select>
        </label>
      </div>

      {readySchedules.length > 0 && (
        <section className="inspection-types-panel">
          <div>
            <h2>Agendamentos concluídos</h2>
            <p>Clique para abrir o relatório, aprovar, reprovar ou baixar o PDF.</p>
          </div>
          <div className="schedule-list">
            {readySchedules.map((schedule) => (
              <button type="button" className="completed-schedule-card" key={schedule.id} onClick={() => openScheduleInspection(schedule)}>
                <span>
                  <strong>{schedule.driver_profile_name || schedule.driver_name || 'Motorista sem nome'}</strong>
                  <small>{schedule.truck_plate} / {schedule.trailer_plate}</small>
                </span>
                <span className="completed-card-action">
                  <Eye size={17} /> Ver PDF
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="schedule-list">
        {filtered.length === 0 && <div className="empty-card">Nenhuma vistoria agendada encontrada.</div>}
        {filtered.map((schedule) => (
          <article className={`schedule-row ${schedule.inspection_id ? 'ready' : ''}`} key={schedule.id} onClick={() => setDetailSchedule(schedule)}>
            <div className="schedule-date">
              <CalendarDays size={20} />
              <strong>{formatDate(schedule.scheduled_date)}</strong>
              <span>{schedule.scheduled_time || 'Sem horário'}</span>
            </div>
            <div>
              <strong>{schedule.driver_profile_name || schedule.driver_name}</strong>
              <small>{schedule.truck_plate} / {schedule.trailer_plate}</small>
              {schedule.inspection_id && (
                <button type="button" className="inline-link" onClick={(event) => {
                  event.stopPropagation();
                  openScheduleInspection(schedule);
                }}>
                  Ver relatório e PDF
                </button>
              )}
              {schedule.notes && <p>{schedule.notes}</p>}
            </div>
            <label>
              Vistoriador
              <select
                value={schedule.assigned_inspector_id || ''}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateSchedule(schedule, { assigned_inspector_id: event.target.value })}
                disabled={schedule.status === 'completed'}
              >
                <option value="">A definir</option>
                {inspectors.map((inspector) => (
                  <option key={inspector.id} value={inspector.id}>{inspector.full_name || inspector.email}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={schedule.status} onClick={(event) => event.stopPropagation()} onChange={(event) => updateSchedule(schedule, { status: event.target.value })}>
                <option value="scheduled">Agendada</option>
                <option value="assigned">Direcionada</option>
                <option value="completed">Concluída</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </label>
            <button type="button" className="row-delete" onClick={(event) => {
              event.stopPropagation();
              onDelete(schedule.id);
            }} title="Excluir agendamento">
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>

      {detailSchedule && (
        <ScheduleDetailModal
          schedule={detailSchedule}
          inspection={detailSchedule.inspection_id ? inspectionsById.get(detailSchedule.inspection_id) : null}
          onClose={() => setDetailSchedule(null)}
          onOpenInspection={() => openScheduleInspection(detailSchedule)}
        />
      )}
    </div>
  );
}

function DriverSchedulePage({ profile, schedules, onSave, onLogout }) {
  return (
    <main className="driver-page">
      <section className="driver-shell">
        <header className="driver-header">
          <div className="brand large">
            <img src={LOGO_URL} alt="EN" />
            <span>
              <strong>Agendar vistoria</strong>
              <small>{profile?.full_name || profile?.email}</small>
            </span>
          </div>
          <div className="toolbar-actions">
            <button className="secondary-action" type="button" onClick={onLogout}><LogOut size={18} /> Sair</button>
          </div>
        </header>

        <section className="driver-grid">
          <article className="access-card">
            <div className="section-title">
              <CalendarDays size={22} />
              <div>
                <h1>Solicitar vistoria</h1>
                <p>Informe as placas e o dia desejado. A equipe direciona a vistoria para um vistoriador.</p>
              </div>
            </div>
            <ScheduleForm compact onSave={onSave} />
          </article>

          <article className="access-card">
            <div className="section-title">
              <UserCheck size={22} />
              <div>
                <h1>Minhas solicitações</h1>
                <p>Acompanhe o andamento dos seus agendamentos.</p>
              </div>
            </div>
            <div className="schedule-list compact">
              {schedules.length === 0 && <div className="empty-card">Nenhuma vistoria agendada.</div>}
              {schedules.map((schedule) => (
                <div className="schedule-row driver" key={schedule.id}>
                  <div className="schedule-date">
                    <strong>{formatDate(schedule.scheduled_date)}</strong>
                    <span>{schedule.scheduled_time || 'Sem horário'}</span>
                  </div>
                  <div>
                    <strong>{schedule.truck_plate} / {schedule.trailer_plate}</strong>
                    <small>{scheduleStatusLabel(schedule.status)}</small>
                    {schedule.inspector_name && <p>Vistoriador: {schedule.inspector_name}</p>}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function ScheduleDetailModal({ schedule, inspection, onClose, onOpenInspection }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="profile-modal schedule-detail-modal">
        <div className="modal-header">
          <div>
            <h2>Solicitação de vistoria</h2>
            <p>{schedule.driver_profile_name || schedule.driver_name || 'Motorista sem nome'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar detalhes">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="detail-grid-list">
          <span><strong>Nome do solicitante</strong>{schedule.driver_profile_name || schedule.driver_name || '-'}</span>
          <span><strong>Tipo da solicitação</strong>{inspection && isAutocheckInspection(inspection) ? 'Autocheck' : 'Agendada'}</span>
          <span><strong>Placa cavalo</strong>{schedule.truck_plate || '-'}</span>
          <span><strong>Placa carreta</strong>{schedule.trailer_plate || '-'}</span>
          <span><strong>Data</strong>{formatDate(schedule.scheduled_date)}</span>
          <span><strong>Horário</strong>{schedule.scheduled_time || 'Sem horário'}</span>
          <span><strong>Status</strong>{scheduleStatusLabel(schedule.status)}</span>
          <span className="wide"><strong>Observações</strong>{schedule.notes || '-'}</span>
          <span className="wide"><strong>Histórico da vistoria</strong>{inspection ? `${statusLabel(inspection.status)} em ${formatDate(inspection.created_at)}` : 'Ainda não há vistoria vinculada.'}</span>
        </div>
        <div className="modal-actions">
          {inspection && <button type="button" className="primary-action" onClick={onOpenInspection}><Download size={18} /> Abrir relatório/PDF</button>}
          <button type="button" className="secondary-action" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/web-login', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.session?.access_token || !payload.session?.refresh_token) {
        throw new Error(payload.error || 'Login não realizado.');
      }
      storeSession(payload.session);
      window.location.reload();
    } catch (loginError) {
      setError(loginError.message);
    }
    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <img src={HERO_IMAGE_URL} alt="" />
        <div className="hero-overlay" />
        <div className="hero-copy">
          <span />
          <h1>Excelência em Transporte e Logística</h1>
        </div>
      </section>
      <form className="login-panel" onSubmit={submit}>
        <div className="login-logo">
          <img src={LOGO_URL} alt="EN" />
          <strong>Vistorias | EN</strong>
          <span>ACOMPANHAMENTO DE VISTORIAS</span>
        </div>
        <label>
          E-MAIL CORPORATIVO
          <div className="input-shell">
            <Mail size={19} />
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@empresa.com" />
          </div>
        </label>
        <label>
          SENHA DE ACESSO
          <div className="input-shell">
            <ShieldCheck size={19} />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Senha" />
          </div>
        </label>
        {error && <p className="error-box">{error}</p>}
        <button className="primary-action portal-button" type="submit">{loading ? 'Entrando...' : 'ENTRAR NO PORTAL'}</button>
      </form>
    </main>
  );
}

function AccessDenied({ profile }) {
  return (
    <main className="center-state access-state">
      <ShieldCheck size={44} />
      <h1>Acesso web não permitido</h1>
      <p>{profile?.email || 'Este usuário'} possui perfil {roleLabel(profile?.access_role)} sem acesso ao painel administrativo.</p>
      <button className="primary-action" onClick={logoutLocal}>Voltar ao login</button>
    </main>
  );
}

function AccessSetupNotice() {
  return (
    <main className="center-state access-state">
      <ShieldCheck size={44} />
      <h1>Acesso não liberado</h1>
      <p>Este login ainda não foi liberado no painel. Entre com um usuário criado em Acessos.</p>
      <button className="primary-action" onClick={logoutLocal}>Sair</button>
    </main>
  );
}

function RequirementsPanel({ config, onReload, onSaveCategory, onDeleteCategory, onConfirm }) {
  const categories = (config?.categories || []).filter((category) => category.active !== false);
  const pdfModels = config?.pdf_models || [];
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState('screen2');
  const [selectedEditor, setSelectedEditor] = useState({ type: 'photo', id: '' });
  const [previewIssueId, setPreviewIssueId] = useState('');
  const [newDraftOpen, setNewDraftOpen] = useState(false);
  const [iconModalOpen, setIconModalOpen] = useState(false);

  useEffect(() => {
    if (!categories.length) {
      setSelectedId('');
      setDraft(null);
      return;
    }
    if (newDraftOpen && selectedId && !categories.some((category) => category.id === selectedId)) return;
    const nextId = selectedId && categories.some((category) => category.id === selectedId)
      ? selectedId
      : categories[0].id;
    if (nextId !== selectedId) setSelectedId(nextId);
    const category = categories.find((item) => item.id === nextId);
    const nextDraft = category ? seedCategoryRequirements(category, config) : null;
    setDraft(nextDraft);
    setSelectedEditor((current) => {
      if (!nextDraft) return { type: 'photo', id: '' };
      if (current.id && [...(nextDraft.photo_fields || []), ...(nextDraft.table_items || [])].some((item) => item.id === current.id)) return current;
      return nextDraft.photo_fields?.[0]
        ? { type: 'photo', id: nextDraft.photo_fields[0].id }
        : { type: 'photo', id: '' };
    });
  }, [config?.updated_at, categories.length, selectedId, newDraftOpen]);

  useEffect(() => {
    if (!draft) return;
    if (selectedScreen === 'screen1') {
      const fields = appFieldsForDraft(draft);
      setSelectedEditor((current) => (current.type === 'app' && fields.some((item) => item.id === current.id))
        ? current
        : { type: 'app', id: fields[0]?.id || '' });
    } else if (selectedScreen === 'screen2') {
      setSelectedEditor((current) => (current.type === 'photo' && (draft.photo_fields || []).some((item) => item.id === current.id))
        ? current
        : { type: 'photo', id: draft.photo_fields?.[0]?.id || '' });
    } else {
      setSelectedEditor((current) => (current.type === 'item' && (draft.table_items || []).some((item) => item.id === current.id))
        ? current
        : { type: 'item', id: draft.table_items?.[0]?.id || '' });
    }
  }, [selectedScreen, draft?.id]);

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updatePdfHeader(patch) {
    setDraft((current) => ({
      ...current,
      pdf: {
        ...(current?.pdf || {}),
        ...patch,
      },
    }));
  }

  function selectedPdfModel() {
    return pdfModels.find((model) => model.id === draft?.pdf_model_id) || pdfModels[0] || null;
  }

  function defaultPdfModelId() {
    return selectedPdfModel()?.id || pdfModels[0]?.id || '';
  }

  function addInspectionType() {
    const basePdfModel = pdfModels[0];
    const id = `vistoria-${Date.now()}`;
    const nextCategory = seedCategoryRequirements({
      id,
      name: 'Nova vistoria',
      icon: 'clipboard-check',
      color: '#0b74de',
      pdf_model_id: basePdfModel?.id || '',
      flow: 'inspection',
      destination: 'inspector',
      sort_order: categories.length + 1,
      active: true,
      permissions: {
        create: ['inspector'],
        approve: ['admin'],
        view: ['admin', 'inspector'],
        edit: ['admin'],
        delete: ['admin'],
        notify: ['admin'],
      },
      pdf: {
        ...(basePdfModel?.pdf || {}),
        subtitle: 'NOVA VISTORIA',
      },
      app_fields: DEFAULT_APP_STEP_FIELDS,
      photo_fields: [],
      table_items: [],
    }, config);
    setNewDraftOpen(true);
    setSelectedId(id);
    setDraft(nextCategory);
    setSelectedScreen('screen1');
    setSelectedEditor({ type: 'app', id: nextCategory.app_fields?.[0]?.id || '' });
    setMessage('Novo tipo criado em rascunho. Configure e clique em Salvar requisitos.');
  }

  function updatePermission(role, checked) {
    setDraft((current) => {
      const create = new Set(current?.permissions?.create || []);
      if (checked) create.add(role);
      else create.delete(role);
      return {
        ...current,
        permissions: {
          ...(current?.permissions || {}),
          create: [...create],
          view: [...new Set([...(current?.permissions?.view || []), role, 'admin'].filter(Boolean))],
        },
      };
    });
  }

  function updateStarterRole(role) {
    setDraft((current) => ({
      ...current,
      permissions: {
        ...(current?.permissions || {}),
        create: role ? [role] : [],
        view: [...new Set([...(current?.permissions?.view || []), role, 'admin'].filter(Boolean))],
      },
    }));
  }

  function updateCollection(collection, id, patch) {
    setDraft((current) => ({
      ...current,
      [collection]: (current?.[collection] || []).map((item) => (
        item.id === id ? { ...item, ...patch } : item
      )),
    }));
  }

  function updatePhotoLimits(id, patch) {
    setDraft((current) => ({
      ...current,
      photo_fields: (current?.photo_fields || []).map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        const minPhotos = Math.max(next.required === false ? 0 : 1, Number(next.min_photos) || 0);
        const maxPhotos = Math.max(minPhotos || 1, Number(next.max_photos) || 1);
        return { ...next, min_photos: minPhotos, max_photos: maxPhotos };
      }),
    }));
  }

  async function deleteInspectionType(category) {
    if (!category?.id) return;
    if (newDraftOpen && category.id === draft?.id && !categories.some((item) => item.id === category.id)) {
      setNewDraftOpen(false);
      setSelectedId(categories[0]?.id || '');
      setMessage('Tipo novo descartado.');
      return;
    }
    const confirmed = await onConfirm({
      title: 'Excluir tipo de vistoria',
      message: `Excluir "${category.name}" da lista de vistorias?`,
      confirmLabel: 'Excluir',
    });
    if (!confirmed) return;
    setSaving(true);
    setMessage('');
    try {
      await onDeleteCategory(category.id);
      const nextCategory = categories.find((item) => item.id !== category.id) || null;
      setNewDraftOpen(false);
      setSelectedId(nextCategory?.id || '');
      setDraft(nextCategory ? seedCategoryRequirements(nextCategory, config) : null);
      setMessage('Tipo de vistoria excluído da lista.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  function removeFromCollection(collection, id) {
    setDraft((current) => {
      const nextList = (current?.[collection] || []).filter((item) => item.id !== id);
      const nextType = collection === 'app_fields' ? 'app' : collection === 'table_items' ? 'item' : 'photo';
      setSelectedEditor({ type: nextType, id: nextList[0]?.id || '' });
      return {
        ...current,
        [collection]: nextList,
      };
    });
    setPreviewIssueId('');
  }

  function appFieldsForDraft(source = draft) {
    return (source?.app_fields || [])
      .filter((item) => item.active !== false && item.show_in_app !== false && !['signature', 'observation'].includes(item.field_type) && !['signature', 'observations'].includes(item.id))
      .sort((left, right) => (Number(left.order) || 999) - (Number(right.order) || 999));
  }

  function addAppField() {
    const id = `app-field-${Date.now()}`;
    setDraft((current) => {
      const list = current?.app_fields || [];
      return {
        ...current,
        app_fields: [
          ...list,
          {
            id,
            label: 'Novo campo',
            field_type: 'text',
            required: true,
            active: true,
            show_in_app: true,
            show_in_pdf: true,
            order: appFieldsForDraft(current).length + 1,
          },
        ],
      };
    });
    setSelectedEditor({ type: 'app', id });
  }

  function addPhotoField() {
    const id = `photo-${Date.now()}`;
    setDraft((current) => {
      const list = current?.photo_fields || [];
      return {
        ...current,
        photo_fields: [
          ...list,
          {
            id,
            code: `A.${String(list.length + 1).padStart(2, '0')}`,
            label: 'Nova foto obrigatoria',
            required: true,
            min_photos: 1,
            max_photos: 1,
            show_conformity: true,
            require_nonconformity_note: true,
            show_in_app: true,
            show_in_pdf: true,
            active: true,
            order: list.length + 1,
          },
        ],
      };
    });
    setSelectedEditor({ type: 'photo', id });
  }

  function addTableItem() {
    const id = `table-item-${Date.now()}`;
    setDraft((current) => {
      const list = current?.table_items || [];
      return {
        ...current,
        table_items: [
          ...list,
          {
            id,
            code: String(list.length + 1).padStart(2, '0'),
            label: 'Novo requisito aplicavel',
            category: 'Vistoria Agregados',
            aggregator: 'Vistoria Agregados',
            requires_photo: false,
            required: false,
            min_photos: 0,
            max_photos: 1,
            show_in_app: true,
            show_in_pdf: true,
            active: true,
            order: list.length + 1,
          },
        ],
      };
    });
    setSelectedEditor({ type: 'item', id });
  }

  function setSignatureEnabled(enabled) {
    setDraft((current) => {
      const list = current?.app_fields || [];
      const existing = list.find((item) => item.field_type === 'signature');
      if (existing) {
        return {
          ...current,
          app_fields: list.map((item) => (
            item.id === existing.id ? { ...item, active: enabled, show_in_app: true, show_in_pdf: true } : item
          )),
        };
      }
      return {
        ...current,
        app_fields: [
          ...list,
          {
            id: `signature-${Date.now()}`,
            label: 'Assinatura do Vistoriador',
            field_type: 'signature',
            required: true,
            active: enabled,
            show_in_app: true,
            show_in_pdf: true,
            order: list.length + 1,
          },
        ],
      };
    });
  }

  function updateSignature(patch) {
    setDraft((current) => {
      const list = current?.app_fields || [];
      const existing = list.find((item) => item.field_type === 'signature');
      if (!existing) return current;
      return {
        ...current,
        app_fields: list.map((item) => (
          item.id === existing.id ? { ...item, ...patch } : item
        )),
      };
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setMessage('');
    try {
      await onSaveCategory({
        ...draft,
        pdf_model_id: draft.pdf_model_id || defaultPdfModelId(),
        app_fields: (draft.app_fields || []).map((item, index) => ({ ...item, order: Number(item.order) || index + 1 })),
        photo_fields: (draft.photo_fields || []).map((item, index) => ({ ...item, order: index + 1 })),
        table_items: (draft.table_items || []).map((item, index) => ({ ...item, order: index + 1 })),
      });
      setNewDraftOpen(false);
      setMessage('Requisitos salvos. O app usará este modelo nas próximas vistorias.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="requirements-page">
        <header className="checklists-header flat">
          <div>
            <h1>Requisitos</h1>
            <p>Carregando modelos de vistoria.</p>
          </div>
        </header>
      </div>
    );
  }

  const signature = (draft?.app_fields || []).find((item) => item.field_type === 'signature');
  const selectedPhoto = (draft?.photo_fields || []).find((item) => item.id === selectedEditor.id);
  const selectedItem = (draft?.table_items || []).find((item) => item.id === selectedEditor.id);
  const appFields = appFieldsForDraft(draft);
  const selectedAppField = appFields.find((item) => item.id === selectedEditor.id);
  const visibleCategories = newDraftOpen && draft && !categories.some((category) => category.id === draft.id)
    ? [draft, ...categories]
    : categories;
  const selectedIcon = INSPECTION_ICON_OPTIONS.find((item) => item.value === draft?.icon) || INSPECTION_ICON_OPTIONS[0];
  const SelectedIconComponent = selectedIcon.Icon;
  const previewPdf = {
    ...(selectedPdfModel()?.pdf || {}),
    ...(draft?.pdf || {}),
  };

  return (
    <div className="requirements-page">
      <header className="checklists-header flat">
        <div>
          <h1>Requisitos</h1>
          <p>Configure tipos de vistoria, direcionamento, telas do app e cabeçalho do PDF.</p>
        </div>
      </header>

      <form className="requirements-layout visual" onSubmit={save}>
        <aside className="requirements-side">
          <div className="requirements-side-head">
            <span className="field-title">Vistorias</span>
            <InfoTip text="Escolha qual vistoria será configurada. Novo tipo aparece no app conforme os perfis marcados." />
          </div>
          {visibleCategories.map((category) => (
            <div className={category.id === selectedId ? 'requirement-type-wrap active' : 'requirement-type-wrap'} key={category.id}>
              <button
                type="button"
                className="requirement-type"
                onClick={() => {
                  setNewDraftOpen(false);
                  setSelectedId(category.id);
                }}
              >
                <span className="requirement-type-icon" style={{ backgroundColor: category.color || '#0b74de' }}>
                  <InspectionIcon name={category.icon} size={18} />
                </span>
                <strong>{category.name}</strong>
                <small>{(category.permissions?.create || []).map(roleLabel).join(', ') || 'Sem perfil'}</small>
              </button>
              <button type="button" className="requirement-delete-button" onClick={() => deleteInspectionType(category)} title="Excluir tipo de vistoria">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button type="button" className="new-type-button" onClick={addInspectionType}>
            <Plus size={17} /> Novo tipo
          </button>
        </aside>

        {draft && (
          <section className="requirements-builder">
            {message && <p className="info-box">{message}</p>}
            <div className="requirements-top-card">
              <div>
                <h2>Tipo de vistoria</h2>
                <p>Nome, destino no app e modelo de PDF usado quando o relatório for gerado.</p>
              </div>
              <div className="requirements-top-grid">
                <label>
                  Nome no app
                  <input value={draft.name || ''} onChange={(event) => updateDraft({ name: event.target.value })} required />
                </label>
                <label>
                  Ícone
                  <button className="icon-select-button" type="button" onClick={() => setIconModalOpen(true)}>
                    <span style={{ backgroundColor: draft.color || '#0b74de' }}>
                      <SelectedIconComponent size={20} />
                    </span>
                    {selectedIcon.label}
                  </button>
                </label>
                <label>
                  Cor do botão no app
                  <input type="color" value={draft.color || '#0b74de'} onChange={(event) => updateDraft({ color: event.target.value })} />
                </label>
                <label>
                  <span className="label-with-info">
                    Como essa vistoria será iniciada
                    <InfoTip text="Vistoria avulsa é somente para o vistoriador iniciar direto no app, sem agendamento. Para motorista, use Autocheck motorista. Para data marcada, use Agendamento." />
                  </span>
                  <select value={draft.flow || 'inspection'} onChange={(event) => updateDraft({ flow: event.target.value, destination: event.target.value === 'autocheck' ? 'autocheck' : event.target.value === 'schedule' ? 'schedules' : 'inspector' })}>
                    <option value="inspection">Vistoria avulsa - vistoriador</option>
                    <option value="autocheck">Autocheck - motorista</option>
                    <option value="schedule">Agendamento - data marcada</option>
                  </select>
                </label>
                <label>
                  Direcionar para
                  <select value={draft.destination || 'inspector'} onChange={(event) => updateDraft({ destination: event.target.value })}>
                    <option value="inspector">Vistoriador</option>
                    <option value="autocheck">Motorista Autocheck</option>
                    <option value="schedules">Agendamentos</option>
                  </select>
                </label>
              </div>
              <div className="starter-role-field">
                <label>
                  <span className="label-with-info">
                    Quem pode iniciar
                    <InfoTip text="Define para qual perfil este botão aparece no app. Vistoriador/App é para a equipe interna; Motorista é para o condutor; Administrador é para uso do painel." />
                  </span>
                  <select
                    value={(draft.permissions?.create || [])[0] || ''}
                    onChange={(event) => updateStarterRole(event.target.value)}
                  >
                    <option value="">Selecione um perfil</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option value={role.value} key={role.value}>{role.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {iconModalOpen && (
              <div className="modal-backdrop icon-modal-backdrop" role="dialog" aria-modal="true">
                <div className="profile-modal icon-picker-modal">
                  <div className="modal-header">
                    <div>
                      <h2>Escolher ícone</h2>
                      <p>Selecione um ícone pré-definido para aparecer no app e no painel.</p>
                    </div>
                    <button type="button" onClick={() => setIconModalOpen(false)} aria-label="Fechar seleção de ícone"><X size={20} aria-hidden="true" /></button>
                  </div>
                  <div className="icon-picker-grid">
                    {INSPECTION_ICON_OPTIONS.map(({ value, label, Icon }) => (
                      <button
                        type="button"
                        className={draft.icon === value ? 'icon-picker-option active' : 'icon-picker-option'}
                        key={value}
                        onClick={() => {
                          updateDraft({ icon: value });
                          setIconModalOpen(false);
                        }}
                      >
                        <span style={{ backgroundColor: draft.color || '#0b74de' }}><Icon size={22} /></span>
                        <strong>{label}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="requirements-screen-select">
              <label>
                Tela para configurar
                <select value={selectedScreen} onChange={(event) => setSelectedScreen(event.target.value)}>
                  <option value="screen1">Tela 1 - Dados da vistoria</option>
                  <option value="screen2">Tela 2 - Fotos obrigatórias</option>
                  <option value="screen3">Tela 3 - Itens aplicáveis</option>
                  <option value="pdf">Configuração do PDF</option>
                </select>
              </label>
            </div>

            {selectedScreen === 'screen1' && (
              <div className="visual-builder-grid">
                <section className="mobile-requirements-preview" aria-label="Preview da tela 1 do app">
                  <div className="mobile-preview-header">
                    <button type="button" aria-label="Voltar"><span /></button>
                    <div>
                      <h2>Nova vistoria</h2>
                      <p>Etapa 1 de 3</p>
                    </div>
                  </div>
                  <div className="mobile-preview-body">
                    <div className="mobile-progress-row step-one">
                      <span><i /></span>
                      <strong>1/3</strong>
                    </div>
                    <div className="mobile-card-preview">
                      <div className="mobile-card-title-row">
                        <h3>Dados da vistoria</h3>
                        <button type="button" className="mobile-add-mini" onClick={addAppField}><Plus size={16} /> Campo</button>
                      </div>
                      {appFields.map((field) => (
                        <div
                          className={selectedEditor.type === 'app' && selectedEditor.id === field.id ? 'mobile-field-preview selected' : 'mobile-field-preview'}
                          key={field.id}
                        >
                          <button type="button" className="mobile-field-preview-main" onClick={() => setSelectedEditor({ type: 'app', id: field.id })}>
                          <strong>{field.label}</strong>
                          <span>{field.placeholder || field.label}</span>
                          <small>{['plate', 'truck_plate', 'trailer_plate'].includes(field.field_type) ? 'Formato: ABC-1234 ou ABC-1D23' : field.required ? 'Campo obrigatório' : 'Opcional'}</small>
                          </button>
                          <button
                            type="button"
                            className="mobile-field-preview-delete"
                            onClick={() => removeFromCollection('app_fields', field.id)}
                            title="Remover campo"
                            aria-label={`Remover ${field.label}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                      {!appFields.length && (
                        <p className="muted">Nenhum campo na Tela 1. Use "Campo" para adicionar somente o que for necessÃ¡rio.</p>
                      )}
                    </div>
                  </div>
                </section>

                <aside className="visual-config-panel">
                  <div className="requirements-section">
                    <div className="requirements-section-title">
                      <h2>Editar campo da Tela 1</h2>
                      {selectedAppField && (
                        <button type="button" className="danger-icon-button" onClick={() => removeFromCollection('app_fields', selectedAppField.id)} title="Remover campo"><Trash2 size={16} /></button>
                      )}
                    </div>
                    {selectedAppField ? (
                      <div className="visual-config-fields">
                        <label>Nome do campo<input value={selectedAppField.label || ''} onChange={(event) => updateCollection('app_fields', selectedAppField.id, { label: event.target.value })} /></label>
                        <label>Tipo
                          <select value={selectedAppField.field_type || 'text'} onChange={(event) => updateCollection('app_fields', selectedAppField.id, { field_type: event.target.value })}>
                            <option value="text">Texto</option>
                            <option value="number">Número</option>
                            <option value="driver">Nome do motorista</option>
                            <option value="truck_plate">Placa cavalo</option>
                            <option value="trailer_plate">Placa carreta</option>
                          </select>
                        </label>
                        <label><input type="checkbox" checked={selectedAppField.required !== false} onChange={(event) => updateCollection('app_fields', selectedAppField.id, { required: event.target.checked })} /> Obrigatório</label>
                      </div>
                    ) : (
                      <p className="muted">Selecione um campo no preview ou adicione um novo campo.</p>
                    )}
                  </div>
                </aside>
              </div>
            )}

            {selectedScreen === 'screen2' && (
            <div className="visual-builder-grid">
              <section className="mobile-requirements-preview" aria-label="Preview da etapa 2 do app">
                <div className="mobile-preview-header">
                  <button type="button" aria-label="Voltar"><span /></button>
                  <div>
                    <h2>Nova vistoria</h2>
                    <p>Etapa 2 de 3</p>
                  </div>
                </div>
                <div className="mobile-preview-body">
                  <div className="mobile-progress-row">
                    <span><i /></span>
                    <strong>2/3</strong>
                  </div>
                  <div className="mobile-card-preview">
                    <div className="mobile-card-title-row">
                      <h3>Fotos obrigatórias</h3>
                      <button type="button" className="mobile-add-mini" onClick={addPhotoField}><Plus size={16} /> Foto</button>
                    </div>
                    {(draft.photo_fields || []).map((item) => {
                      const selected = selectedEditor.type === 'photo' && selectedEditor.id === item.id;
                      const isIssuePreview = previewIssueId === item.id;
                      return (
                        <div className={selected ? 'mobile-edit-block selected' : 'mobile-edit-block'} key={item.id}>
                          <button type="button" className="mobile-photo-card" onClick={() => setSelectedEditor({ type: 'photo', id: item.id })}>
                            <b>{item.code || 'A.00'}</b>
                            <span>
                              <strong>{item.label || 'Nova foto'}</strong>
                              <em>
                                {item.required !== false ? 'Pendente' : 'Opcional'} · 0 anexo(s) · mínimo {Math.max(item.required === false ? 0 : 1, Number(item.min_photos) || 0)} · máximo {Math.max(Math.max(item.required === false ? 0 : 1, Number(item.min_photos) || 0) || 1, Number(item.max_photos) || 1)}
                              </em>
                              {item.required !== false && <small>Foto obrigatória pendente.</small>}
                            </span>
                            <Camera size={34} />
                          </button>
                          {item.show_conformity !== false && (
                            <div className="mobile-response-area">
                              <strong>Resposta</strong>
                              <span>
                                <button type="button" className={isIssuePreview ? '' : 'active'} onClick={() => {
                                  setSelectedEditor({ type: 'photo', id: item.id });
                                  setPreviewIssueId('');
                                }}>Conforme</button>
                                <button type="button" className={isIssuePreview ? 'danger active' : ''} onClick={() => {
                                  setSelectedEditor({ type: 'photo', id: item.id });
                                  setPreviewIssueId(item.id);
                                }}>Não conforme</button>
                              </span>
                              {isIssuePreview && item.require_nonconformity_note !== false && (
                                <div className="mobile-nonconformity-preview">
                                  <strong>Descreva a não conformidade</strong>
                                  <textarea placeholder="Descreva a não conformidade" readOnly />
                                  <small>A foto principal deste item já será usada como evidência.</small>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button type="button" className="mobile-next-button">Próximo</button>
                  </div>
                </div>
              </section>

              <aside className="visual-config-panel">
                <div className="requirements-section">
                  <div className="requirements-section-title">
                    <h2>{selectedEditor.type === 'item' ? 'Editar solicitação selecionada' : 'Editar foto selecionada'}</h2>
                    {selectedPhoto && (
                      <button type="button" className="danger-icon-button" onClick={() => removeFromCollection('photo_fields', selectedPhoto.id)} title="Remover foto"><Trash2 size={16} /></button>
                    )}
                    {selectedItem && (
                      <button type="button" className="danger-icon-button" onClick={() => removeFromCollection('table_items', selectedItem.id)} title="Remover solicitação"><Trash2 size={16} /></button>
                    )}
                  </div>
                  {selectedEditor.type === 'photo' && selectedPhoto ? (
                    <div className="visual-config-fields">
                      <label>Código<input value={selectedPhoto.code || ''} onChange={(event) => updateCollection('photo_fields', selectedPhoto.id, { code: event.target.value })} /></label>
                      <label>Nome que aparece no app<input value={selectedPhoto.label || ''} onChange={(event) => updateCollection('photo_fields', selectedPhoto.id, { label: event.target.value })} /></label>
                      <div className="photo-limit-grid">
                        <label>
                          Mínimo de fotos
                          <input
                            type="number"
                            min={selectedPhoto.required === false ? 0 : 1}
                            max="30"
                            value={selectedPhoto.min_photos ?? (selectedPhoto.required === false ? 0 : 1)}
                            onChange={(event) => updatePhotoLimits(selectedPhoto.id, { min_photos: Number(event.target.value) })}
                          />
                        </label>
                        <label>
                          Máximo de fotos
                          <input
                            type="number"
                            min={Math.max(selectedPhoto.required === false ? 0 : 1, Number(selectedPhoto.min_photos) || 0) || 1}
                            max="30"
                            value={selectedPhoto.max_photos ?? 1}
                            onChange={(event) => updatePhotoLimits(selectedPhoto.id, { max_photos: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                      <label><input type="checkbox" checked={selectedPhoto.required !== false} onChange={(event) => updatePhotoLimits(selectedPhoto.id, { required: event.target.checked, min_photos: event.target.checked ? Math.max(1, Number(selectedPhoto.min_photos) || 1) : 0 })} /> Obrigatório</label>
                      <label><input type="checkbox" checked={selectedPhoto.show_conformity !== false} onChange={(event) => updateCollection('photo_fields', selectedPhoto.id, { show_conformity: event.target.checked })} /> Mostrar Conforme / Não conforme</label>
                      <label><input type="checkbox" checked={selectedPhoto.require_nonconformity_note !== false} onChange={(event) => updateCollection('photo_fields', selectedPhoto.id, { require_nonconformity_note: event.target.checked })} /> Pedir motivo quando for Não conforme</label>
                    </div>
                  ) : selectedEditor.type === 'item' && selectedItem ? (
                    <div className="visual-config-fields">
                      <label>Código<input value={selectedItem.code || ''} onChange={(event) => updateCollection('table_items', selectedItem.id, { code: event.target.value })} /></label>
                      <label>Solicitação ao condutor<input value={selectedItem.label || ''} onChange={(event) => updateCollection('table_items', selectedItem.id, { label: event.target.value })} /></label>
                      <label><input type="checkbox" checked={Boolean(selectedItem.requires_photo)} onChange={(event) => updateCollection('table_items', selectedItem.id, { requires_photo: event.target.checked, min_photos: event.target.checked ? 1 : 0 })} /> Pedir foto quando esta solicitação for aplicável</label>
                      <label><input type="checkbox" checked={Boolean(selectedItem.allow_observation || selectedItem.requires_observation)} onChange={(event) => updateCollection('table_items', selectedItem.id, { allow_observation: event.target.checked, requires_observation: event.target.checked })} /> Pedir observação</label>
                    </div>
                  ) : (
                    <p className="muted">Selecione uma foto no preview ou uma solicitação abaixo.</p>
                  )}
                </div>

                <div className="requirements-section">
                  <div className="requirements-section-title">
                    <div>
                      <h2>Itens aplicáveis</h2>
                      <p className="section-hint">Solicitações que você direciona para o condutor cumprir na vistoria.</p>
                    </div>
                    <button className="secondary-action compact-action" type="button" onClick={addTableItem}>
                      <Plus size={17} /> Solicitação
                    </button>
                  </div>
                  <div className="compact-item-list">
                    {(draft.table_items || []).map((item) => (
                      <button type="button" className={selectedEditor.id === item.id ? 'compact-item selected' : 'compact-item'} key={item.id} onClick={() => setSelectedEditor({ type: 'item', id: item.id })}>
                        <strong>{item.label}</strong>
                        <small>{item.requires_photo ? 'Pede foto' : 'Sem foto'}{item.allow_observation || item.requires_observation ? ' · Observação' : ''}</small>
                      </button>
                    ))}
                    {(draft.table_items || []).length === 0 && <p className="muted">Nenhuma solicitação configurada.</p>}
                  </div>
                </div>
              </aside>
            </div>
            )}

            {selectedScreen === 'screen3' && (
              <div className="visual-builder-grid">
                <section className="mobile-requirements-preview" aria-label="Preview da tela 3 do app">
                  <div className="mobile-preview-header">
                    <button type="button" aria-label="Voltar"><span /></button>
                    <div>
                      <h2>Nova vistoria</h2>
                      <p>Etapa 3 de 3</p>
                    </div>
                  </div>
                  <div className="mobile-preview-body">
                    <div className="mobile-progress-row full">
                      <span><i /></span>
                      <strong>3/3</strong>
                    </div>
                    <div className="mobile-card-preview">
                      <div className="mobile-card-title-row">
                        <div>
                          <h3>Itens aplicáveis</h3>
                          <p className="section-hint">Solicitações direcionadas ao condutor.</p>
                        </div>
                        <button type="button" className="mobile-add-mini" onClick={addTableItem}><Plus size={16} /> Solicitação</button>
                      </div>
                      {(draft.table_items || []).map((item) => (
                        <button
                          type="button"
                          className={selectedEditor.type === 'item' && selectedEditor.id === item.id ? 'mobile-field-preview selected' : 'mobile-field-preview'}
                          key={item.id}
                          onClick={() => setSelectedEditor({ type: 'item', id: item.id })}
                        >
                          <strong>{item.label}</strong>
                          <span>{item.requires_photo ? 'Pedir foto quando aplicável' : 'Solicitação sem foto'}</span>
                          <small>{item.allow_observation || item.requires_observation ? 'Com observação' : 'Sem observação'}</small>
                        </button>
                      ))}
                      {(draft.table_items || []).length === 0 && <p className="muted">Nenhuma solicitação configurada.</p>}
                    </div>
                  </div>
                </section>

                <aside className="visual-config-panel">
                  <div className="requirements-section">
                    <div className="requirements-section-title">
                      <div>
                        <h2>Editar solicitação</h2>
                        <p className="section-hint">Itens aplicáveis são pedidos enviados para o condutor cumprir.</p>
                      </div>
                      {selectedItem && (
                        <button type="button" className="danger-icon-button" onClick={() => removeFromCollection('table_items', selectedItem.id)} title="Remover solicitação"><Trash2 size={16} /></button>
                      )}
                    </div>
                    {selectedItem ? (
                      <div className="visual-config-fields">
                        <label>Código<input value={selectedItem.code || ''} onChange={(event) => updateCollection('table_items', selectedItem.id, { code: event.target.value })} /></label>
                        <label>Solicitação ao condutor<input value={selectedItem.label || ''} onChange={(event) => updateCollection('table_items', selectedItem.id, { label: event.target.value })} /></label>
                        <label><input type="checkbox" checked={Boolean(selectedItem.requires_photo)} onChange={(event) => updateCollection('table_items', selectedItem.id, { requires_photo: event.target.checked, min_photos: event.target.checked ? 1 : 0 })} /> Pedir foto quando esta solicitação for aplicável</label>
                        <label><input type="checkbox" checked={Boolean(selectedItem.allow_observation || selectedItem.requires_observation)} onChange={(event) => updateCollection('table_items', selectedItem.id, { allow_observation: event.target.checked, requires_observation: event.target.checked })} /> Pedir observação</label>
                      </div>
                    ) : (
                      <p className="muted">Selecione uma solicitação ou adicione uma nova.</p>
                    )}
                  </div>
                </aside>
              </div>
            )}

            {selectedScreen === 'pdf' && (
            <div className="pdf-config-grid">
              <section className="pdf-live-preview" aria-label="Preview do cabeçalho do PDF">
                <PdfHeaderPreview pdf={previewPdf} typeName={draft.name} />
              </section>
              <div className="requirements-section pdf-header-editor">
              <div className="requirements-section-title">
                <div>
                  <h2>Cabeçalho do PDF</h2>
                  <p className="section-hint">Somente o cabeçalho será alterado. Tabela, assinaturas e anexos continuam no padrão atual.</p>
                </div>
                <InfoTip text="Estas informações aparecem no topo do relatório PDF gerado para este tipo de vistoria." />
              </div>
              <div className="pdf-header-fields">
                <label>Título principal<input value={draft.pdf?.title ?? selectedPdfModel()?.pdf?.title ?? ''} onChange={(event) => updatePdfHeader({ title: event.target.value })} /></label>
                <label>Subtítulo<input value={draft.pdf?.subtitle ?? selectedPdfModel()?.pdf?.subtitle ?? ''} onChange={(event) => updatePdfHeader({ subtitle: event.target.value })} /></label>
                <label>Unidade<input value={draft.pdf?.unit ?? selectedPdfModel()?.pdf?.unit ?? ''} onChange={(event) => updatePdfHeader({ unit: event.target.value })} /></label>
                <label>Frequência<input value={draft.pdf?.frequency ?? selectedPdfModel()?.pdf?.frequency ?? ''} onChange={(event) => updatePdfHeader({ frequency: event.target.value })} /></label>
                <label>Objeto<input value={draft.pdf?.object_label ?? selectedPdfModel()?.pdf?.object_label ?? 'Motorista'} onChange={(event) => updatePdfHeader({ object_label: event.target.value })} /></label>
                <label>Cor do cabeçalho<input type="color" value={draft.pdf?.primary_color ?? selectedPdfModel()?.pdf?.primary_color ?? '#003d73'} onChange={(event) => updatePdfHeader({ primary_color: event.target.value })} /></label>
              </div>
              </div>
            </div>
            )}

            <div className="modal-actions sticky-actions">
              <button className="primary-action" type="submit" disabled={saving}>
                <Save size={18} /> {saving ? 'Salvando...' : 'Salvar requisitos'}
              </button>
            </div>
          </section>
        )}
      </form>
    </div>
  );
}

function PdfHeaderPreview({ pdf, typeName }) {
  const color = pdf?.primary_color || '#003d73';
  const title = pdf?.title || 'D-OLHO NA SEGURANÇA - CHECKLIST';
  const subtitle = pdf?.subtitle || typeName || 'VISTORIA';
  const logo = REPORT_LOGO_URL;
  const unit = pdf?.unit || '01 - MATRIZ';
  const frequency = pdf?.frequency || 'Mensal';
  const objectLabel = pdf?.object_label || 'Motorista';

  return (
    <div className="pdf-preview-page">
      <header className="pdf-preview-header">
        <div className="pdf-preview-logo-box">
          <img src={logo} alt="Logo do relatório" />
        </div>
        <div className="pdf-preview-title" style={{ color }}>
          <h2>{title}</h2>
          <h2>{subtitle} [613923]</h2>
        </div>
        <div />
      </header>
      <div className="pdf-preview-meta" style={{ color }}>
        <span>Unidade: {unit}</span>
        <span>Frequência: {frequency}</span>
        <span>Período: 14/05/2026 a 14/05/2026</span>
        <span>Parecer Final: Concluída</span>
        <span>Objeto: {objectLabel}</span>
        <span>Inspecionado: teste</span>
        <span>Placa Cavalo: DPJ0I46</span>
        <span>Placa Carreta: DPJ0I46</span>
      </div>
      <div className="pdf-preview-table" aria-hidden="true">
        <span>#</span><span>Requisito</span><span>Agregador</span><span>Resposta</span><span>Anexos</span>
        <strong>1.00</strong><strong>Inspeção Interna e Externa do Equipamento</strong><strong>-</strong><strong>Conforme</strong><strong>1</strong>
      </div>
    </div>
  );
}

function AccessPanel({ profiles, onChanged, currentUserId, onConfirm }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', access_role: 'app' });
  const [editingId, setEditingId] = useState('');
  const [passwordForm, setPasswordForm] = useState({ id: '', email: '', password: '' });
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const visibleProfiles = profiles.filter((profile) => profile.id !== currentUserId);
  const roleCounts = {
    admin: visibleProfiles.filter((item) => item.access_role === 'admin').length,
    inspector: visibleProfiles.filter((item) => item.access_role === 'inspector' || item.access_role === 'app').length,
    driver: visibleProfiles.filter((item) => item.access_role === 'driver').length,
  };

  function accessInitials(profileData) {
    return String(profileData.full_name || profileData.email || 'US')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  async function callUserApi(payload) {
    const token = getStoredSession()?.access_token;

    const result = await fetch('/api/manage-user', {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...payload, access_token: token }),
    });

    const responseBody = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(responseBody.error || 'Não foi possível concluir a ação.');
    return responseBody;
  }

  function startCreate() {
    setEditingId('');
    setForm({ full_name: '', email: '', password: '', access_role: 'inspector' });
    setMessage('');
    setAccessModalOpen(true);
  }

  function startEdit(profile) {
    setEditingId(profile.id);
    setForm({
      full_name: profile.full_name || '',
      email: profile.email || '',
      password: '',
      access_role: profile.access_role || 'inspector',
    });
    setMessage('');
    setAccessModalOpen(true);
  }

  function resetForm() {
    setEditingId('');
    setForm({ full_name: '', email: '', password: '', access_role: 'inspector' });
    setAccessModalOpen(false);
  }

  async function saveAccess(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      await callUserApi({
        action: editingId ? 'update' : 'create',
        id: editingId,
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        access_role: form.access_role,
      });
      setMessage(editingId ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.');
      resetForm();
      await onChanged();
    } catch (saveError) {
      setMessage(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function startResetPassword(profile) {
    setPasswordForm({ id: profile.id, email: profile.email, password: '' });
    setMessage('');
    setPasswordModalOpen(true);
  }

  async function resetPassword(event) {
    event.preventDefault();
    const nextPassword = passwordForm.password;
    if (nextPassword.length < 6) {
      setMessage('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      await callUserApi({ action: 'reset-password', id: passwordForm.id, password: nextPassword });
      setMessage('Senha atualizada com sucesso.');
      setPasswordModalOpen(false);
    } catch (passwordError) {
      setMessage(passwordError.message);
    } finally {
      setPasswordForm({ id: '', email: '', password: '' });
      setSaving(false);
    }
  }

  async function deleteAccess(profile) {
    if (profile.id === currentUserId) {
      setMessage('Você não pode excluir o usuário em uso.');
      return;
    }

    const confirmed = await onConfirm({
      title: 'Excluir acesso',
      message: `Excluir o acesso de ${profile.email}?`,
      confirmLabel: 'Excluir',
    });
    if (!confirmed) return;

    setSaving(true);
    setMessage('');

    try {
      await callUserApi({ action: 'delete', id: profile.id });
      setMessage('Usuário excluído com sucesso.');
      if (editingId === profile.id) resetForm();
      await onChanged();
    } catch (deleteError) {
      setMessage(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="access-layout single">
      <section className="access-card">
        <div className="section-title">
          <Users size={22} />
          <div>
            <h1>Acessos</h1>
            <p>{visibleProfiles.length} registro(s) de perfil. Administradores acessam tudo; vistoriadores usam o app; motoristas agendam pelo web.</p>
          </div>
          <button className="primary-action compact-action" type="button" onClick={startCreate}>
            <Plus size={18} /> Novo acesso
          </button>
        </div>
        {message && <p className="info-box">{message}</p>}
        <div className="access-summary-grid">
          <div>
            <strong>{visibleProfiles.length}</strong>
            <span>Total de acessos</span>
          </div>
          <div>
            <strong>{roleCounts.driver}</strong>
            <span>Motoristas</span>
          </div>
          <div>
            <strong>{roleCounts.inspector}</strong>
            <span>Vistoriadores</span>
          </div>
          <div>
            <strong>{roleCounts.admin}</strong>
            <span>Administradores</span>
          </div>
        </div>
        <div className="users-table">
          <div className="user-row user-row-head" aria-hidden="true">
            <span>Usuário</span>
            <span>E-mail</span>
            <span>Perfil</span>
            <span>Ações</span>
          </div>
          {visibleProfiles.map((profile) => (
            <div className="user-row" key={profile.id}>
              <div className="user-row-main">
                <span className="access-avatar">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : accessInitials(profile)}
                </span>
                <div>
                  <strong>{profile.full_name || 'Sem nome'}</strong>
                  <small>{profile.active === false ? 'Inativo' : 'Ativo'}</small>
                </div>
              </div>
              <span className="user-email" title={profile.email}>{profile.email}</span>
              <em className="user-role">{roleLabel(profile.access_role)}</em>
              <div className="row-actions">
                <button type="button" onClick={() => startEdit(profile)} title="Editar perfil">
                  <UserCog size={16} />
                </button>
                <button type="button" onClick={() => startResetPassword(profile)} title="Alterar senha" disabled={passwordForm.id === profile.id}>
                  <ShieldCheck size={16} />
                </button>
                <button type="button" onClick={() => deleteAccess(profile)} title="Excluir perfil">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      {accessModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="profile-modal" onSubmit={saveAccess}>
            <div className="modal-header">
              <div>
                <h2>{editingId ? 'Editar acesso' : 'Novo acesso'}</h2>
                <p>Defina quem acessa somente o app ou também o painel web.</p>
              </div>
              <button type="button" onClick={resetForm} aria-label="Fechar acesso"><X size={20} aria-hidden="true" /></button>
            </div>
            <label>
              Nome completo
              <input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
            </label>
            <label>
              E-mail
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" required />
            </label>
            {!editingId && (
              <label>
                Senha inicial
                <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" minLength="6" required />
              </label>
            )}
            <label>
              Perfil
              <select value={form.access_role} onChange={(event) => setForm({ ...form, access_role: event.target.value })}>
                <option value="admin">Administrador</option>
                <option value="inspector">Vistoriador</option>
                <option value="driver">Motorista</option>
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={resetForm}>Cancelar</button>
              <button className="primary-action" type="submit">
                <Save size={18} /> {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar acesso'}
              </button>
            </div>
          </form>
        </div>
      )}
      {passwordModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="profile-modal" onSubmit={resetPassword}>
            <div className="modal-header">
              <div>
                <h2>Alterar senha</h2>
                <p>{passwordForm.email}</p>
              </div>
              <button type="button" onClick={() => setPasswordModalOpen(false)} aria-label="Fechar senha"><X size={20} aria-hidden="true" /></button>
            </div>
            <label>
              Nova senha
              <input value={passwordForm.password} onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })} type="password" minLength="6" required />
            </label>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setPasswordModalOpen(false)}>Cancelar</button>
              <button className="primary-action" type="submit">
                <ShieldCheck size={18} /> {saving ? 'Salvando...' : 'Salvar senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function DownloadPdfButton({ inspection }) {
  const [generating, setGenerating] = useState(false);
  const [pdfErrorMessage, setPdfErrorMessage] = useState('');

  async function handleDownload() {
    if (generating) return;
    setGenerating(true);
    try {
      await downloadInspectionPdf(inspection);
    } catch (pdfError) {
      setPdfErrorMessage(pdfError.message || 'Não foi possível gerar o PDF.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <button onClick={handleDownload} className="primary-action" disabled={generating}>
        <Download size={18} /> {generating ? 'Gerando...' : 'Gerar PDF'}
      </button>
      <PanelDialog
        dialog={pdfErrorMessage ? {
          type: 'alert',
          title: 'PDF não gerado',
          message: pdfErrorMessage,
          confirmLabel: 'OK',
          tone: 'primary',
        } : null}
        onChange={() => null}
        onCancel={() => setPdfErrorMessage('')}
        onConfirm={() => setPdfErrorMessage('')}
      />
    </>
  );
}

function groupAnnexPhotos(photos = []) {
  const groups = [];
  const byLabel = new Map();

  photos.forEach((photo) => {
    const label = photo.label || 'Anexo';
    let group = byLabel.get(label);
    if (!group) {
      group = {
        label,
        code: `A.${String(groups.length + 1).padStart(2, '0')}`,
        photos: [],
      };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.photos.push(photo);
  });

  return groups;
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function ReportPreview({ inspection }) {
  const photos = inspection.inspection_photos || [];
  const annexGroups = groupAnnexPhotos(photos);
  const annexPages = chunkItems(annexGroups, 2);
  const rows = buildRows(inspection);
  const generatedAt = formatDateTime(new Date());
  const auditedBy = inspection.inspector_name || inspection.inspector_email || 'Vistoriador';
  const signaturePaths = normalizeSignaturePaths(inspection.signature_data);
  const modelSnapshot = inspection.applicable?.__checklist_model?.snapshot || {};
  const pdfConfig = modelSnapshot.pdf || {};
  const signatureField = (modelSnapshot.app_fields || []).find((item) => item.field_type === 'signature');
  const reportKind = pdfConfig.subtitle || inspection.applicable?.__checklist_model?.category?.name || (isAutocheckInspection(inspection) ? 'AUTOCHECK MATRIZ' : 'VISTORIA AGENDADA');
  const pdfTitle = pdfConfig.title || 'D-OLHO NA SEGURANÇA - CHECKLIST';
  const pdfLogo = REPORT_LOGO_URL;
  const pdfColor = pdfConfig.primary_color || '#003d73';
  const pdfUnit = pdfConfig.unit || '01 - MATRIZ';
  const pdfFrequency = pdfConfig.frequency || 'Mensal';
  const pdfObject = pdfConfig.object_label || 'Motorista';

  return (
    <div className="print-document">
      <section className="pdf-page cover-page">
        <header className="pdf-header">
          <div className="report-logo-box">
            <img className="report-logo" src={pdfLogo} alt="Vistorias EN" crossOrigin="anonymous" />
          </div>
          <div className="report-title" style={{ color: pdfColor }}>
            <h2>{pdfTitle}</h2>
            <h2>{reportKind} [{shortId(inspection.id)}]</h2>
          </div>
          <div />
        </header>

        <div className="meta-grid" style={{ color: pdfColor }}>
          <span>Unidade: {pdfUnit}</span>
          <span>Frequência: {pdfFrequency}</span>
          <span>Período: {formatDate(inspection.created_at)} a {formatDate(inspection.created_at)}</span>
          <span>Parecer Final: {statusLabel(inspection.status)}</span>
          <span>Objeto: {pdfObject}</span>
          <span>Inspecionado: {inspection.driver_name || '-'}</span>
          <span>Placa Cavalo: {inspection.truck_plate || '-'}</span>
          <span>Placa Carreta: {inspection.trailer_plate || '-'}</span>
        </div>

        <table className="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Requisito</th>
              <th>Agregador</th>
              <th>Resposta</th>
              <th>Pontos</th>
              <th>Data</th>
              <th>Auditado por</th>
              <th>Anexos</th>
              <th>Observação / Justificativa</th>
            </tr>
          </thead>
          <tbody>
            <tr className="section-row">
              <td colSpan="9">1.00 - Inspeção Interna e Externa do Equipamento</td>
            </tr>
            {rows.map((row, index) => (
              <tr key={row.number}>
                <td>{row.number}</td>
                <td>{row.requirement}</td>
                <td>{row.group}</td>
                <td>{row.answer}</td>
                <td>0</td>
                <td>{formatDateTime(inspection.created_at)}</td>
                <td>{auditedBy}</td>
                <td>{row.attachments.length ? row.attachments.join(', ') : '-'}</td>
                <td>{row.note}</td>
              </tr>
            ))}
            <tr>
              <td>1.99</td>
              <td>Validação da Vistoria</td>
              <td>-</td>
              <td>{statusLabel(inspection.status)}</td>
              <td>0</td>
              <td>{formatDateTime(inspection.created_at)}</td>
              <td>{auditedBy}</td>
              <td>-</td>
              <td>{inspection.observations || '-'}</td>
            </tr>
          </tbody>
        </table>

        <ReportSignature paths={signaturePaths} label={signatureField?.label || pdfConfig.signature_label} />

        <footer className="pdf-footer">
          <span>Formulario: <strong>F-PODEC000-01</strong> - Revisao: 9</span>
          <span>Gerado em: <strong>{generatedAt}</strong></span>
        </footer>
      </section>

      {annexGroups.length === 0 ? (
        <section className="pdf-page annex-page">
          <div className="photo-placeholder">
            <Eye size={30} />
            <span>As fotos aparecerao aqui quando estiverem salvas no Storage.</span>
          </div>
          <footer className="pdf-footer">
            <span>Formulario: <strong>F-PODEC000-01</strong> - Revisao: 9</span>
            <span>Gerado em: <strong>{generatedAt}</strong></span>
          </footer>
        </section>
      ) : annexPages.map((pageGroups, pageIndex) => (
        <section className="pdf-page annex-page" key={`annex-page-${pageIndex}`}>
          {pageGroups.map((group) => (
            <article className="annex-photo" key={group.code}>
              <div className="annex-strip">{group.code} - {group.label}</div>
              <div className={`annex-photo-grid ${group.photos.length === 1 ? 'single' : ''}`}>
                {group.photos.map((photo, index) => (
                  (photo.storage_path || photo.public_url) ? (
                    <img
                      key={photo.id || `${group.code}-${index}`}
                      src={photo.public_url || photo.storage_path}
                      alt={`${group.label} ${index + 1}`}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="photo-placeholder" key={photo.id || `${group.code}-${index}`}>
                      <span>{group.label}</span>
                      <small>Foto registrada no app. Falta upload para Storage para exibir no painel.</small>
                    </div>
                  )
                ))}
              </div>
            </article>
          ))}
          <footer className="pdf-footer">
            <span>Formulario: <strong>F-PODEC000-01</strong> - Revisao: 9</span>
            <span>Gerado em: <strong>{generatedAt}</strong></span>
          </footer>
        </section>
      ))}
    </div>
  );
}

function ReportSignature({ paths, label = 'ASSINATURA DO VISTORIADOR' }) {
  return (
    <div className="report-signature">
      {!!paths.length && (
        <svg viewBox="0 0 320 150" aria-hidden="true">
          {paths.map((path, index) => (
            <polyline
              key={`${index}-${path.length}`}
              points={path.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#0f1f35"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
      <div className="signature-line" />
      <strong>{String(label || 'ASSINATURA DO VISTORIADOR').toUpperCase()}</strong>
    </div>
  );
}

function normalizeSignaturePaths(value) {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      })()
    : value;

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((path) => Array.isArray(path)
      ? path
        .map((point) => ({
          x: Number(point?.x),
          y: Number(point?.y),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      : [])
    .filter((path) => path.length > 1);
}

function displayItemLabel(item) {
  return item?.code ? `${item.code} - ${item.label}` : item?.label;
}

function configuredReportItems(inspection) {
  const snapshot = inspection.applicable?.__checklist_model?.snapshot || {};
  const photoFields = sortedActive(snapshot.photo_fields || []);
  const applicableItems = sortedActive(snapshot.applicable_items || []);
  if (photoFields.length || applicableItems.length) {
    return [
      ...photoFields.map((item) => ({ ...item, report_kind: 'photo', report_key: itemKey(item) })),
      ...applicableItems.map((item) => ({ ...item, report_kind: 'applicable', report_key: itemKey(item) })),
    ];
  }
  return [
    ...requiredRows.map(([code, requirement, group, label]) => ({
      code,
      label,
      requirement,
      aggregator: group,
      report_kind: 'photo',
      report_key: label,
    })),
    ...conditionalRows.map(([code, requirement, group, label]) => ({
      code,
      label,
      requirement,
      aggregator: group,
      report_kind: 'applicable',
      report_key: label,
    })),
  ];
}

function buildRows(inspection) {
  const photos = inspection.inspection_photos || [];
  const annexByLabel = new Map();
  groupAnnexPhotos(photos).forEach((group) => {
    annexByLabel.set(group.label, group.code);
  });
  const annexesFor = (labels) => [...new Set(labels.map((label) => annexByLabel.get(label)).filter(Boolean))];
  const applicable = inspection.applicable || {};
  const nonconformities = applicable.__nonconformities || {};
  const rowFromItem = (item, isApplicable = true) => {
    const label = displayItemLabel(item);
    const key = item.report_key || itemKey(item) || label;
    const issue = nonconformities[key] || nonconformities[label] || nonconformities[item.label];
    const issuePhotoLabels = [`${label} - Não conformidade`, `${label} - Nao conformidade`];
    const issueAttachments = annexesFor([...issuePhotoLabels, `${item.label} - Nao conformidade`]);
    const regularAttachments = annexesFor([label, item.label]);
    if (isApplicable && issue?.answer === 'nao_conforme') {
      return {
        number: item.code || '-',
        requirement: item.requirement || item.label,
        group: item.aggregator || item.category || '-',
        answer: 'Não conforme',
        attachments: [...new Set([...issueAttachments, ...regularAttachments])],
        note: issue.note || 'Não conformidade sem descrição.',
      };
    }

    return {
      number: item.code || '-',
      requirement: item.requirement || item.label,
      group: item.aggregator || item.category || '-',
      answer: isApplicable ? (regularAttachments.length ? 'Conforme' : 'Pendente') : 'N/A',
      attachments: isApplicable ? regularAttachments : [],
      note: isApplicable ? '' : 'Não aplicável',
    };
  };

  return configuredReportItems(inspection).map((item) => {
    const key = item.report_key || itemKey(item);
    const isApplicable = item.report_kind === 'applicable' ? Boolean(applicable[key] || applicable[item.label]) : true;
    return rowFromItem(item, isApplicable);
  });
}

function statusLabel(status) {
  const map = {
    completed: 'Concluída',
    approved: 'Aprovado',
    rejected: 'Reprovado',
    in_progress: 'Aguardando aprovação',
  };
  return map[status] || status || 'Aguardando aprovação';
}


function scheduleStatusLabel(status) {
  const map = {
    scheduled: 'Aguardando direcionamento',
    assigned: 'Direcionada',
    completed: 'Concluída',
    cancelled: 'Cancelada',
  };
  return map[status] || status || 'Agendada';
}

function roleLabel(role) {
  const map = {
    admin: 'Administrador',
    app: 'Vistoriador',
    inspector: 'Vistoriador',
    driver: 'Motorista',
  };
  return map[role] || role || 'Usuário';
}

function InfoTip({ text }) {
  return (
    <span className="info-tip" tabIndex="0" aria-label={text}>
      <Info size={14} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

function InspectionIcon({ name, size = 18 }) {
  const option = INSPECTION_ICON_OPTIONS.find((item) => item.value === name) || INSPECTION_ICON_OPTIONS[0];
  const Icon = option.Icon;
  return <Icon size={size} aria-hidden="true" />;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(id = '') {
  return String(id).slice(0, 6).toUpperCase() || '000000';
}

function defaultJobTitle(accessRole) {
  if (accessRole === 'admin') return 'Administrador do painel';
  if (accessRole === 'driver') return 'Motorista';
  return 'Vistoriador';
}

createRoot(document.getElementById('root')).render(<App />);

