// [ADD]
import { supabase, APP_CONFIG } from './config.js';

const PAGE_SIZE = 12;
const LIKE_RATE_LIMIT_MS = 1500;
const FLAG_MIN_REASON_LENGTH = 10;
const state = {
  category: '',
  sort: 'created_at',
  q: '',
  page: 1,
  total: 0,
  loading: false,
  videos: [],
};

const uploadState = {
  currentVideoId: null,
  channel: null,
};

const elements = {
  list: document.getElementById('videoList'),
  top: document.getElementById('topList'),
  category: document.getElementById('filterCategory'),
  sort: document.getElementById('filterSort'),
  search: document.getElementById('searchText'),
  clear: document.getElementById('clearFilters'),
  loadMore: document.getElementById('loadMore'),
  status: document.getElementById('videoStatus'),
  counter: document.getElementById('resultCounter'),
  submitModal: document.getElementById('submitModal'),
  openSubmit: document.getElementById('openSubmit'),
  closeSubmit: document.getElementById('closeSubmit'),
  submitButton: document.getElementById('btnSubmit'),
  title: document.getElementById('inpTitle'),
  description: document.getElementById('inpDesc'),
  place: document.getElementById('inpPlace'),
  categoryField: document.getElementById('inpCat'),
  reporterEmail: document.getElementById('inpReporterEmail'),
  dropZone: document.getElementById('dropZone'),
  browseButton: document.getElementById('btnBrowse'),
  fileInput: document.getElementById('inpFile'),
  fileInfo: document.getElementById('fileInfo'),
  submitError: document.getElementById('submitError'),
  uploadProgress: document.getElementById('uploadProgress'),
  uploadProgressBar: document.getElementById('uploadProgressBar'),
  uploadProgressPercent: document.getElementById('uploadProgressPercent'),
  uploadProgressLabel: document.getElementById('uploadProgressLabel'),
  detailsModal: document.getElementById('detailsModal'),
  closeDetails: document.getElementById('closeDetails'),
  detVideo: document.getElementById('detVideo'),
  detTitle: document.getElementById('detTitle'),
  detDesc: document.getElementById('detDesc'),
  detMeta: document.getElementById('detMeta'),
  detViews: document.getElementById('detViews'),
  detCategory: document.getElementById('detCategory'),
  detPlace: document.getElementById('detPlace'),
  flagModal: document.getElementById('flagModal'),
  flagForm: document.getElementById('flagForm'),
  closeFlag: document.getElementById('closeFlag'),
  flagReason: document.getElementById('flagReason'),
  flagError: document.getElementById('flagError'),
  flagSubmit: document.getElementById('submitFlag'),
};

const videoCache = new Map();

const authState = {
  session: null,
  user: null,
  likedVideoIds: new Set(),
};

const interactionState = {
  likeRateLimit: new Map(),
  flagSubmitting: false,
};

const flagState = {
  currentVideoId: null,
};

const STATUS_MESSAGES = {
  uploading: { message: 'Feltöltés folyamatban…', type: 'info' },
  verifying: { message: 'Vírusellenőrzés folyamatban…', type: 'info' },
  transcoding: { message: 'Transzkódálás folyamatban…', type: 'info' },
  pending: { message: 'A videód feltöltve, moderációra vár.', type: 'info' },
  approved: { message: 'A videód jóváhagyásra került! Köszönjük a beküldést.', type: 'success' },
  rejected: { message: 'Sajnos a videót elutasítottuk. Ellenőrizd a szabályokat és próbáld újra.', type: 'error' },
  failed: { message: 'A videó feldolgozása közben hiba történt.', type: 'error' },
};

const PROGRESS_MESSAGES = {
  uploading: { label: 'Feltöltés folyamatban…', tone: 'info' },
  verifying: { label: 'Vírusellenőrzés…', tone: 'info' },
  transcoding: { label: 'Transzkódálás folyamatban…', tone: 'info' },
  pending: { label: 'Moderációra vár…', tone: 'info' },
  approved: { label: 'A videód jóváhagyva!', tone: 'success' },
  rejected: { label: 'A videót elutasítottuk.', tone: 'error' },
  failed: { label: 'A feldolgozás sikertelen.', tone: 'error' },
};

function extractAggregateCount(value) {
  if (Array.isArray(value) && value.length) {
    const first = value[0];
    if (first && typeof first.count === 'number') {
      return first.count;
    }
  }
  return 0;
}

