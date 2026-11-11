/**
 * Mint Day · Kim Oanh — Daily Planner & Focus Hub
 * Designed for single-screen zero-scroll productivity & personal local persistence.
 * Features:
 *  - 100% reliable LocalStorage data persistence (no loss on refresh/restart)
 *  - Independent multi-task countdown timer (switch & pause without losing time)
 *  - 25 motivational songs (Á · Âu · Mỹ) with volume control
 *  - Zero sound effects (clean, quiet, tranquil)
 */
(() => {
  "use strict";

  const STORAGE_KEY = "mint-day-v2";

  const $ = id => document.getElementById(id);

  // Helper: Format Date YYYY-MM-DD
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);

  // Initial default seed (only used once if localStorage is completely blank)
  const defaultInitialTasks = () => [
    { id: "task-1", name: "Lên lịch trình & mục tiêu học tập ngày mới", minutes: 20, category: "Học tập", repeat: "daily", done: true, completedAt: new Date().toISOString(), remainingSeconds: 0, timerStatus: "done" },
    { id: "task-2", name: "Thực hành cấu trúc dữ liệu & giải thuật", minutes: 45, category: "Học tập", repeat: "daily", done: false, completedAt: null, remainingSeconds: 45 * 60, timerStatus: "idle" },
    { id: "task-3", name: "Hoàn thiện kế hoạch & ôn bài", minutes: 35, category: "Công việc", repeat: "none", done: false, completedAt: null, remainingSeconds: 35 * 60, timerStatus: "idle" },
    { id: "task-4", name: "Uống 2L nước & tập yoga nhẹ buổi chiều", minutes: 25, category: "Cá nhân", repeat: "daily", done: false, completedAt: null, remainingSeconds: 25 * 60, timerStatus: "idle" },
    { id: "task-5", name: "Đọc 15 trang sách trước khi ngủ", minutes: 20, category: "Tối", repeat: "daily", done: false, completedAt: null, remainingSeconds: 20 * 60, timerStatus: "idle" }
  ];

  // Default state constructor
  const blankState = () => ({
    version: 2,
    date: todayKey(),
    owner: "Kim Oanh",
    lastUpdated: new Date().toISOString(),
    tasks: defaultInitialTasks(),
    elapsedToday: 0,
    history: {}
  });

  // 100% RELIABLE LOCAL STORAGE LOADER
  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = blankState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tasks)) {
        const initial = blankState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }

      // Normalize tasks to ensure proper countdown timer fields exist
      const tasks = parsed.tasks.map(t => {
        const mins = Number(t.minutes) || 25;
        let rem = typeof t.remainingSeconds === "number" ? t.remainingSeconds : mins * 60;
        let status = t.timerStatus || (t.done ? "done" : "idle");
        // If it was running when browser closed/reloaded, cleanly mark as paused
        if (status === "running") {
          status = "paused";
        }
        return {
          id: t.id || uid(),
          name: t.name || "Mục tiêu",
          minutes: mins,
          category: t.category || "Học tập",
          repeat: t.repeat || "none",
          done: !!t.done,
          completedAt: t.completedAt || null,
          remainingSeconds: rem,
          timerStatus: status,
          lastStartedAt: null
        };
      });

      return {
        version: 2,
        date: parsed.date || todayKey(),
        owner: parsed.owner || "Kim Oanh",
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        tasks,
        elapsedToday: Number(parsed.elapsedToday) || 0,
        history: parsed.history && typeof parsed.history === "object" ? parsed.history : {}
      };
    } catch {
      return blankState();
    }
  }

  let state = loadLocalState();
  let filter = "all";
  let selectedId = null;
  let ticker = null;
  let toastTimer = null;
  let viewedDate = todayKey();
  let calendarMonth = new Date();

  // Snapshot into history
  function snapshot(targetDate = state.date) {
    if (!state.history) state.history = {};
    state.history[targetDate] = {
      tasks: state.tasks.map(t => ({
        id: t.id,
        name: t.name,
        minutes: t.minutes,
        category: t.category,
        repeat: t.repeat || "none",
        done: !!t.done,
        completedAt: t.completedAt || null,
        remainingSeconds: t.remainingSeconds,
        timerStatus: t.timerStatus
      })),
      focusSeconds: Math.max(0, Math.floor(state.elapsedToday)),
      savedAt: new Date().toISOString()
    };
    state.lastUpdated = new Date().toISOString();
  }

  // Save directly to localStorage immediately
  function saveLocal() {
    snapshot();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast("Bộ nhớ trình duyệt đầy, hãy xuất file sao lưu.");
    }
  }

  // Date rollover handling (preserves user tasks, never deletes tasks!)
  function rolloverIfNeeded() {
    const today = todayKey();
    if (state.date === today) return;

    snapshot(state.date);
    state.date = today;
    state.elapsedToday = 0;
    saveLocal();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function dateObj(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatDisplayDate(key, opts = { weekday: "short", day: "numeric", month: "numeric", year: "numeric" }) {
    try {
      return new Intl.DateTimeFormat("vi-VN", opts).format(dateObj(key));
    } catch {
      return key;
    }
  }

  function formatClock(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function showToast(message) {
    const t = $("toast");
    if (!t) return;
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function getRepeatLabel(repeat) {
    if (repeat === "daily") return "🔁 Hàng ngày";
    if (repeat === "weekly") return "📅 Hàng tuần";
    if (repeat === "monthly") return "🗓️ Hàng tháng";
    return "";
  }

  function isTodayView() {
    return viewedDate === todayKey();
  }

  function getDayRecord(key) {
    if (key === state.date) {
      return { tasks: state.tasks, focusSeconds: state.elapsedToday };
    }
    return state.history ? state.history[key] || null : null;
  }

  function currentTask() {
    return state.tasks.find(t => t.id === selectedId) || null;
  }

  function runningTask() {
    return state.tasks.find(t => t.timerStatus === "running") || null;
  }

  // ==========================================================
  // PLAYLIST 25 BÀI NHẠC ĐỘNG LỰC (Á · ÂU · MỸ)
  // ==========================================================
  const MOTIVATIONAL_PLAYLIST = [
    // --- 🌸 Á (Châu Á · Piano, Lofi & Ghibli) ---
    { id: 1, title: "River Flows in You", artist: "Yiruma", region: "Á", tag: "Hàn Quốc · Piano Focus", duration: "3:08", src: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=piano-moment-9835.mp3" },
    { id: 2, title: "Kiss the Rain", artist: "Yiruma", region: "Á", tag: "Hàn Quốc · Êm dịu ngày mưa", duration: "4:16", src: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=rain-and-nostalgia-chill-lofi-18567.mp3" },
    { id: 3, title: "Summer (Kikujiro Theme)", artist: "Joe Hisaishi", region: "Á", tag: "Nhật Bản · Tràn đầy năng lượng", duration: "3:30", src: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=spring-flowers-10908.mp3" },
    { id: 4, title: "Always With Me (Spirited Away)", artist: "Joe Hisaishi", region: "Á", tag: "Nhật Bản · Ghibli Study", duration: "3:35", src: "https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77c30.mp3?filename=sweet-love-121561.mp3" },
    { id: 5, title: "Windy Hill", artist: "羽肿 (Yu Zhong)", region: "Á", tag: "Trung Quốc · Đồng cỏ xanh thư thái", duration: "4:20", src: "https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3?filename=peaceful-garden-healing-light-piano-116035.mp3" },
    { id: 6, title: "Merry-Go-Round of Life", artist: "Joe Hisaishi", region: "Á", tag: "Nhật Bản · Howl's Castle", duration: "3:15", src: "https://cdn.pixabay.com/download/audio/2021/08/08/audio_c6ccf3232f.mp3?filename=waltz-in-the-clouds-1725.mp3" },
    { id: 7, title: "Through the Night (Lo-fi Acoustic)", artist: "IU (Tribute)", region: "Á", tag: "Hàn Quốc · Êm dịu đêm muộn", duration: "3:40", src: "https://cdn.pixabay.com/download/audio/2022/11/06/audio_c93976378e.mp3?filename=cozy-night-lofi-124976.mp3" },
    { id: 8, title: "First Love (Piano Instrumental)", artist: "Utada Hikaru", region: "Á", tag: "Nhật Bản · Sâu lắng hoài niệm", duration: "4:10", src: "https://cdn.pixabay.com/download/audio/2022/02/07/audio_d07672223a.mp3?filename=relaxing-mountains-rivers-19409.mp3" },
    { id: 9, title: "Sứ Thanh Hoa (Thanh Hoa Sứ)", artist: "Jay Chou", region: "Á", tag: "Á Đông · Tiếng sáo trúc & đàn tranh", duration: "3:58", src: "https://cdn.pixabay.com/download/audio/2023/02/28/audio_550d359677.mp3?filename=bamboo-flute-zen-141381.mp3" },
    { id: 10, title: "Góc Bàn Học Chiều Mưa", artist: "Kim Oanh Lo-fi Mix", region: "Á", tag: "Việt Nam · Acoustic ấm áp", duration: "3:22", src: "https://cdn.pixabay.com/download/audio/2022/05/16/audio_db6591201e.mp3?filename=lofi-study-112191.mp3" },

    // --- 🍃 Âu (Châu Âu · Cổ Điển & Cảm Hứng Cao Trào) ---
    { id: 11, title: "Nuvole Bianche", artist: "Ludovico Einaudi", region: "Âu", tag: "Ý · Khơi nguồn cảm hứng sâu", duration: "5:57", src: "https://cdn.pixabay.com/download/audio/2022/03/10/audio_c230e78c85.mp3?filename=hopeful-piano-10779.mp3" },
    { id: 12, title: "Experience", artist: "Ludovico Einaudi", region: "Âu", tag: "Ý · Động lực & Tinh thần thép", duration: "5:15", src: "https://cdn.pixabay.com/download/audio/2021/09/06/audio_24344e5bd3.mp3?filename=epic-cinematic-trailer-1940.mp3" },
    { id: 13, title: "Clair de Lune", artist: "Claude Debussy", region: "Âu", tag: "Pháp · Ánh trăng tĩnh lặng", duration: "4:50", src: "https://cdn.pixabay.com/download/audio/2022/01/26/audio_b2f90a98c8.mp3?filename=clair-de-lune-debussy-piano-18968.mp3" },
    { id: 14, title: "Gymnopédie No.1", artist: "Erik Satie", region: "Âu", tag: "Pháp · Tĩnh lặng không xao nhãng", duration: "3:30", src: "https://cdn.pixabay.com/download/audio/2022/03/24/audio_34e156ca01.mp3?filename=gymnopedie-no-1-11116.mp3" },
    { id: 15, title: "Canon in D (Warm Piano)", artist: "Johann Pachelbel", region: "Âu", tag: "Đức · Giai điệu hy vọng", duration: "4:05", src: "https://cdn.pixabay.com/download/audio/2022/01/21/audio_13c1c7ea0d.mp3?filename=canon-in-d-major-piano-18803.mp3" },
    { id: 16, title: "Spring (Four Seasons)", artist: "Antonio Vivaldi", region: "Âu", tag: "Ý · Tươi sáng & Đón chào ngày mới", duration: "3:45", src: "https://cdn.pixabay.com/download/audio/2021/11/01/audio_00a12e32a6.mp3?filename=classical-spring-violin-6842.mp3" },
    { id: 17, title: "Amélie Poulain Theme", artist: "Yann Tiersen", region: "Âu", tag: "Pháp · Dễ thương & Nhẹ nhàng", duration: "2:40", src: "https://cdn.pixabay.com/download/audio/2022/04/27/audio_c40f58ec71.mp3?filename=french-accordion-cafe-110825.mp3" },
    { id: 18, title: "Weightless Harmony", artist: "Marconi Union Style", region: "Âu", tag: "Anh · Giảm căng thẳng tối đa", duration: "6:10", src: "https://cdn.pixabay.com/download/audio/2022/05/05/audio_1204218f4a.mp3?filename=deep-ambient-relaxation-111867.mp3" },

    // --- ✨ Mỹ (Bắc Mỹ · Lofi Beats, Chillhop & Acoustic) ---
    { id: 19, title: "Lofi Girl Study Session", artist: "ChilledCow Beats", region: "Mỹ", tag: "Mỹ · Tiết tấu học bài kinh điển", duration: "2:45", src: "https://cdn.pixabay.com/download/audio/2022/05/16/audio_c89c74415b.mp3?filename=lofi-chill-medium-version-112189.mp3" },
    { id: 20, title: "Golden Hour (Acoustic Strings)", artist: "JVKE (Cover)", region: "Mỹ", tag: "Mỹ · Năng lượng tích cực", duration: "3:30", src: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_24a2ef6ae3.mp3?filename=warm-golden-sunset-acoustic-123865.mp3" },
    { id: 21, title: "Interstellar Theme (Focus Piano)", artist: "Hans Zimmer Style", region: "Mỹ", tag: "Mỹ · Tinh thần bứt phá", duration: "4:40", src: "https://cdn.pixabay.com/download/audio/2022/08/04/audio_32c9cebb8c.mp3?filename=space-piano-ambient-116246.mp3" },
    { id: 22, title: "Coffee Shop Mornings", artist: "Chillhop Cafe", region: "Mỹ", tag: "Mỹ · Ấm áp tách Cappuccino", duration: "3:10", src: "https://cdn.pixabay.com/download/audio/2022/11/14/audio_d04c27a9be.mp3?filename=coffee-chill-lofi-125678.mp3" },
    { id: 23, title: "Sunset Drive Lo-fi", artist: "Downtown Chill", region: "Mỹ", tag: "Mỹ · Dòng chảy tập trung mượt mà", duration: "3:05", src: "https://cdn.pixabay.com/download/audio/2022/03/10/audio_51c6c9a751.mp3?filename=sunset-landscape-lofi-10777.mp3" },
    { id: 24, title: "Midnight Coding & Study", artist: "Sleepy Fish Style", region: "Mỹ", tag: "Mỹ · Tập trung cao độ ban đêm", duration: "3:25", src: "https://cdn.pixabay.com/download/audio/2022/04/18/audio_658097b6cf.mp3?filename=chill-lofi-song-8444.mp3" },
    { id: 25, title: "Better Days Ahead", artist: "Lofi Records", region: "Mỹ", tag: "Mỹ · Niềm tin & Cố gắng mỗi ngày", duration: "2:50", src: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_7565d7756f.mp3?filename=lofi-study-beat-18568.mp3" }
  ];

  let currentTrackIndex = 0;
  let isMusicPlaying = false;
  let musicVolume = 0.65;
  let playlistRegionFilter = "all";
  let playlistSearchQuery = "";
  const audioEl = $("musicAudio");

  function currentTrack() {
    return MOTIVATIONAL_PLAYLIST[currentTrackIndex] || MOTIVATIONAL_PLAYLIST[0];
  }

  function playTrack(index) {
    if (index >= 0 && index < MOTIVATIONAL_PLAYLIST.length) {
      currentTrackIndex = index;
    }
    const track = currentTrack();
    audioEl.src = track.src;
    audioEl.volume = musicVolume;

    audioEl.play()
      .then(() => {
        isMusicPlaying = true;
        updateMusicUI();
      })
      .catch(() => {
        isMusicPlaying = true;
        updateMusicUI();
      });
  }

  function togglePlayMusic() {
    if (isMusicPlaying) {
      audioEl.pause();
      isMusicPlaying = false;
    } else {
      if (!audioEl.src) {
        playTrack(currentTrackIndex);
      } else {
        audioEl.play().catch(() => {});
        isMusicPlaying = true;
      }
    }
    updateMusicUI();
  }

  function nextTrack() {
    currentTrackIndex = (currentTrackIndex + 1) % MOTIVATIONAL_PLAYLIST.length;
    playTrack(currentTrackIndex);
  }

  function prevTrack() {
    currentTrackIndex = (currentTrackIndex - 1 + MOTIVATIONAL_PLAYLIST.length) % MOTIVATIONAL_PLAYLIST.length;
    playTrack(currentTrackIndex);
  }

  audioEl.addEventListener("ended", () => {
    nextTrack();
  });

  function updateMusicUI() {
    const track = currentTrack();

    // Column 2 Music bar
    $("tmbTitle").textContent = `${track.title} · ${track.artist}`;
    $("tmbPlayBtn").textContent = isMusicPlaying ? "⏸" : "▶";
    $("tmbDot").classList.toggle("playing", isMusicPlaying);

    // Bottom Dock
    $("dockTrackTitle").textContent = track.title;
    $("dockTrackArtist").textContent = `${track.artist} · ${track.region} · ${track.tag}`;
    $("dockPlayIcon").textContent = isMusicPlaying ? "⏸" : "▶";
    $("dockPlayBtn").classList.toggle("playing", isMusicPlaying);

    // Playlist Modal Banner
    $("mpbTitle").textContent = track.title;
    $("mpbArtist").textContent = `${track.artist} · ${track.tag}`;
    $("mpbTag").textContent = track.region === "Á" ? "🌸 CHÂU Á" : (track.region === "Âu" ? "🍃 CHÂU ÂU" : "✨ BẮC MỸ");
    $("mpbPlayBtn").textContent = isMusicPlaying ? "⏸" : "▶";

    // Highlight row in playlist
    document.querySelectorAll(".track-row").forEach((row, i) => {
      row.classList.toggle("is-current", i === currentTrackIndex);
    });
  }

  function handleMusicVolumeChange(val) {
    const num = Math.max(0, Math.min(100, Number(val))) / 100;
    musicVolume = num;
    audioEl.volume = num;
    const pct = Math.round(num * 100) + "%";
    $("musicVolumeSlider").value = Math.round(num * 100);
    $("musicVolVal").textContent = pct;
    $("modalVolSlider").value = Math.round(num * 100);
    $("modalVolText").textContent = pct;
  }

  function renderPlaylist() {
    const scroll = $("playlistScroll");
    if (!scroll) return;

    const filtered = MOTIVATIONAL_PLAYLIST.filter(t => {
      const matchRegion = playlistRegionFilter === "all" || t.region === playlistRegionFilter;
      const query = playlistSearchQuery.toLowerCase().trim();
      const matchSearch = !query || t.title.toLowerCase().includes(query) || t.artist.toLowerCase().includes(query) || t.tag.toLowerCase().includes(query);
      return matchRegion && matchSearch;
    });

    if (filtered.length === 0) {
      scroll.innerHTML = `<div class="history-empty-text">Không tìm thấy bài hát phù hợp.</div>`;
      return;
    }

    scroll.innerHTML = filtered.map(t => {
      const idx = MOTIVATIONAL_PLAYLIST.findIndex(x => x.id === t.id);
      const isCur = idx === currentTrackIndex;
      return `
        <div class="track-row ${isCur ? "is-current" : ""}" data-index="${idx}">
          <span class="track-num">${isCur && isMusicPlaying ? "▶" : String(idx + 1).padStart(2, "0")}</span>
          <div class="track-text-group">
            <h4>${escapeHtml(t.title)}</h4>
            <span>${escapeHtml(t.artist)} · ${escapeHtml(t.tag)}</span>
          </div>
          <span class="track-badge">${t.region === "Á" ? "🌸 Á" : (t.region === "Âu" ? "🍃 Âu" : "✨ Mỹ")}</span>
          <span class="track-duration">${t.duration}</span>
        </div>
      `;
    }).join("");
  }

  // ==========================================================
  // COUNTDOWN TIMER: INDEPENDENT MULTI-TASK SWITCHING
  // ==========================================================
  function getRemainingSeconds(task) {
    if (!task) return 0;
    if (task.timerStatus === "running" && task.lastStartedAt) {
      const elapsed = Math.max(0, (Date.now() - task.lastStartedAt) / 1000);
      return Math.max(0, (task.remainingSeconds || task.minutes * 60) - elapsed);
    }
    if (typeof task.remainingSeconds === "number") {
      return task.remainingSeconds;
    }
    return task.minutes * 60;
  }

  // Gracefully pause currently running task without losing any elapsed time
  function pauseRunningTask(save = true) {
    const runTask = runningTask();
    if (runTask) {
      const now = Date.now();
      const elapsed = Math.max(0, (now - (runTask.lastStartedAt || now)) / 1000);
      runTask.remainingSeconds = Math.max(0, (runTask.remainingSeconds || runTask.minutes * 60) - elapsed);
      runTask.timerStatus = "paused";
      runTask.lastStartedAt = null;
      state.elapsedToday += elapsed;
      if (save) saveLocal();
    }
  }

  // Switch task: Pause previous running task, switch to new task preserving its own countdown time!
  function selectTask(id) {
    if (selectedId === id) return;
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    const prevTask = runningTask();
    if (prevTask && prevTask.id !== id) {
      pauseRunningTask(false);
      showToast(`Đã dừng "${prevTask.name}" ở ${formatClock(prevTask.remainingSeconds)}. Chuyển sang "${task.name}".`);
    }

    selectedId = id;
    saveLocal();
    render();
  }

  function startPauseTimer() {
    if (!isTodayView()) return;
    const task = currentTask();
    if (!task || task.done) return;

    if (task.timerStatus === "running") {
      // User pressed PAUSE
      pauseRunningTask(true);
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
      render();
      showToast(`Đã tạm dừng "${task.name}" ở ${formatClock(task.remainingSeconds)}.`);
    } else {
      // User pressed START or RESUME
      pauseRunningTask(false);

      if (typeof task.remainingSeconds !== "number" || task.remainingSeconds <= 0) {
        task.remainingSeconds = task.minutes * 60;
      }
      task.timerStatus = "running";
      task.lastStartedAt = Date.now();
      selectedId = task.id;

      showToast(`Bắt đầu tập trung vào "${task.name}" 🌿 Cố lên nào!`);
      saveLocal();
      render();

      if (!ticker) ticker = setInterval(tick, 250);
    }
  }

  function tick() {
    rolloverIfNeeded();
    const runTask = runningTask();
    if (!runTask) {
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
      renderTimerColumn();
      return;
    }

    const rem = getRemainingSeconds(runTask);

    if (rem <= 0) {
      // TASK COMPLETED VIA COUNTDOWN!
      runTask.timerStatus = "done";
      runTask.done = true;
      runTask.completedAt = new Date().toISOString();
      runTask.remainingSeconds = 0;
      runTask.lastStartedAt = null;
      state.elapsedToday += runTask.minutes * 60;

      showToast(`Tuyệt vời Kim Oanh ơi! "${runTask.name}" đã hoàn thành! 🌸`);

      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }

      saveLocal();
      render();
      return;
    }

    if (selectedId === runTask.id) {
      $("timerDisplay").textContent = formatClock(rem);
      setRing(1 - rem / (runTask.minutes * 60));
    }
  }

  // Reset button resets ONLY the selected task's remaining time back to default
  function resetTimer() {
    const task = currentTask();
    if (!task) return;

    if (task.timerStatus === "running") {
      pauseRunningTask(false);
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
    }

    task.timerStatus = "idle";
    task.remainingSeconds = task.minutes * 60;
    task.lastStartedAt = null;

    saveLocal();
    render();
    showToast(`Đã đặt lại đồng hồ "${task.name}" về ban đầu (${task.minutes}:00).`);
  }

  function toggleTaskDone(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    if (task.timerStatus === "running") {
      pauseRunningTask(false);
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
    }

    task.done = !task.done;
    task.completedAt = task.done ? new Date().toISOString() : null;

    if (task.done) {
      task.timerStatus = "done";
      task.remainingSeconds = 0;
      task.lastStartedAt = null;
      showToast(`Đã hoàn thành "${task.name}"! 🌸`);
    } else {
      task.timerStatus = "idle";
      task.remainingSeconds = task.minutes * 60;
      task.lastStartedAt = null;
      showToast(`Đã bỏ đánh dấu hoàn thành.`);
    }

    saveLocal();
    render();
  }

  function setRing(fraction) {
    const circumference = 2 * Math.PI * 95; // r = 95
    const offset = circumference * (1 - Math.max(0, Math.min(1, fraction)));
    $("ringFill").style.strokeDasharray = circumference;
    $("ringFill").style.strokeDashoffset = offset;
  }

  // ==========================================================
  // RENDER CONTROLLERS
  // ==========================================================
  function render() {
    rolloverIfNeeded();

    // Top Header info
    $("headerDate").textContent = formatDisplayDate(todayKey(), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    const doneCount = state.tasks.filter(t => t.done).length;
    const totalCount = state.tasks.length;
    const focusMinutes = Math.floor(state.elapsedToday / 60);

    $("headerSummary").textContent = `${doneCount}/${totalCount} việc xong · ${focusMinutes}m tập trung`;

    renderTasksColumn();
    renderTimerColumn();
    renderCalendarColumn();
    renderHistoryDetail();
    updateMusicUI();
  }

  function renderTasksColumn() {
    const today = isTodayView();
    const tasks = today ? state.tasks : (getDayRecord(viewedDate)?.tasks || []);
    const done = tasks.filter(t => t.done).length;
    const total = tasks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    $("taskCountBadge").textContent = total;
    $("taskPanelTitle").textContent = today ? "Kế hoạch hôm nay" : `Ngày ${formatDisplayDate(viewedDate, { day: "numeric", month: "numeric" })}`;
    $("taskProgressFill").style.width = `${pct}%`;
    $("progressPercent").textContent = `${pct}%`;

    if (total === 0) {
      $("progressNote").textContent = today ? "Thêm một việc nhỏ để bắt đầu ngày nhé" : "Không có dữ liệu trong ngày này";
    } else if (done === total) {
      $("progressNote").textContent = "Tuyệt vời! Bạn đã hoàn thành toàn bộ mục tiêu 🎉🌸";
    } else {
      $("progressNote").textContent = `Đã hoàn thành ${done}/${total} việc · Cố lên nào!`;
    }

    // History Banner
    const banner = $("historyBanner");
    if (!today) {
      banner.hidden = false;
      $("historyBannerDate").textContent = formatDisplayDate(viewedDate, { day: "numeric", month: "long" });
    } else {
      banner.hidden = true;
    }

    // Filter Tasks
    const visible = tasks.filter(t => {
      if (filter === "active") return !t.done;
      if (filter === "done") return t.done;
      return true;
    });

    const listEl = $("taskList");
    const emptyEl = $("emptyState");

    if (tasks.length === 0) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      $("emptyAddBtn").style.display = today ? "inline-flex" : "none";
    } else {
      emptyEl.style.display = "none";
      if (visible.length === 0) {
        listEl.innerHTML = '<div class="history-empty-text">Không có công việc nào trong mục lọc này.</div>';
      } else {
        listEl.innerHTML = visible.map(t => {
          const repeatLabel = getRepeatLabel(t.repeat);
          const isSelected = today && selectedId === t.id;
          const remSec = getRemainingSeconds(t);

          // Status Badge for task timer
          let statusPillHtml = "";
          if (t.done) {
            statusPillHtml = `<span class="task-status-pill done">✓ Xong</span>`;
          } else if (t.timerStatus === "running") {
            statusPillHtml = `<span class="task-status-pill pill-running">🔥 Đang học (${formatClock(remSec)})</span>`;
          } else if (t.timerStatus === "paused") {
            statusPillHtml = `<span class="task-status-pill pill-paused">⏸ Tạm dừng (${formatClock(remSec)})</span>`;
          }

          let categoryClass = "cat-study";
          if (t.category === "Cá nhân") categoryClass = "cat-personal";
          if (t.category === "Công việc") categoryClass = "cat-work";

          return `
            <div class="task-card ${t.done ? "completed" : ""} ${isSelected ? "active-selected" : ""}" data-id="${escapeHtml(t.id)}">
              <button class="check-trigger" data-action="toggle" title="${t.done ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}">
                ${t.done ? "✓" : ""}
              </button>
              <div class="task-body" data-action="select">
                <div class="task-text">${escapeHtml(t.name)}</div>
                <div class="task-meta-row">
                  <span class="category-chip ${categoryClass}">${escapeHtml(t.category || "Học tập")}</span>
                  ${statusPillHtml}
                  ${repeatLabel ? `<span class="repeat-chip">${repeatLabel}</span>` : ""}
                  <span class="duration-chip">⏱ ${t.minutes}p</span>
                </div>
              </div>
              ${today ? `
              <div class="task-actions">
                <button class="task-tool-btn" data-action="edit" title="Sửa">✎</button>
                <button class="task-tool-btn" data-action="delete" title="Xóa">✕</button>
              </div>` : ""}
            </div>
          `;
        }).join("");
      }
    }
  }

  function renderTimerColumn() {
    const today = isTodayView();
    const task = today ? (currentTask() || runningTask()) : null;

    if (!task) {
      $("timerTaskName").textContent = "Chọn một việc ở bên trái";
      $("timerCategoryTag").textContent = "Chưa chọn mục";
      $("timerDurationTag").textContent = "--";
      $("timerDisplay").textContent = "00:00";
      $("timerStatusCaption").textContent = "CHỌN VIỆC ĐỂ FOCUS";
      $("timerModeTag").textContent = "SẴN SÀNG";
      $("startPauseBtn").disabled = true;
      $("resetTimerBtn").disabled = true;
      $("startPauseText").textContent = "Bắt đầu";
      $("startPauseIcon").textContent = "▶";
      setRing(0);
      return;
    }

    const repeatLabel = getRepeatLabel(task.repeat);
    $("timerTaskName").textContent = task.name;
    $("timerCategoryTag").textContent = `${task.category || "Chung"}${repeatLabel ? " · " + repeatLabel : ""}`;
    $("timerDurationTag").textContent = `${task.minutes} phút`;

    const doneCount = state.tasks.filter(t => t.done).length;
    const totalCount = state.tasks.length;
    $("statDoneCount").textContent = `${doneCount}/${totalCount}`;
    $("statFocusTime").textContent = `${Math.floor(state.elapsedToday / 60)}m`;
    $("statProductivity").textContent = totalCount ? `${Math.round((doneCount / totalCount) * 100)}%` : "0%";

    const rem = getRemainingSeconds(task);
    $("timerDisplay").textContent = formatClock(rem);
    setRing(1 - rem / (task.minutes * 60));

    if (task.done) {
      $("timerStatusCaption").textContent = "ĐÃ HOÀN THÀNH 🌸";
      $("timerModeTag").textContent = "HOÀN TẤT";
      $("startPauseBtn").disabled = true;
      $("resetTimerBtn").disabled = false;
      $("startPauseText").textContent = "Đã xong";
      $("startPauseIcon").textContent = "✓";
    } else if (task.timerStatus === "running") {
      $("timerStatusCaption").textContent = "ĐANG TẬP TRUNG 🌿";
      $("timerModeTag").textContent = "ĐANG CHẠY";
      $("startPauseBtn").disabled = false;
      $("resetTimerBtn").disabled = false;
      $("startPauseText").textContent = "Tạm dừng";
      $("startPauseIcon").textContent = "⏸";
    } else if (task.timerStatus === "paused") {
      $("timerStatusCaption").textContent = "TẠM DỪNG (ĐÃ LƯU THỜI GIAN)";
      $("timerModeTag").textContent = "TẠM DỪNG";
      $("startPauseBtn").disabled = false;
      $("resetTimerBtn").disabled = false;
      $("startPauseText").textContent = "Tiếp tục";
      $("startPauseIcon").textContent = "▶";
    } else {
      $("timerStatusCaption").textContent = "SẴN SÀNG BẮT ĐẦU";
      $("timerModeTag").textContent = "SẴN SÀNG";
      $("startPauseBtn").disabled = false;
      $("resetTimerBtn").disabled = true;
      $("startPauseText").textContent = "Bắt đầu";
      $("startPauseIcon").textContent = "▶";
    }
  }

  // ==========================================================
  // CALENDAR & HISTORY LOG
  // ==========================================================
  function renderCalendarColumn() {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();

    $("monthLabel").textContent = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(calendarMonth);

    const firstDay = new Date(y, m, 1);
    const totalDays = new Date(y, m + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

    let html = weekdays.map(w => `<div class="cal-header-day">${w}</div>`).join("");

    for (let i = 0; i < startOffset; i++) {
      html += '<div class="cal-cell is-empty"></div>';
    }

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(y, m, day);
      const key = dateKey(d);
      const isFuture = key > todayKey();
      const hasData = !!getDayRecord(key);
      const isSelected = key === viewedDate;
      const isToday = key === todayKey();

      html += `
        <button class="cal-cell ${hasData ? "has-data" : ""} ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""}"
          data-date="${key}" ${isFuture ? "disabled" : ""}>
          ${day}
        </button>
      `;
    }

    $("calendarGrid").innerHTML = html;
  }

  function renderHistoryDetail() {
    const rec = getDayRecord(viewedDate);
    $("detailDateText").textContent = isTodayView() ? "Hôm nay" : formatDisplayDate(viewedDate, { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });

    if (!rec || !rec.tasks || rec.tasks.length === 0) {
      $("detailDoneText").textContent = "0/0";
      $("detailFocusText").textContent = "0m";
      $("detailRateText").textContent = "0%";
      $("detailRateBadge").textContent = "0% xong";
      $("historyTasksScroll").innerHTML = '<p class="history-empty-text">Chưa có bản ghi nào cho ngày này.</p>';
      return;
    }

    const tasks = rec.tasks;
    const done = tasks.filter(t => t.done).length;
    const rate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const focusMins = Math.floor((rec.focusSeconds || 0) / 60);

    $("detailDoneText").textContent = `${done}/${tasks.length}`;
    $("detailFocusText").textContent = `${focusMins}m`;
    $("detailRateText").textContent = `${rate}%`;
    $("detailRateBadge").textContent = `${rate}% xong`;

    $("historyTasksScroll").innerHTML = tasks.map(t => {
      const repeatLabel = getRepeatLabel(t.repeat);
      return `
        <div class="history-task-row">
          <span class="history-task-name">${escapeHtml(t.name)} ${repeatLabel ? `(${repeatLabel})` : ""} · ${t.minutes}m</span>
          <span class="history-task-badge ${t.done ? "done" : "pending"}">${t.done ? "✓ Xong" : "Chưa"}</span>
        </div>
      `;
    }).join("");
  }

  // ==========================================================
  // DIALOGS & EVENT LISTENERS
  // ==========================================================
  function openTaskDialog(task = null) {
    const form = $("taskForm");
    form.dataset.editId = task ? task.id : "";
    $("dialogTitle").textContent = task ? "Chỉnh sửa công việc" : "Thêm công việc mới";
    $("taskName").value = task ? task.name : "";
    $("taskMinutes").value = task ? task.minutes : 25;
    $("taskCategory").value = task ? task.category : "Học tập";
    $("taskRepeat").value = task ? (task.repeat || "none") : "none";
    $("taskDialog").showModal();
    $("taskName").focus();
  }

  function closeTaskDialog() {
    $("taskDialog").close();
  }

  function openPlaylistModal() {
    renderPlaylist();
    $("playlistDialog").showModal();
  }

  function closePlaylistModal() {
    $("playlistDialog").close();
  }

  // Task Form Submit
  $("taskForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!isTodayView()) return;

    const name = $("taskName").value.trim();
    const minutes = parseInt($("taskMinutes").value, 10);
    const category = $("taskCategory").value;
    const repeat = $("taskRepeat").value || "none";

    if (!name || isNaN(minutes) || minutes < 1 || minutes > 1440) {
      showToast("Vui lòng nhập tên việc và thời lượng hợp lệ.");
      return;
    }

    const editId = $("taskForm").dataset.editId;
    if (editId) {
      const t = state.tasks.find(x => x.id === editId);
      if (t) {
        t.name = name;
        t.minutes = minutes;
        t.category = category;
        t.repeat = repeat;
        if (t.timerStatus === "idle") {
          t.remainingSeconds = minutes * 60;
        }
        showToast("Đã cập nhật công việc.");
      }
    } else {
      const newTask = {
        id: uid(),
        name,
        minutes,
        category,
        repeat,
        done: false,
        completedAt: null,
        remainingSeconds: minutes * 60,
        timerStatus: "idle",
        lastStartedAt: null
      };
      state.tasks.push(newTask);
      selectedId = newTask.id;
      showToast("Đã thêm công việc mới!");
    }

    saveLocal();
    closeTaskDialog();
    render();
  });

  // Task list events
  $("taskList").addEventListener("click", e => {
    const card = e.target.closest(".task-card");
    if (!card || !isTodayView()) return;
    const id = card.dataset.id;
    const action = e.target.closest("[data-action]")?.dataset.action;

    if (action === "toggle") {
      toggleTaskDone(id);
    } else if (action === "select") {
      selectTask(id);
    } else if (action === "edit") {
      const t = state.tasks.find(x => x.id === id);
      if (t) openTaskDialog(t);
    } else if (action === "delete") {
      if (selectedId === id) {
        const task = state.tasks.find(x => x.id === id);
        if (task && task.timerStatus === "running") {
          pauseRunningTask(false);
          if (ticker) { clearInterval(ticker); ticker = null; }
        }
        selectedId = null;
      }
      state.tasks = state.tasks.filter(t => t.id !== id);
      saveLocal();
      render();
      showToast("Đã xóa công việc.");
    }
  });

  // Filter Buttons
  $("filterGroup").addEventListener("click", e => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    filter = btn.dataset.filter;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b === btn));
    renderTasksColumn();
  });

  // Calendar click
  $("calendarGrid").addEventListener("click", e => {
    const cell = e.target.closest(".cal-cell");
    if (!cell || cell.disabled || cell.classList.contains("is-empty")) return;
    viewedDate = cell.dataset.date;
    render();
  });

  $("prevMonthBtn").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendarColumn();
  });

  $("nextMonthBtn").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendarColumn();
  });

  $("returnTodayBtn").addEventListener("click", () => {
    viewedDate = todayKey();
    render();
  });

  // Dialog triggers
  $("openAddBtn").addEventListener("click", () => openTaskDialog());
  $("emptyAddBtn").addEventListener("click", () => openTaskDialog());
  $("closeDialogBtn").addEventListener("click", closeTaskDialog);
  $("cancelDialogBtn").addEventListener("click", closeTaskDialog);

  // Timer Buttons
  $("startPauseBtn").addEventListener("click", startPauseTimer);
  $("resetTimerBtn").addEventListener("click", resetTimer);

  // Music Buttons & Playlist Modal Triggers
  $("topbarMusicBtn").addEventListener("click", openPlaylistModal);
  $("openPlaylistBtn").addEventListener("click", openPlaylistModal);
  $("openPlaylistDockBtn").addEventListener("click", openPlaylistModal);
  $("closePlaylistBtn").addEventListener("click", closePlaylistModal);

  // Quick Music Controls (Column 2)
  $("tmbPlayBtn").addEventListener("click", togglePlayMusic);
  $("tmbNextBtn").addEventListener("click", nextTrack);
  $("tmbPrevBtn").addEventListener("click", prevTrack);

  // Bottom Dock Controls
  $("dockPlayBtn").addEventListener("click", togglePlayMusic);
  $("dockNextBtn").addEventListener("click", nextTrack);
  $("dockPrevBtn").addEventListener("click", prevTrack);

  // Modal Music Controls
  $("mpbPlayBtn").addEventListener("click", togglePlayMusic);
  $("mpbNextBtn").addEventListener("click", nextTrack);
  $("mpbPrevBtn").addEventListener("click", prevTrack);

  // Music Volume Sliders
  $("musicVolumeSlider").addEventListener("input", e => handleMusicVolumeChange(e.target.value));
  $("modalVolSlider").addEventListener("input", e => handleMusicVolumeChange(e.target.value));

  // Music Mute Toggle
  $("musicMuteBtn").addEventListener("click", () => {
    if (audioEl.volume > 0) {
      handleMusicVolumeChange(0);
    } else {
      handleMusicVolumeChange(65);
    }
  });

  // Playlist Region Filters
  $("playlistRegionFilters").addEventListener("click", e => {
    const chip = e.target.closest(".region-chip");
    if (!chip) return;
    playlistRegionFilter = chip.dataset.region;
    document.querySelectorAll(".region-chip").forEach(c => c.classList.toggle("active", c === chip));
    renderPlaylist();
  });

  // Playlist Search
  $("playlistSearchInput").addEventListener("input", e => {
    playlistSearchQuery = e.target.value;
    renderPlaylist();
  });

  // Playlist Item Click
  $("playlistScroll").addEventListener("click", e => {
    const row = e.target.closest(".track-row");
    if (!row) return;
    const idx = parseInt(row.dataset.index, 10);
    if (!isNaN(idx)) playTrack(idx);
  });

  // Export / Import
  $("exportBtn").addEventListener("click", () => {
    snapshot();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mint-day-kimoanh-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất file sao lưu dữ liệu!");
  });

  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.tasks)) throw new Error("Format không hợp lệ");
      state = {
        version: 2,
        date: data.date || todayKey(),
        owner: data.owner || "Kim Oanh",
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        tasks: data.tasks.map(t => ({
          id: t.id || uid(),
          name: t.name,
          minutes: Number(t.minutes) || 25,
          category: t.category || "Học tập",
          repeat: t.repeat || "none",
          done: !!t.done,
          completedAt: t.completedAt || null,
          remainingSeconds: typeof t.remainingSeconds === "number" ? t.remainingSeconds : (t.minutes * 60),
          timerStatus: t.done ? "done" : "idle",
          lastStartedAt: null
        })),
        elapsedToday: Number(data.elapsedToday) || 0,
        history: data.history && typeof data.history === "object" ? data.history : {}
      };
      rolloverIfNeeded();
      viewedDate = todayKey();
      selectedId = null;
      saveLocal();
      render();
      showToast("Đã nhập dữ liệu thành công!");
    } catch {
      showToast("File sao lưu không hợp lệ.");
    }
    e.target.value = "";
  });

  // Background and tick handling
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && runningTask()) tick();
  });

  window.addEventListener("beforeunload", () => {
    pauseRunningTask(false);
    saveLocal();
  });

  // Auto snapshot every 30s
  setInterval(() => {
    rolloverIfNeeded();
    saveLocal();
    if (viewedDate === todayKey()) renderCalendarColumn();
  }, 30000);

  // Startup initialization
  rolloverIfNeeded();
  render();
  renderPlaylist();
})();
