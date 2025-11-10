// [ADD]
import { supabase, APP_CONFIG } from './config.js';

const elements = {
  status: document.getElementById('adminStatus'),
  tableBody: document.getElementById('pendingTable'),
  authSection: document.getElementById('authSection'),
  adminPanel: document.getElementById('adminPanel'),
  emailInput: document.getElementById('adminEmail'),
  sendMagicLink: document.getElementById('sendMagicLink'),
  signOutButton: document.getElementById('signOut'),
  currentUserEmail: document.getElementById('currentUserEmail'),
  insightsSection: document.getElementById('insightsSection'),
  likes7d: document.getElementById('likes7d'),
  flags7d: document.getElementById('flags7d'),
  topLikedVideos: document.getElementById('topLikedVideos'),
  topFlaggedVideos: document.getElementById('topFlaggedVideos'),
};

const state = {
  session: null,
  isAdmin: false,
  loading: false,
  insightsLoading: false,
};

function getAggregateCount(value) {
  if (Array.isArray(value) && value.length) {
    const first = value[0];
    if (first && typeof first.count === 'number') {
      return first.count;
    }
  }
  return 0;
}

function setStatus(message, type = 'info') {
  if (!elements.status) return;
  elements.status.textContent = message || '';
  elements.status.classList.remove('text-red-500', 'text-emerald-600', 'text-zinc-500');
  if (!message || type === 'info') {
    elements.status.classList.add('text-zinc-500');
  } else if (type === 'error') {
    elements.status.classList.add('text-red-500');
  } else if (type === 'success') {
    elements.status.classList.add('text-emerald-600');
  }
}

function toggleElement(element, shouldShow) {
  if (!element) return;
  element.classList.toggle('hidden', !shouldShow);
}

function isSupabaseConfigured() {
  return Boolean(supabase && APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey);
}

function buildVideoUrl(path) {
  if (!path) return '#';
  if (path.startsWith('http')) return path;
  if (!APP_CONFIG.supabaseUrl) return '#';
  return `${APP_CONFIG.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${APP_CONFIG.bucket}/${path.replace(/^\//, '')}`;
}

function renderRows(videos) {
  if (!elements.tableBody) return;
  elements.tableBody.innerHTML = '';
  if (!videos.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="px-4 py-6 text-center text-sm text-zinc-500">Nincs jóváhagyásra váró videó.</td>';
    elements.tableBody.appendChild(row);
    return;
  }

  videos.forEach((video) => {
    const flagCount = getAggregateCount(video.video_flags);
    const row = document.createElement('tr');
    row.className = 'border-b last:border-0';
    row.innerHTML = `
      <td class="px-4 py-3 font-medium">${escapeHtml(video.title)}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(video.category || '')}</td>
      <td class="px-4 py-3 text-sm">${new Date(video.created_at).toLocaleString('hu-HU')}</td>
      <td class="px-4 py-3 text-sm">
        ${flagCount
          ? `<span class="inline-flex items-center gap-2 rounded-full bg-red-100 text-red-600 px-3 py-1 text-xs font-semibold">${flagCount} jelzés</span>`
          : '<span class="text-xs text-zinc-400">Nincs jelzés</span>'}
      </td>
      <td class="px-4 py-3 text-sm"><a class="underline" href="${buildVideoUrl(video.file_path)}" target="_blank" rel="noreferrer">Megnyitás</a></td>
      <td class="px-4 py-3">
        <div class="flex justify-end gap-2">
          <button data-action="approve" data-id="${video.id}" class="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs">Jóváhagyás</button>
          <button data-action="reject" data-id="${video.id}" class="px-3 py-1 rounded-lg bg-red-500 text-white text-xs">Elutasítás</button>
        </div>
      </td>
    `;
    row.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => handleAction(button.dataset.id, button.dataset.action));
    });
    elements.tableBody.appendChild(row);
  });
}

