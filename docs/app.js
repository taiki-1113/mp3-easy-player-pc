import { entries, sortedFolders, createPlayer, selectTrack, setPlaybackOrder, step } from './model.js';
import { scanDirectory, ensureReadPermission } from './library.js';
import { loadDirectory, saveDirectory } from './storage.js';

const app = document.querySelector('#app'), audio = document.querySelector('#audio');
let library = { folders: [], members: [] }, player = createPlayer(), root = null;
let screen = 'player', view = 'all', folder = null, order = 'ordered';
let busy = false, needsPermission = false, ready = false, note = '', error = '';
let token = 0, objectUrl = null, loadedId = null, preparing = false, wantsPlay = false;
let announceTimer, failed = new Set();
const supported = isSecureContext && 'showDirectoryPicker' in window;
const current = () => player.queue[player.index];
const scope = () => view === 'all' ? null : folder;
const items = () => view === 'folders' && folder === null ? [] : entries(library, scope());
const folderLabel = name => name === '' ? `${root?.name ?? '音楽フォルダ'}（親フォルダ直下）` : name;
const orderLabel = () => order === 'shuffle' ? 'シャッフル再生' : '順番再生';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const button = (id, label, attrs = '') => `<button type="button" id="${id}" ${attrs}>${esc(label)}</button>`;
const unavailable = value => value ? 'aria-disabled="true"' : '';
function announce(message, urgent = false) {
  clearTimeout(announceTimer);
  document.querySelector('#announcement').textContent = '';
  document.querySelector('#error-announcement').textContent = '';
  announceTimer = setTimeout(() => { document.querySelector(urgent ? '#error-announcement' : '#announcement').textContent = message; }, 60);
}
function focus(id) { document.getElementById(id)?.focus(); }
function stateText() {
  return preparing ? '曲を読み込んでいます' : current() ? player.playing ? '再生中' : '一時停止中' : '停止中';
}
function summary() {
  return current() ? `${stateText()}。「${current().name}」。フォルダ「${folderLabel(current().folder)}」。${orderLabel()}。` : `${stateText()}。${view === 'all' ? 'すべての曲' : folder === null ? 'フォルダ未選択' : folderLabel(folder)}。${orderLabel()}。`;
}
function render(focusId) {
  app.setAttribute('aria-busy', String(busy));
  const heading = text => `<h1 id="screen-title" tabindex="-1">${text}</h1>`;
  if (screen === 'folders') {
    app.innerHTML = `${heading('フォルダを選ぶ')}<p>選択後は再生ボタンで開始します。</p>${button('back', 'プレーヤーへ戻る')}
      <ul aria-label="フォルダ一覧">${sortedFolders(library).map((name, i) => `<li>${button(`folder-${i}`, `${folderLabel(name)}、${entries(library, name).length}曲`, `class="row" data-folder="${esc(name)}" ${folder === name ? 'aria-current="true"' : ''}`)}</li>`).join('')}</ul>`;
    document.title = 'フォルダを選ぶ｜MP3かんたんプレイヤー PC';
  } else {
    app.innerHTML = `${heading('音楽プレーヤー')}
      <p class="subtle">${root ? `音楽フォルダ：${esc(root.name)}` : '最初に音楽の親フォルダを登録してください。'}</p>
      ${!supported ? '<p class="result">この環境では音楽フォルダを直接参照できません。WindowsのEdgeまたはChromeでHTTPSの公開ページを開いてください。</p>' : ''}
      <p id="library-note" ${note ? '' : 'hidden'}>${esc(note)}</p><p id="visible-error" class="result" ${error ? '' : 'hidden'}>${esc(error)}</p>
      <div class="view-options" role="group" aria-label="再生対象">
        ${button('view-all', 'すべての曲', `aria-pressed="${view === 'all'}" ${unavailable(busy)}`)}
        ${button('view-folders', 'フォルダ別', `aria-pressed="${view === 'folders'}" ${unavailable(busy)}`)}
      </div>
      ${view === 'folders' ? button('choose-folder', folder === null ? 'フォルダを選ぶ' : `フォルダを変更：${folderLabel(folder)}`, unavailable(busy || !ready)) : ''}
      <label for="play-order">再生方法</label><select id="play-order" ${busy ? 'disabled' : ''}>
        <option value="ordered" ${order === 'ordered' ? 'selected' : ''}>順番再生</option>
        <option value="shuffle" ${order === 'shuffle' ? 'selected' : ''}>シャッフル再生</option>
      </select>
      <section class="playback" aria-label="再生操作">
        <div class="transport">${button('play', player.playing || preparing ? '一時停止' : '再生', `class="primary" ${unavailable(busy || !ready || !items().length)}`)}
          ${button('previous', '前の曲', unavailable(busy || !current()))}${button('next', '次の曲', unavailable(busy || !current()))}</div>
        <div id="playback-summary" tabindex="0" role="group" aria-label="${esc(summary())}">
          <p id="current-name" class="playing-name" aria-hidden="true">${esc(current()?.name ?? '曲を選んでください')}</p>
          <p id="playback-state" aria-hidden="true">${esc(stateText())}</p>
        </div>
        <details><summary>再生の詳細</summary><p id="playback-time"></p><p id="queue-info"></p></details>
      </section>
      <h2 id="list-title" tabindex="-1">${esc(view === 'all' ? 'すべての曲' : folder === null ? 'フォルダ未選択' : folderLabel(folder))}（${items().length}曲）</h2>
      ${items().length ? `<ul aria-label="曲一覧">${items().map((item, i) => `<li>${button(`track-${i}`, `${item.name}、${folderLabel(item.folder)}`, `class="row" data-track="${esc(item.id)}"`)}</li>`).join('')}</ul>` : '<p>曲がありません。音楽フォルダの登録、アクセス許可、選択したフォルダを確認してください。</p>'}
      <div class="section-actions" aria-label="音楽フォルダの設定">
        ${needsPermission ? button('grant', 'アクセスを再許可', unavailable(busy)) : ''}
        ${button('register', root ? '音楽フォルダを再設定' : '音楽フォルダを登録', unavailable(busy || !supported))}
        ${button('refresh', '曲一覧を再読み込み', unavailable(busy || !root))}
      </div>`;
    document.title = '音楽プレーヤー｜MP3かんたんプレイヤー PC';
    updatePlayback();
  }
  if (focusId) focus(document.getElementById(focusId) ? focusId : 'screen-title');
}
function updatePlayback(message) {
  const play = document.getElementById('play');
  if (play) {
    play.textContent = player.playing || preparing ? '一時停止' : '再生';
    document.getElementById('current-name').textContent = current()?.name ?? '曲を選んでください';
    document.getElementById('playback-state').textContent = stateText();
    document.getElementById('playback-summary').setAttribute('aria-label', summary());
    for (const id of ['previous', 'next']) document.getElementById(id).setAttribute('aria-disabled', String(busy || !current()));
    document.getElementById('queue-info').textContent = current() ? `${player.context === null ? 'すべての曲' : folderLabel(player.context)}。${orderLabel()}。${player.queue.length}曲を繰り返します。` : '';
    for (const row of app.querySelectorAll('[data-track]')) {
      const selected = row.dataset.track === current()?.id;
      if (selected) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      const item = library.members.find(item => item.id === row.dataset.track);
      row.setAttribute('aria-label', `${item.name}、${folderLabel(item.folder)}${selected ? '、' + stateText() : '、選んで再生'}`);
    }
    updateTime();
  }
  updateSystemMedia();
  if (message) announce(message);
}
function updateTime() {
  const time = value => Number.isFinite(value) ? `${Math.floor(value / 60)}分${Math.floor(value % 60)}秒` : '時間不明';
  const output = document.getElementById('playback-time');
  if (output) output.textContent = current() ? `${time(audio.currentTime)}／${time(audio.duration)}` : '';
  if (navigator.mediaSession && Number.isFinite(audio.duration) && audio.duration > 0) try {
    navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) });
  } catch {}
}
function updateSystemMedia() {
  if (!navigator.mediaSession) return;
  const item = current();
  navigator.mediaSession.metadata = item && 'MediaMetadata' in window ? new MediaMetadata({ title: item.name, artist: folderLabel(item.folder), album: 'PCの音楽フォルダ' }) : null;
  navigator.mediaSession.playbackState = item ? player.playing ? 'playing' : 'paused' : 'none';
}
function clearSource() {
  ++token; wantsPlay = false; preparing = false; audio.pause();
  audio.removeAttribute('src'); audio.load(); loadedId = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}
