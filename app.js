/* ============================================================
   樊登讲书 · 有声书库 — 播放器逻辑
   v1.0.0
   ============================================================ */
(function () {
  'use strict';

  var LIB = window.LIBRARY;
  if (!LIB || !Array.isArray(LIB.tracks) || !LIB.tracks.length) return;

  /* ---------------- 基础工具 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(n, min, max) { return n < min ? min : n > max ? max : n; }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = String(m).padStart(2, '0');
    var ss = String(s).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }
  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function hexToRgba(hex, alpha) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
    if (!m) return 'rgba(232,180,108,' + alpha + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + alpha + ')';
  }

  /* ---------------- 数据 ---------------- */
  var tracks = LIB.tracks.slice().sort(function (a, b) { return a.no - b.no; });
  var trackById = {};
  tracks.forEach(function (t) { trackById[t.id] = t; });
  var batchById = {};
  (LIB.batches || []).forEach(function (b) { batchById[b.id] = b; });
  function batchName(id) { return (batchById[id] && batchById[id].name) || ('第 ' + id + ' 辑'); }

  var audio = $('#audio');
  var els = {
    app: $('#app'),
    sidebar: $('#sidebar'),
    scrim: $('#scrim'),
    statTotal: $('#statTotal'),
    favCount: $('#favCount'),
    shownCount: $('#shownCount'),
    batchFilter: $('#batchFilter'),
    batchPickWrap: $('#batchPickWrap'),
    playlist: $('#playlist'),
    search: $('#search'),
    btnClearSearch: $('#btnClearSearch'),
    btnOpenSide: $('#btnOpenSide'),
    btnCloseSide: $('#btnCloseSide'),
    btnShuffleAll: $('#btnShuffleAll'),
    btnVersion: $('#btnVersion'),
    nowTitle: $('#nowTitle'),
    btnShare: $('#btnShare'),
    btnInfo: $('#btnInfo'),
    cover: $('#cover'),
    coverLetter: $('#coverLetter'),
    coverNo: $('#coverNo'),
    coverBatch: $('#coverBatch'),
    trackBatch: $('#trackBatch'),
    trackTag: $('#trackTag'),
    trackTitle: $('#trackTitle'),
    trackSub: $('#trackSub'),
    progress: $('#progress'),
    progressBuffer: $('#progressBuffer'),
    progressFill: $('#progressFill'),
    progressDot: $('#progressDot'),
    curTime: $('#curTime'),
    durTime: $('#durTime'),
    btnMode: $('#btnMode'),
    btnPrev: $('#btnPrev'),
    btnPlay: $('#btnPlay'),
    btnNext: $('#btnNext'),
    btnFav: $('#btnFav'),
    btnMute: $('#btnMute'),
    volume: $('#volume'),
    rateLabel: $('#rateLabel'),
    btnRateDown: $('#btnRateDown'),
    btnRateUp: $('#btnRateUp'),
    rateChips: $('#rateChips'),
    btnSleep: $('#btnSleep'),
    sleepPanel: $('#sleepPanel'),
    sleepNote: $('#sleepNote'),
    statusText: $('#statusText'),
    statusDot: $('#statusDot'),
    miniInfo: $('#miniInfo'),
    toast: $('#toast'),
    modal: $('#modal'),
    btnCloseModal: $('#btnCloseModal'),
    modalBody: $('#modalBody'),
    modalVersion: $('#modalVersion')
  };

  /* ---------------- 本地存储 ---------------- */
  var PREFIX = 'fd2.';
  var storage = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) {}
    }
  };

  /* ---------------- 状态 ---------------- */
  var MODE_ORDER = ['list', 'one', 'shuffle'];
  var MODE_META = {
    list: { label: '列表循环', icon: '#i-repeat' },
    one: { label: '单曲循环', icon: '#i-repeat-one' },
    shuffle: { label: '随机播放', icon: '#i-shuffle' }
  };

  var savedFav = storage.get('favorites', []);
  var savedRecent = storage.get('recent', []);
  var savedMode = storage.get('mode', 'list');

  var state = {
    currentId: null,
    playing: false,
    loading: false,
    mode: MODE_ORDER.indexOf(savedMode) >= 0 ? savedMode : 'list',
    tab: 'all',
    batch: 'all',
    query: '',
    favorites: new Set(Array.isArray(savedFav) ? savedFav.filter(function (id) { return !!trackById[id]; }) : []),
    recent: Array.isArray(savedRecent) ? savedRecent.filter(function (id) { return !!trackById[id]; }) : [],
    rate: clamp(Number(storage.get('rate', 1)) || 1, 0.5, 2),
    volume: clamp(Number(storage.get('volume', 1)), 0, 1),
    lastVolume: 1,
    pendingSeek: 0,
    pendingPlay: false,
    scrubbing: false,
    sleepDeadline: 0,
    sleepMinutes: 0,
    lastSave: 0,
    lastPositionState: 0
  };

  var toastTimer = null;
  var toastHideTimer = null;
  var sleepTicker = null;
  var searchTimer = null;

  /* ---------------- 小工具 ---------------- */
  function currentTrack() { return state.currentId ? trackById[state.currentId] : null; }

  function setStatus(text, live) {
    if (els.statusText) els.statusText.textContent = text;
    if (els.statusDot) els.statusDot.classList.toggle('live', !!live);
  }

  function toast(message) {
    if (!els.toast) return;
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    // force reflow so the transition replays for repeated messages
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
      toastHideTimer = setTimeout(function () {
        if (!els.toast.classList.contains('show')) els.toast.hidden = true;
      }, 260);
    }, 2300);
  }

  function setCoverLetter() {
    if (els.coverLetter) els.coverLetter.textContent = LIB.site.brandChar || '樊';
  }

  /* ---------------- 渲染 ---------------- */
  function renderBatchOptions() {
    if (!els.batchFilter) return;
    var html = '<option value="all">全部辑</option>';
    (LIB.batches || []).forEach(function (b) {
      html += '<option value="' + b.id + '">' + escapeHTML(b.name) + '</option>';
    });
    els.batchFilter.innerHTML = html;
    els.batchFilter.value = 'all';
    if (els.batchPickWrap) els.batchPickWrap.hidden = (LIB.batches || []).length <= 1;
  }

  function filteredTracks() {
    var q = state.query.trim().toLowerCase();
    var base;
    if (state.tab === 'recent') {
      base = state.recent.map(function (id) { return trackById[id]; }).filter(Boolean);
    } else {
      base = tracks.slice();
    }
    return base.filter(function (t) {
      if (state.batch !== 'all' && Number(state.batch) !== t.batch) return false;
      if (state.tab === 'fav' && !state.favorites.has(t.id)) return false;
      if (!q) return true;
      var hay = (t.no + ' ' + t.title + ' ' + t.subtitle + ' ' + batchName(t.batch) + ' ' + (t.tag || '')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function emptyHTML() {
    var text = '暂无音频';
    if (state.tab === 'fav') text = '还没有收藏，点曲目右侧的心形即可收藏';
    if (state.tab === 'recent') text = '还没有播放记录';
    if (state.query.trim()) text = '没有找到匹配的音频';
    return '<li class="empty"><svg aria-hidden="true"><use href="#i-book"></use></svg>' + escapeHTML(text) + '</li>';
  }

  function trackHTML(t) {
    var active = t.id === state.currentId;
    var fav = state.favorites.has(t.id);
    return '<li class="track' + (active ? ' active' : '') + (active && state.playing ? ' playing' : '') + '" data-id="' + t.id + '" role="option" aria-selected="' + (active ? 'true' : 'false') + '">' +
      '<button class="track-main" type="button" data-action="select" aria-label="播放 ' + escapeHTML(t.title) + '">' +
        '<span class="track-no">' + t.no + '</span>' +
        '<span class="track-info">' +
          '<span class="track-name">' + escapeHTML(t.title) + '</span>' +
          '<span class="track-sub">' + escapeHTML(batchName(t.batch)) + ' · ' + fmt(t.duration) + '</span>' +
        '</span>' +
        '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '</button>' +
      '<button class="track-fav' + (fav ? ' on' : '') + '" type="button" data-action="fav" title="' + (fav ? '取消收藏' : '收藏') + '" aria-label="' + (fav ? '取消收藏' : '收藏') + ' ' + escapeHTML(t.title) + '">' +
        '<svg aria-hidden="true"><use href="#' + (fav ? 'i-heart-fill' : 'i-heart') + '"></use></svg>' +
      '</button>' +
    '</li>';
  }

  function renderList() {
    if (!els.playlist) return;
    var list = filteredTracks();
    if (els.shownCount) els.shownCount.textContent = list.length;
    els.playlist.innerHTML = list.length ? list.map(trackHTML).join('') : emptyHTML();
    updateListItemStates();
  }

  function updateListItemStates() {
    $$('.track', els.playlist).forEach(function (li) {
      var id = li.getAttribute('data-id');
      var active = id === state.currentId;
      li.classList.toggle('active', active);
      li.classList.toggle('playing', active && state.playing);
      li.setAttribute('aria-selected', active ? 'true' : 'false');

      var favBtn = li.querySelector('.track-fav');
      if (favBtn) {
        var fav = state.favorites.has(id);
        favBtn.classList.toggle('on', fav);
        favBtn.title = fav ? '取消收藏' : '收藏';
        var track = trackById[id];
        favBtn.setAttribute('aria-label', (fav ? '取消收藏 ' : '收藏 ') + (track ? track.title : ''));
        var use = favBtn.querySelector('use');
        if (use) use.setAttribute('href', fav ? '#i-heart-fill' : '#i-heart');
      }
    });
  }

  function updateFavoriteUI() {
    var fav = state.favorites.has(state.currentId);
    if (!els.btnFav) return;
    els.btnFav.classList.toggle('on', fav);
    els.btnFav.title = fav ? '取消收藏' : '收藏';
    els.btnFav.setAttribute('aria-label', fav ? '取消收藏' : '收藏');
    var use = els.btnFav.querySelector('use');
    if (use) use.setAttribute('href', fav ? '#i-heart-fill' : '#i-heart');
  }

  function updateNowPlaying(t) {
    if (!t) return;
    var root = document.documentElement;
    root.style.setProperty('--accent', t.accent || '#e8b46c');
    root.style.setProperty('--accent-strong', t.accent ? t.accent : '#f3c987');
    root.style.setProperty('--accent-soft', hexToRgba(t.accent || '#e8b46c', 0.14));
    root.style.setProperty('--cover-a', t.coverA || '#3a2a1b');
    root.style.setProperty('--cover-b', t.coverB || '#0f0c09');

    setCoverLetter();
    if (els.coverNo) els.coverNo.textContent = t.no;
    if (els.coverBatch) els.coverBatch.textContent = batchName(t.batch);
    if (els.trackBatch) els.trackBatch.textContent = batchName(t.batch);
    if (els.trackTag) els.trackTag.textContent = t.tag || '讲书';
    if (els.trackTitle) els.trackTitle.textContent = t.title;
    if (els.trackSub) els.trackSub.textContent = (t.subtitle || '樊登讲书') + ' · 时长 ' + fmt(t.duration);
    if (els.nowTitle) els.nowTitle.textContent = t.title;
    if (els.durTime) els.durTime.textContent = fmt(t.duration);
    if (els.curTime) els.curTime.textContent = '00:00';
    if (els.progressFill) els.progressFill.style.width = '0%';
    if (els.progressDot) els.progressDot.style.left = '0%';
    if (els.progressBuffer) els.progressBuffer.style.width = '0%';
    if (els.progress) {
      els.progress.setAttribute('aria-valuenow', '0');
      els.progress.setAttribute('aria-valuetext', '00:00 / ' + fmt(t.duration));
    }
    if (els.cover) els.cover.classList.remove('is-playing');
    updateFavoriteUI();
    updateMediaSession(t);
    document.title = t.title + ' · ' + (LIB.site.title || '樊登讲书');
  }

  function updateDurationUI() {
    var t = currentTrack();
    var d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (t ? t.duration : 0);
    if (els.durTime) els.durTime.textContent = fmt(Math.round(d));
  }

  function updateProgress(cur, dur) {
    if (state.scrubbing) return;
    var d = Number(dur) || 0;
    var c = Number(cur) || 0;
    var ratio = d > 0 ? clamp(c / d, 0, 1) : 0;
    if (els.progressFill) els.progressFill.style.width = (ratio * 100) + '%';
    if (els.progressDot) els.progressDot.style.left = (ratio * 100) + '%';
    if (els.curTime) els.curTime.textContent = fmt(c);
    if (els.durTime) els.durTime.textContent = fmt(Math.round(d));
    if (els.progress) {
      els.progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      els.progress.setAttribute('aria-valuetext', fmt(c) + ' / ' + fmt(Math.round(d)));
    }
  }

  function updateBuffer() {
    var d = audio.duration;
    if (!isFinite(d) || d <= 0) return;
    var end = 0;
    try {
      for (var i = 0; i < audio.buffered.length; i++) {
        if (audio.buffered.start(i) <= audio.currentTime + 1) {
          end = Math.max(end, audio.buffered.end(i));
        }
      }
    } catch (e) {}
    if (els.progressBuffer) els.progressBuffer.style.width = clamp((end / d) * 100, 0, 100) + '%';
  }

  /* ---------------- 播放 ---------------- */
  function setPlayUI(playing) {
    state.playing = !!playing;
    if (els.btnPlay) {
      els.btnPlay.innerHTML = '<svg aria-hidden="true"><use href="#' + (playing ? 'i-pause' : 'i-play') + '"></use></svg>';
      els.btnPlay.setAttribute('aria-label', playing ? '暂停' : '播放');
      els.btnPlay.title = playing ? '暂停 (空格)' : '播放 (空格)';
    }
    if (els.cover) els.cover.classList.toggle('is-playing', playing);
    updateListItemStates();
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
    }
    if (playing) setStatus('正在播放 · 锁屏可继续', true);
    else if (!state.loading) setStatus('已暂停');
  }

  function playAudio() {
    if (!state.currentId) return;
    state.pendingPlay = false;
    var promise = audio.play();
    if (promise && typeof promise.then === 'function') {
      promise.then(function () {
        pushRecent(state.currentId);
      }).catch(function (err) {
        if (err && (err.name === 'AbortError')) return;
        setPlayUI(false);
        setStatus('点击播放按钮开始');
        if (err && err.name === 'NotAllowedError') {
          toast('请点击播放按钮开始播放');
        } else {
          toast('播放失败，请检查网络后重试');
        }
      });
    } else {
      pushRecent(state.currentId);
    }
  }

  function togglePlay() {
    if (!state.currentId && tracks.length) {
      loadTrack(tracks[0].id, { autoplay: true });
      return;
    }
    if (audio.paused) playAudio();
    else audio.pause();
  }

  function loadTrack(id, opts) {
    opts = opts || {};
    var track = trackById[id];
    if (!track) return;
    var autoplay = !!opts.autoplay;
    var same = state.currentId === id;

    if (same && !opts.reload) {
      if (autoplay) playAudio();
      return;
    }

    state.loading = true;
    if (!audio.paused) {
      try { audio.pause(); } catch (e) {}
    }
    savePos(true);
    state.currentId = id;
    state.pendingSeek = 0;
    state.pendingPlay = autoplay;
    state.scrubbing = false;
    state.lastSave = 0;

    audio.src = track.file;
    try { audio.load(); } catch (e) {}

    var saved = getSavedPos(id, track);
    if (saved > 20) state.pendingSeek = saved;

    updateNowPlaying(track);
    storage.set('last', id);
    writeHash(id);
    renderList();
    setPlayUI(false);
    setStatus('正在载入…', true);
    updateProgress(0, 0, track.duration);
    if (els.progressBuffer) els.progressBuffer.style.width = '0%';

    if (autoplay) {
      // Some browsers resolve play() before metadata; loadedmetadata will
      // also try again after applying the saved position.
      playAudio();
    }
  }

  function playNext(auto) {
    if (!tracks.length) return;
    if (!state.currentId) {
      loadTrack(tracks[0].id, { autoplay: true });
      return;
    }
    var next;
    if (state.mode === 'shuffle' && tracks.length > 1) {
      var pool = tracks.filter(function (t) { return t.id !== state.currentId; });
      next = pool[Math.floor(Math.random() * pool.length)];
    } else {
      var idx = tracks.findIndex(function (t) { return t.id === state.currentId; });
      next = tracks[(idx + 1) % tracks.length];
    }
    loadTrack(next.id, { autoplay: true });
  }

  function playPrev() {
    if (!state.currentId) return;
    if (audio.currentTime > 3) {
      try { audio.currentTime = 0; } catch (e) {}
      updateProgress(0, audio.duration || (currentTrack() ? currentTrack().duration : 0));
      savePos(true);
      return;
    }
    var wasPlaying = !audio.paused;
    var idx = tracks.findIndex(function (t) { return t.id === state.currentId; });
    var prev = tracks[(idx - 1 + tracks.length) % tracks.length];
    loadTrack(prev.id, { autoplay: wasPlaying });
  }

  function shuffleAll() {
    if (!tracks.length) return;
    setMode('shuffle', false);
    var pool = tracks.filter(function (t) { return t.id !== state.currentId; });
    var next = (pool.length ? pool : tracks)[Math.floor(Math.random() * (pool.length ? pool.length : tracks.length))];
    loadTrack(next.id, { autoplay: true });
    toast('随机播放全部');
  }

  function cycleMode() {
    var idx = MODE_ORDER.indexOf(state.mode);
    setMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length], true);
  }

  function setMode(mode, notify) {
    if (!MODE_META[mode]) mode = 'list';
    state.mode = mode;
    storage.set('mode', mode);
    var meta = MODE_META[mode];
    if (els.btnMode) {
      els.btnMode.innerHTML = '<svg aria-hidden="true"><use href="' + meta.icon + '"></use></svg>';
      els.btnMode.title = meta.label;
      els.btnMode.setAttribute('aria-label', '播放模式：' + meta.label);
      els.btnMode.classList.toggle('on', mode !== 'list');
    }
    if (notify) toast(meta.label);
  }

  function setRate(rate, notify) {
    var r = Number(rate);
    if (!isFinite(r)) r = 1;
    r = clamp(Math.round(r * 100) / 100, 0.5, 2);
    state.rate = r;
    audio.playbackRate = r;
    storage.set('rate', r);
    var label = (r % 1 === 0 ? r.toFixed(1) : String(r)) + '×';
    if (els.rateLabel) els.rateLabel.textContent = label;
    $$('#rateChips button').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-rate')) === r);
    });
    if (notify) toast('播放速度 ' + label);
  }

  function setVolume(v, notify) {
    v = clamp(Number(v), 0, 1);
    if (!isFinite(v)) v = 1;
    state.volume = v;
    if (v > 0.001) state.lastVolume = v;
    audio.volume = v;
    audio.muted = v <= 0.001;
    storage.set('volume', v);
    if (els.volume) els.volume.value = String(v);
    var muted = v <= 0.001;
    if (els.btnMute) {
      els.btnMute.innerHTML = '<svg aria-hidden="true"><use href="#' + (muted ? 'i-mute' : 'i-volume') + '"></use></svg>';
      els.btnMute.setAttribute('aria-label', muted ? '取消静音' : '静音');
      els.btnMute.title = muted ? '取消静音' : '静音';
    }
    if (notify) toast(muted ? '已静音' : '音量 ' + Math.round(v * 100) + '%');
  }

  function toggleMute() {
    // iOS Safari ignores audio.volume, so use our own state for the toggle.
    if (state.volume > 0.001) setVolume(0, true);
    else setVolume(state.lastVolume || 0.8, true);
  }

  /* ---------------- 收藏 / 最近 ---------------- */
  function toggleFavorite(id) {
    id = id || state.currentId;
    if (!id) return;
    var wasFav = state.favorites.has(id);
    if (wasFav) state.favorites.delete(id);
    else state.favorites.add(id);
    storage.set('favorites', Array.from(state.favorites));
    if (els.favCount) els.favCount.textContent = String(state.favorites.size);
    updateFavoriteUI();
    if (state.tab === 'fav') renderList();
    else updateListItemStates();
    toast(wasFav ? '已取消收藏' : '已收藏');
  }

  function pushRecent(id) {
    if (!id) return;
    state.recent = [id].concat(state.recent.filter(function (x) { return x !== id; })).slice(0, 20);
    storage.set('recent', state.recent);
    if (state.tab === 'recent') renderList();
  }

  /* ---------------- 断点续听 ---------------- */
  function getSavedPos(id, track) {
    var map = storage.get('positions', {});
    var pos = Number(map && map[id]);
    if (!isFinite(pos) || pos < 15) return 0;
    var d = track ? track.duration : 0;
    if (d && pos > d - 20) return 0;
    return pos;
  }

  function savePos(force) {
    if (!state.currentId) return;
    var now = Date.now();
    if (!force && now - state.lastSave < 5000) return;
    state.lastSave = now;
    var map = storage.get('positions', {});
    if (!map || typeof map !== 'object') map = {};
    var c = audio.currentTime || 0;
    var d = audio.duration;
    if (c > 5 && (!isFinite(d) || d <= 0 || c < d - 15)) {
      map[state.currentId] = Math.round(c);
    } else {
      delete map[state.currentId];
    }
    storage.set('positions', map);
  }

  function clearSavedPos(id) {
    if (!id) return;
    var map = storage.get('positions', {});
    if (map && map[id] != null) {
      delete map[id];
      storage.set('positions', map);
    }
  }

  /* ---------------- 进度拖动 ---------------- */
  var scrubRatio = 0;

  function ratioFromEvent(e) {
    var rect = els.progress.getBoundingClientRect();
    var clientX = e.clientX;
    if (typeof clientX !== 'number' && e.touches && e.touches[0]) clientX = e.touches[0].clientX;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }

  function previewScrub(e) {
    scrubRatio = ratioFromEvent(e);
    var d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (currentTrack() ? currentTrack().duration : 0);
    var c = scrubRatio * d;
    if (els.progressFill) els.progressFill.style.width = (scrubRatio * 100) + '%';
    if (els.progressDot) els.progressDot.style.left = (scrubRatio * 100) + '%';
    if (els.curTime) els.curTime.textContent = fmt(c);
    if (els.durTime) els.durTime.textContent = fmt(Math.round(d));
    if (els.progress) {
      els.progress.setAttribute('aria-valuenow', String(Math.round(scrubRatio * 100)));
      els.progress.setAttribute('aria-valuetext', fmt(c) + ' / ' + fmt(Math.round(d)));
    }
  }

  function startScrub(e) {
    if (!state.currentId) return;
    if (e.button != null && e.button !== 0) return;
    state.scrubbing = true;
    els.progress.classList.add('scrubbing');
    try { els.progress.setPointerCapture(e.pointerId); } catch (err) {}
    previewScrub(e);
    e.preventDefault();
  }

  function moveScrub(e) {
    if (!state.scrubbing) return;
    previewScrub(e);
    e.preventDefault();
  }

  function endScrub(e) {
    if (!state.scrubbing) return;
    state.scrubbing = false;
    els.progress.classList.remove('scrubbing');
    var d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (currentTrack() ? currentTrack().duration : 0);
    if (d > 0) {
      try { audio.currentTime = scrubRatio * d; } catch (err) {}
      updateProgress(scrubRatio * d, d);
      savePos(true);
      updatePositionState();
    }
    try { els.progress.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  function seekBy(seconds) {
    if (!state.currentId) return;
    var d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (currentTrack() ? currentTrack().duration : 0);
    if (!d) return;
    audio.currentTime = clamp(audio.currentTime + seconds, 0, Math.max(0, d - 1));
    updateProgress(audio.currentTime, d);
    savePos(true);
    updatePositionState();
  }

  /* ---------------- 定时关闭 ---------------- */
  function updateSleepUI() {
    if (!state.sleepDeadline) {
      if (els.btnSleep) els.btnSleep.removeAttribute('data-badge');
      if (els.sleepNote) els.sleepNote.hidden = true;
      return;
    }
    var left = Math.max(0, state.sleepDeadline - Date.now());
    if (els.btnSleep) els.btnSleep.setAttribute('data-badge', Math.max(1, Math.ceil(left / 60000)) + '′');
    if (els.sleepNote) {
      els.sleepNote.hidden = false;
      els.sleepNote.innerHTML = '剩余 <b>' + fmt(left / 1000) + '</b>';
    }
  }

  function updateSleepPanel() {
    $$('#sleepPanel button[data-min]').forEach(function (b) {
      var m = Number(b.getAttribute('data-min'));
      b.classList.toggle('active', state.sleepDeadline ? m === state.sleepMinutes : m === 0);
    });
  }

  function setSleep(minutes) {
    minutes = Number(minutes) || 0;
    clearInterval(sleepTicker);
    sleepTicker = null;
    if (!minutes) {
      state.sleepDeadline = 0;
      state.sleepMinutes = 0;
      updateSleepUI();
      updateSleepPanel();
      closeSleepPanel();
      toast('定时关闭已取消');
      return;
    }
    state.sleepMinutes = minutes;
    state.sleepDeadline = Date.now() + minutes * 60000;
    updateSleepUI();
    updateSleepPanel();
    closeSleepPanel();
    sleepTicker = setInterval(function () {
      updateSleepUI();
      checkSleep();
    }, 1000);
    toast(minutes + ' 分钟后自动暂停');
  }

  function checkSleep() {
    if (state.sleepDeadline && Date.now() >= state.sleepDeadline) {
      state.sleepDeadline = 0;
      state.sleepMinutes = 0;
      clearInterval(sleepTicker);
      sleepTicker = null;
      if (!audio.paused) audio.pause();
      updateSleepUI();
      updateSleepPanel();
      toast('定时结束，已暂停');
    }
  }

  function openSleepPanel() {
    if (!els.sleepPanel) return;
    els.sleepPanel.hidden = false;
    updateSleepPanel();
    updateSleepUI();
  }

  function closeSleepPanel() {
    if (els.sleepPanel) els.sleepPanel.hidden = true;
  }

  /* ---------------- 分享 ---------------- */
  function buildShareUrl(id) {
    var url = new URL(location.href);
    url.hash = id;
    return url.href;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        toast('链接已复制，发给朋友即可播放');
      }).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    toast(ok ? '链接已复制，发给朋友即可播放' : '复制失败，请手动复制地址栏链接');
  }

  function shareCurrent() {
    var t = currentTrack();
    if (!t) return;
    var url = buildShareUrl(t.id);
    var data = {
      title: t.title + ' · ' + (LIB.site.title || '樊登讲书'),
      text: t.title + '｜' + (t.subtitle || '有声精选'),
      url: url
    };
    if (navigator.share) {
      try {
        var p = navigator.share(data);
        if (p && typeof p.catch === 'function') {
          p.catch(function (err) {
            if (err && err.name === 'AbortError') return;
            copyText(url);
          });
        }
      } catch (e) {
        copyText(url);
      }
    } else {
      copyText(url);
    }
  }

  /* ---------------- 链接 ---------------- */
  function writeHash(id) {
    var target = '#' + encodeURIComponent(id);
    if (location.hash === target) return;
    try { history.replaceState(null, '', target); }
    catch (e) { location.hash = id; }
  }

  function handleHashChange() {
    var id = '';
    try { id = decodeURIComponent((location.hash || '').replace(/^#/, '')); } catch (e) {}
    if (id && trackById[id] && id !== state.currentId) {
      loadTrack(id, { autoplay: false });
      toast('已切换到 ' + trackById[id].title);
    }
  }

  /* ---------------- 系统媒体控制（锁屏/耳机） ---------------- */
  function updateMediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    try {
      if ('MediaMetadata' in window) {
        var cover = new URL('assets/cover-512.png', location.href).href;
        var icon = new URL('assets/cover-192.png', location.href).href;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title,
          artist: LIB.site.title || '樊登讲书',
          album: batchName(t.batch),
          artwork: [
            { src: cover, sizes: '512x512', type: 'image/png' },
            { src: icon, sizes: '192x192', type: 'image/png' }
          ]
        });
      }
    } catch (e) {}
  }

  function updatePositionState() {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    var d = audio.duration;
    if (!isFinite(d) || d <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: d,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, d)
      });
    } catch (e) {}
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var ms = navigator.mediaSession;
    function safe(action, handler) {
      try { ms.setActionHandler(action, handler); } catch (e) {}
    }
    safe('play', function () { playAudio(); });
    safe('pause', function () { audio.pause(); });
    safe('previoustrack', function () { playPrev(); });
    safe('nexttrack', function () { playNext(true); });
    safe('seekbackward', function (d) { seekBy(-(d && d.seekOffset ? d.seekOffset : 15)); });
    safe('seekforward', function (d) { seekBy(d && d.seekOffset ? d.seekOffset : 15); });
    safe('seekto', function (d) {
      if (d && typeof d.seekTime === 'number' && isFinite(d.seekTime)) {
        audio.currentTime = d.seekTime;
        updateProgress(audio.currentTime, audio.duration);
        updatePositionState();
      }
    });
    safe('stop', function () {
      audio.pause();
      try { audio.currentTime = 0; } catch (e) {}
      updateProgress(0, audio.duration || (currentTrack() ? currentTrack().duration : 0));
      savePos(true);
    });
  }

  /* ---------------- 弹层 ---------------- */
  function renderModal() {
    var total = tracks.reduce(function (sum, t) { return sum + (Number(t.duration) || 0); }, 0);
    var stats = '<div class="modal-stats">' +
      '<div class="stat"><b>' + tracks.length + '</b><span>集音频</span></div>' +
      '<div class="stat"><b>' + fmt(total) + '</b><span>总时长</span></div>' +
      '<div class="stat"><b>' + (LIB.batches || []).length + '</b><span>辑</span></div>' +
    '</div>';

    var tips = '<h4>播放提示</h4>' +
      '<div class="tip"><strong>锁屏 / 熄屏播放</strong><p>点击播放后可以直接锁屏。iOS 与 Android 都会在锁屏界面显示标题和上一集、下一集按钮；首次播放必须由你点一下（系统禁止自动播放）。</p></div>' +
      '<div class="tip"><strong>分享给朋友</strong><p>点右上角的分享按钮，链接会自动定位到当前这一集。对方用手机浏览器打开即可播放。</p></div>' +
      '<div class="tip"><strong>微信里打开？</strong><p>如果后台播放被暂停，请点右上角「…」→「在浏览器中打开」。系统浏览器对锁屏播放的支持最完整。</p></div>';

    var logs = (LIB.changelog || []).map(function (log) {
      var items = (log.items || []).map(function (item) { return '<li>' + escapeHTML(item) + '</li>'; }).join('');
      return '<div class="log-item">' +
        '<div class="log-head"><span class="log-ver">v' + escapeHTML(log.version) + '</span><span class="log-date">' + escapeHTML(log.date) + '</span></div>' +
        '<p class="log-title">' + escapeHTML(log.title || '') + '</p>' +
        '<ul>' + items + '</ul>' +
      '</div>';
    }).join('');

    els.modalBody.innerHTML = stats + tips + '<h4>更新记录</h4><div class="log">' + logs + '</div>' +
      '<div class="modal-foot">当前版本 v' + escapeHTML(LIB.site.version) + ' · 更新于 ' + escapeHTML(LIB.site.released) + '<br>音频为 48 kbps AAC，兼顾清晰度与加载速度；收藏与播放进度仅保存在本机浏览器。<br>本页为个人学习分享页面，非官方站点。</div>';
    els.modalVersion.textContent = 'v' + LIB.site.version + ' · ' + LIB.site.released;
  }

  function openModal() {
    renderModal();
    closeSide();
    els.modal.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(function () {
      var card = els.modal.querySelector('.modal-card');
      if (card) {
        try { card.focus({ preventScroll: true }); }
        catch (e) { card.focus(); }
      }
    }, 60);
  }

  function closeModal() {
    els.modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  /* ---------------- 侧栏 ---------------- */
  function openSide() {
    els.sidebar.classList.add('open');
    els.scrim.hidden = false;
  }

  function closeSide() {
    els.sidebar.classList.remove('open');
    els.scrim.hidden = true;
  }

  /* ---------------- 初始化 ---------------- */
  function pickInitialId() {
    var hashId = '';
    try { hashId = decodeURIComponent((location.hash || '').replace(/^#/, '')); } catch (e) {}
    if (hashId && trackById[hashId]) return hashId;
    var last = storage.get('last', '');
    if (last && trackById[last]) return last;
    return tracks[0].id;
  }

  function bindAudioEvents() {
    audio.addEventListener('loadedmetadata', function () {
      var t = currentTrack();
      var d = audio.duration;
      if (t && isFinite(d) && d > 0) t.duration = Math.round(d);
      if (state.pendingSeek) {
        var target = state.pendingSeek;
        if (isFinite(d) && d > 0) target = Math.min(target, Math.max(0, d - 5));
        try { audio.currentTime = target; } catch (e) {}
        if (target > 20) toast('已从 ' + fmt(target) + ' 继续播放');
        state.pendingSeek = 0;
      }
      audio.playbackRate = state.rate;
      audio.volume = state.volume;
      audio.muted = state.volume <= 0.001;
      state.loading = false;
      updateDurationUI();
      updateProgress(audio.currentTime || 0, d || (t ? t.duration : 0));
      updateBuffer();
      if (state.pendingPlay || (!audio.paused && !audio.ended)) {
        state.pendingPlay = false;
        playAudio();
      } else {
        setPlayUI(false);
        setStatus('就绪 · 点击播放');
      }
    });

    audio.addEventListener('progress', updateBuffer);
    audio.addEventListener('durationchange', updateDurationUI);

    audio.addEventListener('timeupdate', function () {
      if (state.scrubbing) return;
      var d = isFinite(audio.duration) ? audio.duration : (currentTrack() ? currentTrack().duration : 0);
      updateProgress(audio.currentTime, d);
      updateBuffer();
      if (Date.now() - state.lastSave > 5000) savePos();
      checkSleep();
      if (Date.now() - state.lastPositionState > 1000) {
        updatePositionState();
        state.lastPositionState = Date.now();
      }
    });

    audio.addEventListener('play', function () {
      state.loading = false;
      setPlayUI(true);
      pushRecent(state.currentId);
      if (currentTrack()) updateMediaSession(currentTrack());
      updatePositionState();
    });

    audio.addEventListener('pause', function () {
      setPlayUI(false);
      if (state.loading) {
        setStatus('正在载入…', true);
      } else {
        savePos(true);
      }
    });

    audio.addEventListener('playing', function () {
      state.loading = false;
      setPlayUI(true);
      setStatus('正在播放 · 锁屏可继续', true);
    });

    audio.addEventListener('waiting', function () {
      setStatus('缓冲中…', true);
    });

    audio.addEventListener('canplay', function () {
      if (!state.loading) return;
      state.loading = false;
      if (!audio.paused) setStatus('正在播放 · 锁屏可继续', true);
      else setStatus('就绪 · 点击播放');
    });

    audio.addEventListener('error', function () {
      state.loading = false;
      setPlayUI(false);
      setStatus('音频加载失败');
      toast('音频加载失败，请检查网络或文件路径');
    });

    audio.addEventListener('ended', function () {
      savePos(true);
      clearSavedPos(state.currentId);
      if (state.mode === 'one') {
        try { audio.currentTime = 0; } catch (e) {}
        playAudio();
        return;
      }
      playNext(true);
    });
  }

  function bindEvents() {
    if (els.btnPlay) els.btnPlay.addEventListener('click', togglePlay);
    if (els.btnPrev) els.btnPrev.addEventListener('click', playPrev);
    if (els.btnNext) els.btnNext.addEventListener('click', function () { playNext(false); });
    if (els.btnMode) els.btnMode.addEventListener('click', cycleMode);
    if (els.btnFav) els.btnFav.addEventListener('click', function () { toggleFavorite(); });
    if (els.btnShuffleAll) els.btnShuffleAll.addEventListener('click', function () {
      shuffleAll();
      if (window.innerWidth <= 900) closeSide();
    });
    if (els.btnShare) els.btnShare.addEventListener('click', shareCurrent);

    if (els.btnMute) els.btnMute.addEventListener('click', toggleMute);
    if (els.volume) els.volume.addEventListener('input', function () { setVolume(els.volume.value, false); });
    if (els.volume) els.volume.addEventListener('change', function () { setVolume(els.volume.value, true); });
    if (els.btnRateDown) els.btnRateDown.addEventListener('click', function () { setRate(state.rate - 0.25, true); });
    if (els.btnRateUp) els.btnRateUp.addEventListener('click', function () { setRate(state.rate + 0.25, true); });
    if (els.rateChips) {
      els.rateChips.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-rate]');
        if (btn) setRate(Number(btn.getAttribute('data-rate')), true);
      });
    }

    if (els.progress) {
      els.progress.addEventListener('pointerdown', startScrub);
      els.progress.addEventListener('pointermove', moveScrub);
      els.progress.addEventListener('pointerup', endScrub);
      els.progress.addEventListener('pointercancel', endScrub);
      els.progress.addEventListener('keydown', function (e) {
        var d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (currentTrack() ? currentTrack().duration : 0);
        if (!d) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); seekBy(-10); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seekBy(10); }
        else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); audio.currentTime = 0; updateProgress(0, d); }
        else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); audio.currentTime = Math.max(0, d - 1); updateProgress(audio.currentTime, d); }
      });
    }

    if (els.btnSleep) {
      els.btnSleep.addEventListener('click', function (e) {
        e.stopPropagation();
        if (els.sleepPanel.hidden) openSleepPanel();
        else closeSleepPanel();
      });
    }
    if (els.sleepPanel) {
      els.sleepPanel.addEventListener('click', function (e) {
        e.stopPropagation();
        var btn = e.target.closest('button[data-min]');
        if (btn) setSleep(Number(btn.getAttribute('data-min')));
      });
    }
    document.addEventListener('click', function (e) {
      if (els.sleepPanel && !els.sleepPanel.hidden && !e.target.closest('.sleep-wrap')) closeSleepPanel();
    });

    if (els.playlist) {
      els.playlist.addEventListener('click', function (e) {
        var li = e.target.closest('.track');
        if (!li) return;
        var id = li.getAttribute('data-id');
        var actionEl = e.target.closest('[data-action]');
        var action = actionEl ? actionEl.getAttribute('data-action') : '';
        if (action === 'fav') { toggleFavorite(id); return; }
        if (action === 'select') {
          if (id === state.currentId) togglePlay();
          else loadTrack(id, { autoplay: true });
          if (window.innerWidth <= 900) closeSide();
        }
      });
    }

    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.tab = tab.getAttribute('data-tab') || 'all';
        $$('.tab').forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderList();
      });
    });

    if (els.search) {
      els.search.addEventListener('input', function () {
        state.query = els.search.value;
        if (els.btnClearSearch) els.btnClearSearch.hidden = !state.query;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderList, 80);
      });
    }
    if (els.btnClearSearch) {
      els.btnClearSearch.addEventListener('click', function () {
        state.query = '';
        if (els.search) { els.search.value = ''; els.search.focus(); }
        els.btnClearSearch.hidden = true;
        renderList();
      });
    }
    if (els.batchFilter) {
      els.batchFilter.addEventListener('change', function () {
        state.batch = els.batchFilter.value;
        renderList();
      });
    }

    if (els.btnOpenSide) els.btnOpenSide.addEventListener('click', openSide);
    if (els.btnCloseSide) els.btnCloseSide.addEventListener('click', closeSide);
    if (els.scrim) els.scrim.addEventListener('click', closeSide);

    if (els.btnVersion) els.btnVersion.addEventListener('click', openModal);
    if (els.btnInfo) els.btnInfo.addEventListener('click', openModal);
    if (els.btnCloseModal) els.btnCloseModal.addEventListener('click', closeModal);
    if (els.modal) {
      els.modal.addEventListener('click', function (e) {
        if (e.target === els.modal) closeModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName ? e.target.tagName : '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (els.modal && !els.modal.hidden) {
        if (e.key === 'Escape') closeModal();
        return;
      }
      var interactive = e.target && e.target.closest
        ? e.target.closest('button,a,[role="slider"]')
        : null;
      if (interactive) {
        if (e.key === 'Escape') { closeSide(); closeSleepPanel(); }
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        playNext(false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(audio.volume + 0.05, true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(audio.volume - 0.05, true);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFavorite();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'Escape') {
        closeSide();
        closeSleepPanel();
      }
    });

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('pagehide', function () { savePos(true); });
    window.addEventListener('beforeunload', function () { savePos(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) savePos(true);
      else updatePositionState();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeSide();
    });
  }

  function init() {
    if (els.statTotal) els.statTotal.textContent = String(tracks.length);
    if (els.favCount) els.favCount.textContent = String(state.favorites.size);
    if (els.btnVersion) els.btnVersion.textContent = 'v' + LIB.site.version;
    if (els.miniInfo) els.miniInfo.textContent = 'v' + LIB.site.version + ' · 锁屏可播放';
    if (els.modalVersion) els.modalVersion.textContent = 'v' + LIB.site.version + ' · ' + LIB.site.released;
    var metaVersion = document.querySelector('meta[name="version"]');
    if (metaVersion) metaVersion.setAttribute('content', LIB.site.version);
    setCoverLetter();
    renderBatchOptions();

    // 恢复偏好
    setMode(state.mode, false);
    setRate(state.rate, false);
    state.lastVolume = state.volume > 0 ? state.volume : 1;
    setVolume(state.volume, false);

    bindEvents();
    bindAudioEvents();
    setupMediaSession();

    var hashId = '';
    try { hashId = decodeURIComponent((location.hash || '').replace(/^#/, '')); } catch (e) {}
    var initialId = pickInitialId();
    loadTrack(initialId, { autoplay: false });
    renderList();
    updateSleepPanel();

    if (hashId && trackById[hashId]) {
      setTimeout(function () {
        var t = currentTrack();
        if (t) toast('已定位到 ' + t.title + '，点击播放');
      }, 700);
    }

    window.__FD_READY__ = true;
  }

  init();
})();