function escapeHtml(value = '') {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function isAdminUser(user) {
  if (!user) return false;
  const appRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  if (appRoles.includes('admin')) return true;
  if (typeof user?.app_metadata?.role === 'string' && user.app_metadata.role === 'admin') return true;
  if (user?.user_metadata?.is_admin === true) return true;
  if (typeof user?.user_metadata?.role === 'string' && user.user_metadata.role === 'admin') return true;
  return false;
}

function updateCurrentUser(session) {
  if (!elements.currentUserEmail) return;
  const email = session?.user?.email || '';
  elements.currentUserEmail.textContent = email;
  toggleElement(elements.currentUserEmail, Boolean(email));
  toggleElement(elements.signOutButton, Boolean(session));
}

async function handleAction(id, action) {
  if (!state.isAdmin || !supabase) {
    setStatus('Nincs admin jogosultság.', 'error');
    return;
  }
  setStatus('Művelet folyamatban…');
  const statusValue = action === 'approve' ? 'approved' : 'rejected';
  const { error } = await supabase
    .from('videos')
    .update({ status: statusValue })
    .eq('id', id);
  if (error) {
    console.error('Status update failed', error);
    setStatus('Nem sikerült frissíteni a státuszt.', 'error');
    return;
  }
  setStatus('Státusz frissítve.', 'success');
  await loadPending();
}

async function loadPending() {
  if (!state.isAdmin) {
    renderRows([]);
    return;
  }
  if (!isSupabaseConfigured()) {
    setStatus('Supabase konfiguráció hiányzik.', 'error');
    renderRows([]);
    return;
  }
  if (state.loading) {
    return;
  }
  state.loading = true;
  setStatus('Videók betöltése…');
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('id, title, category, file_path, created_at, video_flags(count)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Pending fetch failed', error);
      setStatus('Nem sikerült betölteni a függőben lévő videókat.', 'error');
      renderRows([]);
      return;
    }
    renderRows(data ?? []);
    setStatus(data?.length ? `${data.length} videó vár moderációra.` : 'Nincs jóváhagyásra váró videó.');
  } finally {
    state.loading = false;
  }
}

function renderTrendList(container, items, emptyMessage) {
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'text-zinc-400';
    li.textContent = emptyMessage;
    container.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    const labelSingular = item.labelSingular || item.label || '';
    const labelPlural = item.labelPlural || item.label || '';
    const label = item.count === 1 ? labelSingular : labelPlural;
    const labelText = label ? `${item.count.toLocaleString('hu-HU')} ${label}` : item.count.toLocaleString('hu-HU');
    li.innerHTML = `<span class="font-medium text-zinc-800">${escapeHtml(item.title)}</span><br><span class="chip-counter">${escapeHtml(labelText)}</span>`;
    container.appendChild(li);
  });
}