function stop() { clearSource(); player = createPlayer(); updateSystemMedia(); }
function showError(message) {
  error = message;
  const output = document.getElementById('visible-error');
  if (output) { output.hidden = false; output.textContent = message; }
  announce(message, true);
}
async function startCurrent(userAction = false) {
  const item = current(); if (!item || busy || !ready) return;
  clearSource(); const sourceToken = token; wantsPlay = true; preparing = true; player.playing = false;
  if (userAction) failed.clear();
  error = ''; document.getElementById('visible-error')?.setAttribute('hidden', ''); updatePlayback();
  try {
    const file = await item.handle.getFile();
    if (sourceToken !== token) return;
    objectUrl = URL.createObjectURL(file); loadedId = item.id; audio.src = objectUrl;
    await audio.play();
  } catch (failure) {
    if (sourceToken !== token) return;
    preparing = false; wantsPlay = false; player.playing = false;
    if (failure.name === 'NotAllowedError' || failure.name === 'SecurityError') {
      const permission = await ensureReadPermission(root).catch(() => false);
      if (sourceToken !== token) return;
      if (!permission) {
        stop(); ready = false; needsPermission = true;
        error = '音楽フォルダへのアクセスが必要です。「アクセスを再許可」を押してください。';
        render('grant'); announce(error, true);
      } else { updatePlayback(); showError('再生を開始できませんでした。「再生」を押してください。'); }
      return;
    }
    handleFailure(sourceToken);
  }
}
function handleFailure(sourceToken = token) {
  if (sourceToken !== token || !current() || failed.has(current().id)) return;
  const name = current().name; failed.add(current().id);
  if (player.queue.every(item => failed.has(item.id))) {
    stop(); updatePlayback(); showError('再生できる曲がありません。元ファイルとドライブの接続を確認し、曲一覧を再読み込みしてください。'); return;
  }
  do { player = step(player, 1); } while (failed.has(current().id));
  void startCurrent(); showError(`「${name}」を再生できません。次の曲「${current().name}」へ進みます。元ファイルを確認してください。`);
}
function togglePlayback() {
  if (busy || !ready || !items().length) return;
  if (player.playing || preparing) {
    ++token; wantsPlay = false; preparing = false; audio.pause(); player.playing = false; updatePlayback('一時停止しました。'); return;
  }
  if (!current()) {
    const list = items();
    const first = list[order === 'shuffle' ? Math.floor(Math.random() * list.length) : 0];
    player = selectTrack(library, scope(), first.id, order); void startCurrent(true); return;
  }
  if (loadedId !== current().id || !audio.getAttribute('src')) { void startCurrent(true); return; }
  wantsPlay = true; preparing = true; updatePlayback(); const sourceToken = token;
  audio.play().catch(() => {
    if (sourceToken !== token) return;
    wantsPlay = false; preparing = false; player.playing = false; updatePlayback(); showError('再生できません。「次の曲」を選ぶか、曲一覧を再読み込みしてください。');
  });
}
function move(delta) {
  if (busy || !ready || !current()) return;
  player = step(player, delta); void startCurrent(true);
}
audio.addEventListener('playing', () => {
  if (!wantsPlay) { audio.pause(); return; }
  preparing = false; player.playing = true; updatePlayback(summary());
});
audio.addEventListener('pause', () => {
  if (audio.ended) return;
  player.playing = false; updatePlayback();
});
audio.addEventListener('ended', () => {
  if (!current() || !wantsPlay) return;
  player = step(player, 1);
  for (let i = 0; i < player.queue.length && failed.has(current().id); i++) player = step(player, 1);
  void startCurrent();
});
audio.addEventListener('error', () => { if (audio.error && wantsPlay) handleFailure(); });
audio.addEventListener('loadedmetadata', updateTime);
audio.addEventListener('timeupdate', updateTime);
if (navigator.mediaSession) for (const [action, handler] of Object.entries({
  play: () => { if (!player.playing) togglePlayback(); },
  pause: () => { if (player.playing || preparing) togglePlayback(); },
  nexttrack: () => move(1), previoustrack: () => move(-1),
  seekto: event => { if (Number.isFinite(event.seekTime) && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(event.seekTime, audio.duration)); },
})) try { navigator.mediaSession.setActionHandler(action, handler); } catch {}