function applyProgressTone(tone) {
  if (!elements.uploadProgressBar) return;
  elements.uploadProgressBar.classList.remove('bg-black', 'bg-emerald-600', 'bg-red-500');
  if (tone === 'success') {
    elements.uploadProgressBar.classList.add('bg-emerald-600');
  } else if (tone === 'error') {
    elements.uploadProgressBar.classList.add('bg-red-500');
  } else {
    elements.uploadProgressBar.classList.add('bg-black');
  }
}

function setUploadProgress({ visible = true, percent = 0, label = '', tone = 'info' } = {}) {
  if (!elements.uploadProgress) return;
  if (!visible) {
    elements.uploadProgress.classList.add('hidden');
    if (elements.uploadProgressBar) {
      elements.uploadProgressBar.style.width = '0%';
    }
    if (elements.uploadProgressPercent) {
      elements.uploadProgressPercent.textContent = '0%';
    }
    return;
  }
  elements.uploadProgress.classList.remove('hidden');
  const capped = Math.min(Math.max(Math.round(percent), 0), 100);
  if (elements.uploadProgressBar) {
    elements.uploadProgressBar.style.width = `${capped}%`;
  }
  if (elements.uploadProgressPercent) {
    elements.uploadProgressPercent.textContent = `${capped}%`;
  }
  if (elements.uploadProgressLabel && label) {
    elements.uploadProgressLabel.textContent = label;
  }
  applyProgressTone(tone);
}

function resetUploadProgress() {
  setUploadProgress({ visible: false, percent: 0, label: '', tone: 'info' });
}

function updateUploadProgressStatus(statusKey, overrides = {}) {
  const config = PROGRESS_MESSAGES[statusKey] || {};
  const tone = overrides.tone || config.tone || 'info';
  const label = overrides.label || config.label || '';
  const percent = typeof overrides.percent === 'number'
    ? overrides.percent
    : statusKey === 'uploading'
      ? overrides.percent ?? 0
      : 100;
  setUploadProgress({ visible: true, percent, label, tone });
}

async function cleanupUploadSubscription() {
  if (uploadState.channel && supabase) {
    try {
      await supabase.removeChannel(uploadState.channel);
    } catch (error) {
      console.error('Realtime cleanup failed', error);
    }
  }
  uploadState.channel = null;
  uploadState.currentVideoId = null;
}