async function loadInsights() {
  if (!state.isAdmin || !isSupabaseConfigured() || state.insightsLoading) {
    return;
  }
  state.insightsLoading = true;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sinceIso = sevenDaysAgo.toISOString();

  try {
    const [likesResponse, flagsResponse, videoStatsResponse] = await Promise.all([
      supabase.from('video_likes').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso),
      supabase.from('video_flags').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso),
      supabase
        .from('videos')
        .select('id, title, status, video_likes(count), video_flags(count)')
        .in('status', ['approved', 'pending']),
    ]);

    if (elements.likes7d) {
      const likesCount = typeof likesResponse.count === 'number' ? likesResponse.count : 0;
      elements.likes7d.textContent = likesCount.toLocaleString('hu-HU');
    }

    if (elements.flags7d) {
      const flagCount = typeof flagsResponse.count === 'number' ? flagsResponse.count : 0;
      elements.flags7d.textContent = flagCount.toLocaleString('hu-HU');
    }

    const stats = Array.isArray(videoStatsResponse.data) ? videoStatsResponse.data : [];
    const likedVideos = stats
      .map((item) => ({
        id: item.id,
        title: item.title,
        count: getAggregateCount(item.video_likes),
        labelSingular: 'like',
        labelPlural: 'like-ok',
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const flaggedVideos = stats
      .map((item) => ({
        id: item.id,
        title: item.title,
        count: getAggregateCount(item.video_flags),
        labelSingular: 'jelentés',
        labelPlural: 'jelentések',
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    renderTrendList(elements.topLikedVideos, likedVideos, 'Még nincs aktivitás.');
    renderTrendList(elements.topFlaggedVideos, flaggedVideos, 'Nincs jelentett videó.');

    if (elements.insightsSection) {
      elements.insightsSection.classList.toggle('hidden', false);
    }
  } catch (error) {
    console.error('Insight load failed', error);
    if (elements.likes7d) elements.likes7d.textContent = '—';
    if (elements.flags7d) elements.flags7d.textContent = '—';
    renderTrendList(elements.topLikedVideos, [], 'Nem érhető el az adat.');
    renderTrendList(elements.topFlaggedVideos, [], 'Nem érhető el az adat.');
  } finally {
    state.insightsLoading = false;
  }
}

function clearTable() {
  if (!elements.tableBody) return;
  elements.tableBody.innerHTML = '';
}

function handleSession(session) {
  state.session = session;
  state.isAdmin = isAdminUser(session?.user);
  updateCurrentUser(session);

  if (!session) {
    toggleElement(elements.adminPanel, false);
    toggleElement(elements.authSection, true);
    clearTable();
    setStatus('Jelentkezz be a moderációhoz.');
    return;
  }

  if (!state.isAdmin) {
    toggleElement(elements.adminPanel, false);
    toggleElement(elements.authSection, true);
    clearTable();
    setStatus('Nincs admin jogosultságod ehhez a felülethez.', 'error');
    return;
  }

  toggleElement(elements.authSection, false);
  toggleElement(elements.adminPanel, true);
  loadPending().catch((error) => {
    console.error('Admin data load error', error);
    setStatus('Hiba történt a függőben lévő videók betöltésekor.', 'error');
  });
  loadInsights().catch((error) => console.error('Admin insights error', error));
}

async function requestMagicLink(event) {
  event?.preventDefault();
  if (!supabase) return;
  const email = elements.emailInput?.value?.trim();
  if (!email) {
    setStatus('Add meg az e-mail címedet a belépéshez.', 'error');
    return;
  }

  toggleElement(elements.authSection, true);
  if (elements.sendMagicLink) {
    elements.sendMagicLink.disabled = true;
  }
  setStatus('Belépési link küldése…');

  const redirectUrl = APP_CONFIG.supabaseAuthRedirectUrl || `${window.location.origin}${window.location.pathname}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (elements.sendMagicLink) {
    elements.sendMagicLink.disabled = false;
  }

  if (error) {
    console.error('Magic link request failed', error);
    setStatus('Nem sikerült elküldeni a belépési linket.', 'error');
    return;
  }

  setStatus('Ellenőrizd az e-mail fiókodat a belépési linkért.', 'success');
}

async function signOut(event) {
  event?.preventDefault();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign-out failed', error);
    setStatus('Nem sikerült kijelentkezni.', 'error');
    return;
  }
  setStatus('Sikeresen kijelentkeztél.', 'success');
}

async function init() {
  if (!isSupabaseConfigured()) {
    toggleElement(elements.adminPanel, false);
    toggleElement(elements.authSection, false);
    setStatus('Supabase konfiguráció hiányzik.', 'error');
    return;
  }

  toggleElement(elements.authSection, true);

  if (elements.sendMagicLink) {
    elements.sendMagicLink.addEventListener('click', requestMagicLink);
  }
  if (elements.signOutButton) {
    elements.signOutButton.addEventListener('click', signOut);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Session fetch failed', error);
    setStatus('Nem sikerült lekérdezni a bejelentkezési állapotot.', 'error');
    return;
  }
  handleSession(data?.session ?? null);
}

init().catch((error) => {
  console.error('Admin init error', error);
  setStatus('Hiba történt az admin felület inicializálásakor.', 'error');
});
// [END]