async function readRoot(handle, save = false) {
  busy = true; screen = 'player'; note = '音楽フォルダを確認しています。'; error = ''; render(); announce(note);
  try {
    const nextLibrary = await scanDirectory(handle);
    stop(); root = handle; library = nextLibrary; ready = true; needsPermission = false;
    if (folder !== null && !library.folders.includes(folder)) folder = null;
    note = `${entries(library).length}曲、${library.folders.length}フォルダを読み込みました。`;
    if (!library.members.length) note += ' MP3ファイルが見つかりませんでした。';
    if (save) try { await saveDirectory(handle); } catch { note += ' フォルダ情報を保存できませんでした。次回は音楽フォルダを登録し直してください。'; }
  } catch (failure) {
    stop(); library = { folders: [], members: [] }; ready = false; root = handle; needsPermission = true;
    error = '音楽フォルダを読み取れません。ドライブの接続を確認し、アクセスを再許可するか、音楽フォルダを再設定してください。'; note = '';
  } finally {
    busy = false; render(needsPermission ? 'grant' : 'play'); announce(error || note, !!error);
  }
}
async function register() {
  if (busy || !supported) return;
  busy = true;
  // Call picker directly from the click, before any asynchronous work.
  try {
    const handle = await window.showDirectoryPicker({ id: 'mp3-easy-player-pc-music', mode: 'read' });
    await readRoot(handle, true);
  } catch (failure) {
    busy = false;
    if (failure.name === 'AbortError') { announce('フォルダ選択をキャンセルしました。'); focus('register'); }
    else { render('register'); showError('フォルダを選べませんでした。WindowsのEdgeまたはChromeで、音楽フォルダを選び直してください。'); }
  }
}
async function refresh(request = false) {
  if (busy || !root) return;
  busy = true;
  try {
    const granted = await ensureReadPermission(root, request);
    if (granted) { busy = false; await readRoot(root); return; }
    stop(); library = { folders: [], members: [] }; ready = false; needsPermission = true;
    error = '音楽フォルダへのアクセスが必要です。「アクセスを再許可」を押してください。許可できない場合は音楽フォルダを再設定してください。';
  } catch { ready = false; needsPermission = true; error = 'アクセスを許可できません。音楽フォルダを再設定してください。'; }
  busy = false; render('grant'); announce(error, true);
}
app.addEventListener('change', event => {
  if (event.target.id === 'play-order') {
    order = event.target.value; player = setPlaybackOrder(player, order); updatePlayback(`${orderLabel()}を選びました。`);
  }
});
app.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (busy || target.getAttribute('aria-disabled') === 'true') { announce(busy ? '処理中です。お待ちください。' : needsPermission ? 'アクセスを再許可してください。' : '音楽フォルダと再生対象を確認してください。'); return; }
  if (target.dataset.folder !== undefined) {
    stop(); folder = target.dataset.folder; view = 'folders'; screen = 'player'; render('play');
    announce(`${folderLabel(folder)}、${items().length}曲を選びました。再生ボタンで開始します。`); return;
  }
  if (target.dataset.track !== undefined) { player = selectTrack(library, scope(), target.dataset.track, order); void startCurrent(true); return; }
  switch (target.id) {
    case 'register': void register(); break;
    case 'grant': void refresh(true); break;
    case 'refresh': void refresh(); break;
    case 'choose-folder': screen = 'folders'; render('screen-title'); break;
    case 'back': screen = 'player'; render('choose-folder'); break;
    case 'view-all': case 'view-folders': {
      const next = target.id === 'view-all' ? 'all' : 'folders';
      if (view === next) break;
      stop(); view = next; render(target.id); announce(`${view === 'all' ? 'すべての曲' : 'フォルダ別'}を選びました。再生ボタンで開始します。`); break;
    }
    case 'play': togglePlayback(); break;
    case 'previous': move(-1); break;
    case 'next': move(1); break;
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && screen === 'folders') { screen = 'player'; render('choose-folder'); }
});
document.querySelector('#reload-app').addEventListener('click', () => location.reload());
async function initialize() {
  busy = true; render();
  if (!supported) { busy = false; render(); return; }
  try { root = await loadDirectory(); }
  catch { note = 'フォルダ情報を復元できませんでした。音楽フォルダを登録してください。'; }
  busy = false;
  if (root) await refresh(); else { render(); if (note) announce(note); }
}
void initialize();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(async registration => {
  await navigator.serviceWorker.ready;
  document.querySelector('#offline-state').textContent = '画面をオフラインで起動する準備ができました。音楽の再生には元ファイルと読み取り許可が必要です。';
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        document.querySelector('#offline-state').textContent = '更新があります。再生を終えてから「画面を読み込み直す」を押してください。';
      }
    });
  });
}).catch(() => { document.querySelector('#offline-state').textContent = 'オフライン起動の準備ができません。通信できる状態で利用してください。'; });