async function subscribeToVideoStatus(videoId) {
  if (!supabase || !videoId) return;
  if (uploadState.currentVideoId === videoId && uploadState.channel) return;

  await cleanupUploadSubscription();

  const channel = supabase
    .channel(`videos-status-${videoId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos', filter: `id=eq.${videoId}` }, async (payload) => {
      const status = payload?.new?.status;
      if (!status) return;
      updateStatus(status);
      updateUploadProgressStatus(status);

      if (status === 'approved') {
        fetchVideos(true)
          .then(() => updateStatus(status))
          .catch((error) => console.error('Video list refresh error', error));
        renderTopList().catch((error) => console.error('Top list refresh error', error));
      }

      if (['approved', 'rejected', 'failed'].includes(status)) {
        await cleanupUploadSubscription();
      }
    });

  try {
    await channel.subscribe();
    uploadState.channel = channel;
    uploadState.currentVideoId = videoId;
  } catch (error) {
    console.error('Realtime subscribe error', error);
  }
}

async function uploadFileMultipart(file, storagePath, onProgress) {
  if (!supabase) {
    throw new Error('Supabase nincs inicializálva.');
  }

  const storageClient = supabase.storage.from(APP_CONFIG.bucket);
  const chunkSize = Math.max(APP_CONFIG.uploadChunkSize || 0, 5 * 1024 * 1024);

  if (typeof storageClient.createMultipartUpload !== 'function') {
    const { error } = await storageClient.upload(storagePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    onProgress?.(file.size, file.size);
    return { path: storagePath };
  }

  const { data: createData, error: createError } = await storageClient.createMultipartUpload(storagePath, {
    fileSize: file.size,
    contentType: file.type,
    cacheControl: '3600',
    metadata: {
      originalName: file.name,
    },
  });

  if (createError || !createData?.id) {
    throw createError || new Error('Nem sikerült inicializálni a multipart feltöltést.');
  }

  const uploadId = createData.id;
  const parts = [];
  let uploadedBytes = 0;

  try {
    let partNumber = 1;
    for (let offset = 0; offset < file.size; offset += chunkSize, partNumber += 1) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const { data: partData, error: partError } = await storageClient.uploadPart(uploadId, partNumber, chunk);
      if (partError) {
        throw partError;
      }
      parts.push({ partNumber, etag: partData?.etag });
      uploadedBytes += chunk.size;
      onProgress?.(uploadedBytes, file.size);
    }

    const { error: completeError } = await storageClient.completeMultipartUpload(uploadId, parts);
    if (completeError) {
      throw completeError;
    }

    onProgress?.(file.size, file.size);
    return { uploadId };
  } catch (error) {
    try {
      await storageClient.abortMultipartUpload(uploadId);
    } catch (abortError) {
      console.error('Multipart abort failed', abortError);
    }
    throw error;
  }
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (err) {
    console.error('Date parse error', err);
    return value;
  }
}

function updateStatus(messageOrStatus, type = 'info') {
  if (!elements.status) return;

  let message = messageOrStatus;
  let tone = type;

  if (typeof messageOrStatus === 'string' && STATUS_MESSAGES[messageOrStatus]) {
    message = STATUS_MESSAGES[messageOrStatus].message;
    tone = STATUS_MESSAGES[messageOrStatus].type;
  }

  if (!message) {
    elements.status.textContent = '';
    elements.status.classList.remove('text-red-500', 'text-emerald-600');
    elements.status.classList.add('text-zinc-500');
    return;
  }

  elements.status.textContent = message;
  elements.status.classList.remove('text-red-500', 'text-emerald-600', 'text-zinc-500');
  if (tone === 'error') {
    elements.status.classList.add('text-red-500');
  } else if (tone === 'success') {
    elements.status.classList.add('text-emerald-600');
  } else {
    elements.status.classList.add('text-zinc-500');
  }
}

function updateCounter() {
  if (!elements.counter) return;
  if (!state.total) {
    elements.counter.textContent = '';
    return;
  }
  const visible = Math.min(state.page * PAGE_SIZE, state.total);
  elements.counter.textContent = `${visible} / ${state.total} videó`; 
}

function resetList() {
  state.page = 1;
  state.total = 0;
  state.videos = [];
  videoCache.clear();
  elements.list.innerHTML = '';
}

function transformVideoRecord(raw) {
  if (!raw) return null;
  const likesCount = extractAggregateCount(raw.video_likes);
  const flagsCount = extractAggregateCount(raw.video_flags);
  const processed = {
    ...raw,
    likes_count: likesCount,
    flags_count: flagsCount,
    liked_by_user: authState.likedVideoIds.has(raw.id),
  };
  delete processed.video_likes;
  delete processed.video_flags;
  return processed;
}

async function fetchVideos(reset = false) {
  if (!supabase || !APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
    updateStatus('Állítsd be a Supabase kulcsokat a config.js / .env alapján.');
    elements.loadMore.disabled = true;
    elements.loadMore.classList.add('opacity-50');
    elements.loadMore.textContent = 'Beállítás szükséges';
    return;
  }

  if (state.loading) return;
  state.loading = true;
  elements.loadMore.disabled = true;
  updateStatus('Videók betöltése folyamatban…');

  if (reset) {
    resetList();
  }

  const from = (state.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('videos')
    .select('id, title, description, place, category, status, file_path, thumb_path, views, created_at, video_likes(count), video_flags(count)', { count: 'exact' })
    .eq('status', 'approved');

  if (state.category) {
    query = query.eq('category', state.category);
  }

  if (state.q.trim()) {
    const term = state.q.trim();
    query = query.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,place.ilike.%${term}%`
    );
  }

  query = query.order(state.sort, { ascending: false, nullsFirst: false }).range(from, to);

  const { data, error, count } = await query;

  state.loading = false;

  if (error) {
    console.error(error);
    updateStatus('Nem sikerült betölteni a videókat. Próbáld újra később.', 'error');
    elements.loadMore.disabled = false;
    elements.loadMore.classList.remove('opacity-50');
    elements.loadMore.textContent = 'További videók';
    return;
  }

  state.total = typeof count === 'number' ? count : state.total;
  updateCounter();

  const processedData = (data ?? []).map(transformVideoRecord).filter(Boolean);

  if (reset) {
    state.videos = processedData;
  } else {
    state.videos = state.videos.concat(processedData);
  }

  processedData.forEach((video) => {
    videoCache.set(video.id, video);
  });

  if (!state.total) {
    updateStatus('Még nincs publikált videó. Küldd be az elsőt!');
  } else if (!uploadState.currentVideoId) {
    updateStatus('');
  }

  renderVideoList(reset);
  updateLoadMoreButton();
}

