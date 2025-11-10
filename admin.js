// [ADD]
import { supabase, APP_CONFIG } from './config.js';

const statusEl = document.getElementById('adminStatus');
const tableBody = document.getElementById('pendingTable');

function setStatus(message, type = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('text-red-500', 'text-emerald-600', 'text-zinc-500');
  if (!message || type === 'info') {
    statusEl.classList.add('text-zinc-500');
  } else if (type === 'error') {
    statusEl.classList.add('text-red-500');
  } else if (type === 'success') {
    statusEl.classList.add('text-emerald-600');
  }
}

function buildVideoUrl(path) {
  if (!path) return '#';
  if (path.startsWith('http')) return path;
  if (!APP_CONFIG.supabaseUrl) return '#';
  return `${APP_CONFIG.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${APP_CONFIG.bucket}/${path.replace(/^\//, '')}`;
}

function renderRows(videos) {
  tableBody.innerHTML = '';
  if (!videos.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="px-4 py-6 text-center text-sm text-zinc-500">Nincs jóváhagyásra váró videó.</td>';
    tableBody.appendChild(row);
    return;
  }

  videos.forEach((video) => {
    const row = document.createElement('tr');
    row.className = 'border-b last:border-0';
    row.innerHTML = `
      <td class="px-4 py-3 font-medium">${escapeHtml(video.title)}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(video.category || '')}</td>
      <td class="px-4 py-3 text-sm">${new Date(video.created_at).toLocaleString('hu-HU')}</td>
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
    tableBody.appendChild(row);
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

async function handleAction(id, action) {
  if (!supabase) return;
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
  if (!APP_CONFIG.adminMode) {
    setStatus('Állítsd be az ADMIN_MODE=true értéket a config.js / .env fájlban a moderációhoz.', 'error');
    renderRows([]);
    return;
  }
  if (!supabase || !APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
    setStatus('Supabase konfiguráció hiányzik.', 'error');
    renderRows([]);
    return;
  }
  setStatus('Videók betöltése…');
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, category, file_path, created_at')
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
}

loadPending().catch((error) => {
  console.error('Admin init error', error);
  setStatus('Hiba történt az admin felület betöltésekor.', 'error');
});
// [END]
