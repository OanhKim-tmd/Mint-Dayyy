/**
 * Mint Day · Kim Oanh — Daily Planner & Focus Hub
 * Designed for single-screen zero-scroll productivity & personal local persistence.
 * Features:
 *  - 100% reliable LocalStorage data persistence (no loss on refresh/restart)
 *  - Independent multi-task countdown timer (switch & pause without losing time)
 *  - Pure, minimal audio: start chime & countdown completion chime only
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
  // WEB AUDIO SYNTHESIZER: START & COUNTDOWN FINISH CHIMES ONLY
  // ==========================================================
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Âm thanh khi ấn bắt đầu (Start Chime: 2 nốt ấm áp vươn lên D5 -> A5)
  function playStartSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = 0.20;

      const notes = [
        { f: 587.33, t: 0.00, dur: 0.8 }, // D5
        { f: 880.00, t: 0.12, dur: 1.0 }  // A5
      ];

      notes.forEach(n => {
        const osc = ctx.createOscillator();
        const harmonic = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(n.f, now + n.t);

        harmonic.type = "triangle";
        harmonic.frequency.setValueAtTime(n.f * 2, now + n.t);

        gain.gain.setValueAtTime(0.0001, now + n.t);
        gain.gain.linearRampToValueAtTime(vol, now + n.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.dur);

        osc.connect(gain);
        harmonic.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + n.t);
        harmonic.start(now + n.t);
        osc.stop(now + n.t + n.dur + 0.05);
        harmonic.stop(now + n.t + n.dur + 0.05);
      });
    } catch {
      // Audio autoplay policy fallback
    }
  }

  // Âm thanh khi kết thúc đếm ngược chạy (Finish Chime: 4 nốt chuông ngân C5 -> E5 -> G5 -> C6)
  function playFinishSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = 0.22;

      const chord = [
        { f: 523.25, t: 0.00, dur: 1.3 }, // C5
        { f: 659.25, t: 0.13, dur: 1.4 }, // E5
        { f: 783.99, t: 0.26, dur: 1.6 }, // G5
        { f: 1046.50, t: 0.39, dur: 2.2 } // C6
      ];

      chord.forEach(n => {
        const osc = ctx.createOscillator();
        const harmonic = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(n.f, now + n.t);

        harmonic.type = "triangle";
        harmonic.frequency.setValueAtTime(n.f * 2, now + n.t);

        gain.gain.setValueAtTime(0.0001, now + n.t);
        gain.gain.linearRampToValueAtTime(vol, now + n.t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.dur);

        osc.connect(gain);
        harmonic.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + n.t);
        harmonic.start(now + n.t);
        osc.stop(now + n.t + n.dur + 0.05);
        harmonic.stop(now + n.t + n.dur + 0.05);
      });
    } catch {
      // Audio autoplay policy fallback
    }
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
      playStartSound();
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
      playFinishSound();
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
})();