function updateLoadMoreButton() {
  const loaded = state.videos.length;
  const hasMore = loaded < state.total;
  elements.loadMore.disabled = !hasMore;
  elements.loadMore.classList.toggle('opacity-50', !hasMore);
  if (!hasMore) {
    elements.loadMore.textContent = 'Nincs több találat';
  } else {
    elements.loadMore.textContent = 'További videók';
  }
}

function createVideoCard(video) {
  const article = document.createElement('article');
  article.className = 'video-card bg-white border rounded-xl overflow-hidden flex flex-col';
  article.dataset.videoId = video.id;

  const thumb = document.createElement('div');
  thumb.className = 'video-thumb';
  thumb.innerHTML = video.thumb_path
    ? `<img src="${escapeHtml(video.thumb_path)}" alt="${escapeHtml(video.title)}" class="w-full h-full object-cover" loading="lazy" />`
    : '<span>Előnézet feltöltés alatt</span>';

  const body = document.createElement('div');
  body.className = 'p-4 space-y-2 flex-1 flex flex-col';
  body.innerHTML = `
    <h3 class="font-semibold" data-video-title>${escapeHtml(video.title)}</h3>
    <div class="text-sm text-zinc-600 overflow-hidden" data-video-description>${escapeHtml(video.description || 'Nincs leírás')}</div>
    <div class="mt-auto flex flex-wrap items-center gap-2 text-xs text-zinc-500" data-video-meta>
      <span class="badge" data-video-category>${escapeHtml(labelFor(video.category))}</span>
      <span data-video-date>${formatDate(video.created_at)}</span>
      <span data-video-place class="${video.place ? '' : 'hidden'}">${video.place ? `• ${escapeHtml(video.place)}` : ''}</span>
      <span class="ml-auto" data-video-views>${(video.views || 0).toLocaleString('hu-HU')} megtekintés</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'video-actions mt-3 pt-3 flex items-center gap-2 text-sm text-zinc-600 flex-wrap';

  const likeButton = createLikeButton(video);
  const flagButton = createFlagButton(video);

  actions.appendChild(likeButton);
  actions.appendChild(flagButton);
  body.appendChild(actions);

  article.appendChild(thumb);
  article.appendChild(body);
  article.addEventListener('click', () => openDetails(video.id));
  return article;
}

function createLikeButton(video) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip-button';
  button.dataset.likeButton = 'true';
  button.dataset.videoId = video.id;
  button.setAttribute('aria-label', 'Videó kedvelése');
  button.addEventListener('click', (event) => handleLikeClick(event, video.id));

  const icon = document.createElement('span');
  icon.textContent = '👍';
  const label = document.createElement('span');
  label.textContent = 'Tetszik';
  const count = document.createElement('span');
  count.dataset.likeCount = 'true';
  count.className = 'chip-counter';

  button.append(icon, label, count);
  updateLikeButton(button, video);
  return button;
}

function updateLikeButton(button, video) {
  const liked = Boolean(video.liked_by_user);
  button.classList.toggle('is-liked', liked);
  button.setAttribute('aria-pressed', liked ? 'true' : 'false');
  const countElement = button.querySelector('[data-like-count]');
  if (countElement) {
    countElement.textContent = (video.likes_count || 0).toLocaleString('hu-HU');
  }
}

function createFlagButton(video) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip-button';
  button.dataset.flagButton = 'true';
  button.dataset.videoId = video.id;
  button.setAttribute('aria-label', 'Videó jelentése');
  button.addEventListener('click', (event) => handleFlagClick(event, video.id));

  const icon = document.createElement('span');
  icon.textContent = '🚩';
  const label = document.createElement('span');
  label.textContent = 'Jelentés';
  const count = document.createElement('span');
  count.dataset.flagCount = 'true';
  count.className = 'chip-counter';

  button.append(icon, label, count);
  updateFlagButton(button, video);
  return button;
}

function updateFlagButton(button, video) {
  const hasFlags = (video.flags_count || 0) > 0;
  button.classList.toggle('is-flagged', hasFlags);
  const countElement = button.querySelector('[data-flag-count]');
  if (countElement) {
    countElement.textContent = (video.flags_count || 0).toLocaleString('hu-HU');
  }
}

function updateVideoCardInteractions(article, video) {
  const likeButton = article.querySelector('[data-like-button]');
  if (likeButton) {
    updateLikeButton(likeButton, video);
  }
  const flagButton = article.querySelector('[data-flag-button]');
  if (flagButton) {
    updateFlagButton(flagButton, video);
  }
}

function updateVideoCardContent(article, video) {
  const titleElement = article.querySelector('[data-video-title]');
  if (titleElement) {
    titleElement.textContent = video.title;
  }
  const descriptionElement = article.querySelector('[data-video-description]');
  if (descriptionElement) {
    descriptionElement.textContent = video.description || 'Nincs leírás';
  }
  const categoryElement = article.querySelector('[data-video-category]');
  if (categoryElement) {
    categoryElement.textContent = labelFor(video.category);
  }
  const dateElement = article.querySelector('[data-video-date]');
  if (dateElement) {
    dateElement.textContent = formatDate(video.created_at);
  }
  const placeElement = article.querySelector('[data-video-place]');
  if (placeElement) {
    if (video.place) {
      placeElement.textContent = `• ${video.place}`;
      placeElement.classList.remove('hidden');
    } else {
      placeElement.textContent = '';
      placeElement.classList.add('hidden');
    }
  }
  const viewsElement = article.querySelector('[data-video-views]');
  if (viewsElement) {
    viewsElement.textContent = `${(video.views || 0).toLocaleString('hu-HU')} megtekintés`;
  }
  updateVideoCardInteractions(article, video);
}

function updateVideoCard(videoId) {
  const article = elements.list.querySelector(`[data-video-id="${videoId}"]`);
  const video = videoCache.get(videoId);
  if (!article || !video) return;
  updateVideoCardContent(article, video);
}

function updateVideoData(videoId, updates) {
  const existing = videoCache.get(videoId);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  videoCache.set(videoId, updated);
  state.videos = state.videos.map((item) => (item.id === videoId ? updated : item));
  return updated;
}

function handleFlagClick(event, videoId) {
  event.preventDefault();
  event.stopPropagation();
  openFlagModal(videoId);
}

function isVideoRateLimited(videoId) {
  const last = interactionState.likeRateLimit.get(videoId) || 0;
  return Date.now() - last < LIKE_RATE_LIMIT_MS;
}

function markRateLimit(videoId, button) {
  interactionState.likeRateLimit.set(videoId, Date.now());
  if (button instanceof HTMLElement) {
    button.disabled = true;
    window.setTimeout(() => {
      button.disabled = false;
    }, LIKE_RATE_LIMIT_MS);
  }
}

async function handleLikeClick(event, videoId) {
  event.preventDefault();
  event.stopPropagation();

  if (!supabase) {
    updateStatus('Supabase konfiguráció hiányzik.', 'error');
    return;
  }

  const button = event.currentTarget;

  if (!authState.user) {
    updateStatus('Like-oláshoz be kell jelentkezned.', 'error');
    return;
  }

  if (isVideoRateLimited(videoId)) {
    updateStatus('Kérjük, várj egy pillanatot a következő like előtt.');
    return;
  }

  markRateLimit(videoId, button);

  const current = videoCache.get(videoId);
  if (!current) return;

  const previousState = {
    likes_count: current.likes_count || 0,
    liked_by_user: Boolean(current.liked_by_user),
  };

  const wasLiked = authState.likedVideoIds.has(videoId);
  const delta = wasLiked ? -1 : 1;
  const optimisticLikes = Math.max(0, previousState.likes_count + delta);

  if (wasLiked) {
    authState.likedVideoIds.delete(videoId);
  } else {
    authState.likedVideoIds.add(videoId);
  }

  updateVideoData(videoId, {
    likes_count: optimisticLikes,
    liked_by_user: !wasLiked,
  });
  updateVideoCard(videoId);

  try {
    if (wasLiked) {
      const { error } = await supabase
        .from('video_likes')
        .delete()
        .eq('video_id', videoId)
        .eq('user_id', authState.user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('video_likes')
        .insert({ video_id: videoId, user_id: authState.user.id });
      if (error) throw error;
    }
  } catch (error) {
    console.error('Like toggle failed', error);
    if (wasLiked) {
      authState.likedVideoIds.add(videoId);
    } else {
      authState.likedVideoIds.delete(videoId);
    }
    updateVideoData(videoId, previousState);
    updateVideoCard(videoId);
    interactionState.likeRateLimit.set(videoId, Date.now() - LIKE_RATE_LIMIT_MS);
    updateStatus('Nem sikerült frissíteni a like-ot. Próbáld újra.', 'error');
  }
}

function renderVideoList(reset) {
  if (reset) {
    elements.list.innerHTML = '';
  }
  state.videos.forEach((video) => {
    const existing = elements.list.querySelector(`[data-video-id="${video.id}"]`);
    if (existing) {
      updateVideoCardContent(existing, video);
    } else {
      elements.list.appendChild(createVideoCard(video));
    }
  });
}

async function renderTopList() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, views')
    .eq('status', 'approved')
    .order('views', { ascending: false })
    .limit(5);
  if (error) {
    console.error('Top list error', error);
    return;
  }
  elements.top.innerHTML = '';
  (data ?? []).forEach((video) => {
    const li = document.createElement('li');
    li.innerHTML = `<button class="underline-offset-2 hover:underline" data-top-video="${video.id}">${escapeHtml(video.title)}</button> – ${(video.views || 0).toLocaleString('hu-HU')}`;
    li.querySelector('button').addEventListener('click', () => openDetails(video.id));
    elements.top.appendChild(li);
  });
}

function openSubmitModal() {
  elements.submitModal.showModal();
  elements.submitError?.classList.add('hidden');
  elements.submitError.textContent = '';
}

function closeSubmitModal(event) {
  event?.preventDefault();
  elements.submitModal.close();
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

function labelFor(category) {
  const labels = {
    keresztezodes: 'Kereszteződés',
    buszsav: 'Buszsáv',
    palyaszakasz: 'Pályaszakasz',
    gyalogatkelo: 'Gyalogátkelő',
    parkolas: 'Parkolás',
  };
  return labels[category] || 'Egyéb';
}

function resetForm() {
  elements.title.value = '';
  elements.description.value = '';
  elements.place.value = '';
  elements.categoryField.value = 'keresztezodes';
  elements.reporterEmail.value = '';
  elements.fileInput.value = '';
  elements.fileInfo.textContent = '';
  elements.dropZone.classList.remove('dragover');
}

function handleDragEvents() {
  if (!elements.dropZone) return;
  ['dragenter', 'dragover'].forEach((type) => {
    elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      elements.dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (type === 'drop') {
        const file = event.dataTransfer?.files?.[0];
        if (file) {
          assignFile(file);
        }
      }
      elements.dropZone.classList.remove('dragover');
    });
  });

  elements.dropZone.addEventListener('click', () => elements.fileInput.click());
  elements.browseButton?.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', () => {
    const file = elements.fileInput.files?.[0];
    if (file) assignFile(file);
  });
}

function assignFile(file) {
  if (!validateFile(file)) {
    elements.fileInput.value = '';
    return;
  }
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  elements.fileInfo.textContent = `${file.name} • ${sizeMb} MB`;
}

function validateFile(file) {
  if (!file) {
    elements.fileInfo.textContent = 'Válassz MP4 fájlt.';
    return false;
  }
  if (!APP_CONFIG.allowedMimeTypes.includes(file.type)) {
    elements.fileInfo.textContent = 'Csak MP4 videót tudunk fogadni.';
    return false;
  }
  if (file.size > APP_CONFIG.maxFileSize) {
    elements.fileInfo.textContent = `A fájl túl nagy. Maximum ${(APP_CONFIG.maxFileSize / (1024 * 1024)) | 0} MB lehet.`;
    return false;
  }
  elements.fileInfo.textContent = '';
  return true;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!supabase) {
    elements.submitError.textContent = 'Supabase konfiguráció hiányzik.';
    elements.submitError.classList.remove('hidden');
    return;
  }

  const title = elements.title.value.trim();
  const description = elements.description.value.trim();
  const place = elements.place.value.trim();
  const category = elements.categoryField.value;
  const reporterEmail = elements.reporterEmail.value.trim();
  const file = elements.fileInput.files?.[0];

  if (!title) {
    elements.submitError.textContent = 'A cím megadása kötelező.';
    elements.submitError.classList.remove('hidden');
    return;
  }
  if (!file || !validateFile(file)) {
    elements.submitError.textContent = 'Tölts fel egy érvényes MP4 fájlt.';
    elements.submitError.classList.remove('hidden');
    return;
  }

  elements.submitError.classList.add('hidden');
  elements.submitError.textContent = '';

  elements.submitButton.disabled = true;
  const originalLabel = elements.submitButton.textContent;
  elements.submitButton.textContent = 'Feltöltés folyamatban…';

  try {
    const videoId = crypto.randomUUID();
    const extension = '.mp4';
    const storagePath = `videos/${videoId}${extension}`;
    await cleanupUploadSubscription();
    resetUploadProgress();
    updateUploadProgressStatus('uploading', { percent: 0, label: 'Feltöltés előkészítése…' });
    updateStatus('uploading');

    await uploadFileMultipart(file, storagePath, (uploaded, total) => {
      const percent = total ? Math.round((uploaded / total) * 100) : 0;
      updateUploadProgressStatus('uploading', { percent });
      updateStatus('uploading');
    });

    updateUploadProgressStatus('verifying');
    updateStatus('verifying');

    const { error: insertError } = await supabase.from('videos').insert({
      id: videoId,
      title,
      description: description || null,
      place: place || null,
      category,
      status: 'verifying',
      file_path: storagePath,
      thumb_path: null,
      reporter_email: reporterEmail || null,
    });

    if (insertError) {
      throw insertError;
    }

    await subscribeToVideoStatus(videoId);

    if (APP_CONFIG.processFunctionName) {
      const { error: functionError } = await supabase.functions.invoke(APP_CONFIG.processFunctionName, {
        body: {
          videoId,
          bucket: APP_CONFIG.bucket,
          path: storagePath,
          size: file.size,
          mimeType: file.type,
        },
      });

      if (functionError) {
        throw functionError;
      }
    }

    updateStatus('pending');
    updateUploadProgressStatus('pending');

    resetForm();
    closeSubmitModal();
  } catch (error) {
    console.error('Upload error', error);
    await cleanupUploadSubscription();
    updateStatus('failed', 'error');
    updateUploadProgressStatus('failed', { percent: 0 });
    elements.submitError.textContent = 'Nem sikerült feltölteni a videót. Próbáld újra később.';
    elements.submitError.classList.remove('hidden');
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = originalLabel;
  }
}

async function openDetails(videoId) {
  const video = videoCache.get(videoId);
  if (!video) return;
  elements.detTitle.textContent = video.title;
  elements.detDesc.textContent = video.description || 'Nincs leírás megadva.';
  elements.detMeta.textContent = formatDate(video.created_at);
  elements.detCategory.textContent = labelFor(video.category);
  elements.detPlace.textContent = video.place ? `Helyszín: ${video.place}` : '';
  elements.detViews.textContent = `${(video.views || 0).toLocaleString('hu-HU')} megtekintés`;
  elements.detVideo.src = buildVideoUrl(video.file_path);
  elements.detVideo.load();

  elements.detailsModal.showModal();

  await incrementViews(videoId);
}

function resetFlagModalState() {
  if (elements.flagReason) {
    elements.flagReason.value = '';
  }
  if (elements.flagError) {
    elements.flagError.textContent = '';
    elements.flagError.classList.add('hidden');
  }
  if (elements.flagSubmit) {
    elements.flagSubmit.disabled = false;
  }
  interactionState.flagSubmitting = false;
}

function openFlagModal(videoId) {
  if (!elements.flagModal) return;
  resetFlagModalState();
  flagState.currentVideoId = videoId;
  elements.flagModal.showModal();
}

function closeFlagModal(event) {
  event?.preventDefault();
  if (elements.flagModal?.open) {
    elements.flagModal.close();
  }
  flagState.currentVideoId = null;
  resetFlagModalState();
}

async function handleFlagSubmit(event) {
  event.preventDefault();
  if (!supabase) {
    updateStatus('Supabase konfiguráció hiányzik.', 'error');
    return;
  }
  if (!flagState.currentVideoId) {
    updateStatus('Nem sikerült azonosítani a jelentett videót.', 'error');
    return;
  }
  if (interactionState.flagSubmitting) return;

  const reason = elements.flagReason?.value.trim() || '';
  if (reason.length < FLAG_MIN_REASON_LENGTH) {
    if (elements.flagError) {
      elements.flagError.textContent = `Kérjük, legalább ${FLAG_MIN_REASON_LENGTH} karakterben írd le a problémát.`;
      elements.flagError.classList.remove('hidden');
    }
    return;
  }

  if (elements.flagError) {
    elements.flagError.textContent = '';
    elements.flagError.classList.add('hidden');
  }

  if (elements.flagSubmit) {
    elements.flagSubmit.disabled = true;
  }

  interactionState.flagSubmitting = true;

  const payload = {
    video_id: flagState.currentVideoId,
    reason,
  };

  if (authState.user) {
    payload.user_id = authState.user.id;
  }

  try {
    const { error } = await supabase.from('video_flags').insert(payload);
    if (error) throw error;

    const current = videoCache.get(flagState.currentVideoId);
    const nextCount = (current?.flags_count || 0) + 1;
    updateVideoData(flagState.currentVideoId, { flags_count: nextCount });
    updateVideoCard(flagState.currentVideoId);
    updateStatus('Köszönjük a jelzést, hamarosan megvizsgáljuk.', 'success');
    closeFlagModal();
  } catch (error) {
    console.error('Flag submit failed', error);
    if (elements.flagError) {
      elements.flagError.textContent = 'Nem sikerült elküldeni a jelentést. Próbáld újra később.';
      elements.flagError.classList.remove('hidden');
    }
  } finally {
    interactionState.flagSubmitting = false;
    if (elements.flagSubmit) {
      elements.flagSubmit.disabled = false;
    }
  }
}

function buildVideoUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (!APP_CONFIG.supabaseUrl) return '';
  return `${APP_CONFIG.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${APP_CONFIG.bucket}/${path.replace(/^\//, '')}`;
}

async function incrementViews(videoId) {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('increment_video_views', {
    video_id: videoId,
  });
  if (error) {
    console.error('View increment failed', error);
    return;
  }
  if (data) {
    const updated = updateVideoData(videoId, { views: data.views });
    if (updated) {
      elements.detViews.textContent = `${(updated.views || 0).toLocaleString('hu-HU')} megtekintés`;
      updateVideoCard(videoId);
    }
    renderTopList();
  }
}

function applyLikedStateToCollection() {
  state.videos = state.videos.map((video) => {
    const liked = authState.likedVideoIds.has(video.id);
    const updated = { ...video, liked_by_user: liked };
    videoCache.set(video.id, updated);
    return updated;
  });
  state.videos.forEach((video) => updateVideoCard(video.id));
}

async function refreshLikedVideos() {
  authState.likedVideoIds.clear();
  if (!supabase || !authState.user) {
    applyLikedStateToCollection();
    return;
  }
  try {
    const { data, error } = await supabase
      .from('video_likes')
      .select('video_id')
      .eq('user_id', authState.user.id);
    if (error) throw error;
    (data ?? []).forEach((row) => {
      if (row?.video_id) {
        authState.likedVideoIds.add(row.video_id);
      }
    });
  } catch (error) {
    console.error('Liked videos load failed', error);
  } finally {
    applyLikedStateToCollection();
  }
}

function updateAuthSession(session) {
  authState.session = session;
  authState.user = session?.user ?? null;
  refreshLikedVideos().catch((error) => console.error('Liked videos refresh failed', error));
}

async function initAuth() {
  if (!supabase?.auth) return;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    updateAuthSession(data?.session ?? null);
  } catch (error) {
    console.error('Auth session fetch failed', error);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    updateAuthSession(session);
  });
}

function setupFilters() {
  elements.category.addEventListener('change', () => {
    state.category = elements.category.value;
    state.page = 1;
    fetchVideos(true);
  });
  elements.sort.addEventListener('change', () => {
    state.sort = elements.sort.value;
    state.page = 1;
    fetchVideos(true);
  });
  elements.search.addEventListener('input', () => {
    state.q = elements.search.value;
    state.page = 1;
    fetchVideos(true);
  });
  elements.clear.addEventListener('click', () => {
    state.category = '';
    state.sort = 'created_at';
    state.q = '';
    elements.category.value = '';
    elements.sort.value = 'created_at';
    elements.search.value = '';
    fetchVideos(true);
  });
  elements.loadMore.addEventListener('click', () => {
    if (state.loading) return;
    state.page += 1;
    fetchVideos(false);
  });
}

function setupModals() {
  elements.openSubmit.addEventListener('click', openSubmitModal);
  elements.closeSubmit.addEventListener('click', closeSubmitModal);
  elements.submitButton.addEventListener('click', handleSubmit);
  elements.closeDetails.addEventListener('click', (event) => {
    event.preventDefault();
    elements.detailsModal.close();
    elements.detVideo.pause();
    elements.detVideo.removeAttribute('src');
  });
  elements.closeFlag?.addEventListener('click', closeFlagModal);
  elements.flagForm?.addEventListener('submit', handleFlagSubmit);
  elements.flagModal?.addEventListener('close', () => {
    flagState.currentVideoId = null;
    resetFlagModalState();
  });
}

async function init() {
  setupFilters();
  setupModals();
  handleDragEvents();
  await initAuth();
  await fetchVideos(true);
  await renderTopList();
}

init().catch((error) => {
  console.error('Init failed', error);
  updateStatus('Hiba történt az alkalmazás inicializálásakor.', 'error');
});
// [END]
