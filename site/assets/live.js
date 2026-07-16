/* Saegim 라이브 앱 컨트롤러 — 실제 백엔드(api.saegim.one PocketBase) 연결.
   app.js(테마/액센트/뷰·시트 전환)와 parser.js(컴포즈 파서) 위에서 동작한다.
   목업 없음: 모든 데이터는 PocketBase items 컬렉션에서 온다. */
(function () {
  "use strict";

  var PB_URL = "https://api.saegim.one";
  var pb = new PocketBase(PB_URL);
  var CATEGORY_KO = { appointment: "약속", exercise: "운동", daily: "일상", record: "기록",
                      family: "가족", work: "일", chore: "집안일", uncategorized: "" };
  var SEOUL = { lat: 37.5665, lon: 126.9780 };

  var state = { items: [], composeParsed: null, completeTarget: null, authMode: "login" };

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function timeStr(d) { d = new Date(d); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function isSameDay(a, b) { a = new Date(a); b = new Date(b); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  // ---------- auth ----------
  function renderAuthMode() {
    var login = state.authMode === "login";
    var t = $("#auth-title"); if (t) t.textContent = login ? "로그인" : "가입하기";
    var s = $("#auth-submit"); if (s) s.textContent = login ? "로그인" : "가입하고 시작";
    var sw = $("#auth-switch"); if (sw) sw.textContent = login ? "계정이 없나요? 가입" : "이미 계정이 있나요? 로그인";
    var err = $("#auth-err"); if (err) err.textContent = "";
  }
  async function submitAuth() {
    var email = ($("#auth-email") || {}).value, pw = ($("#auth-pw") || {}).value, err = $("#auth-err");
    if (err) err.textContent = "";
    if (!email || !pw) { if (err) err.textContent = "이메일과 비밀번호를 입력하세요."; return; }
    try {
      if (state.authMode === "signup") {
        await pb.collection("users").create({ email: email, password: pw, passwordConfirm: pw });
      }
      await pb.collection("users").authWithPassword(email, pw);
      await enterApp();
    } catch (e) {
      if (err) err.textContent = (state.authMode === "signup" ? "가입 실패: " : "로그인 실패: ") +
        (e && e.message ? e.message : "다시 시도하세요.");
    }
  }
  function logout() { pb.authStore.clear(); location.reload(); }

  // ---------- data ----------
  async function reload() {
    try { state.items = await pb.collection("items").getFullList({ sort: "-created" }); }
    catch (e) { state.items = []; }
    renderHome(); renderStory();
  }
  function itemStart(it) { return it.startAt ? new Date(it.startAt) : null; }

  async function createFromCompose() {
    var input = $("#cmp-input"); if (!input) return;
    var text = (input.value != null ? input.value : input.textContent || "").trim();
    if (!text) return;
    var p = SaegimParser.parse(text, new Date());
    var body = {
      owner: pb.authStore.model.id, kind: p.suggestedKind,
      title: p.title || text, rawInputText: text, category: p.category || "uncategorized",
      rawJSON: { recurrenceRule: p.recurrenceRule || null, spans: p.spans }
    };
    if (p.resolvedStartAt) body.startAt = new Date(p.resolvedStartAt).toISOString();
    try { await pb.collection("items").create(body); } catch (e) { /* ignore, keep UX */ }
    if (input.value != null) input.value = ""; else input.textContent = "";
    closeSheet(); await reload();
  }

  async function toggleComplete(item, done) {
    try { await pb.collection("items").update(item.id, { completedAt: done ? new Date().toISOString() : null }); }
    catch (e) {}
    await reload();
  }

  // ---------- render: home ----------
  function renderHome() {
    var now = new Date();
    var dl = $("#home-date"); if (dl) dl.textContent = (now.getMonth() + 1) + "월 " + now.getDate() + "일 " + ["일", "월", "화", "수", "목", "금", "토"][now.getDay()] + "요일";
    renderWeekStrip(now);

    var routines = state.items.filter(function (i) { return i.kind === "routine"; });
    var schedules = state.items.filter(function (i) { return i.kind === "schedule" && !i.completedAt; })
      .sort(function (a, b) { return (itemStart(a) || Infinity) - (itemStart(b) || Infinity); });
    var todos = state.items.filter(function (i) { return i.kind === "todo" && !i.completedAt; });

    fillSection("routines", routines, renderRoutine);
    fillSection("schedules", schedules, renderSchedule);
    fillSection("todos", todos, renderTodo);

    var empty = $("#home-empty");
    if (empty) empty.style.display = (routines.length + schedules.length + todos.length === 0) ? "" : "none";
  }
  function fillSection(name, arr, renderer) {
    var sec = $("#sec-" + name), box = $("#home-" + name);
    if (!box) return;
    box.innerHTML = "";
    if (sec) sec.style.display = arr.length ? "" : "none";
    arr.forEach(function (it) { box.appendChild(renderer(it)); });
  }
  function renderRoutine(it) {
    var chip = el("div", "routine-chip");
    chip.innerHTML = '<span class="ring"><svg viewBox="0 0 52 52"><circle class="track" r="23" cx="26" cy="26"></circle><circle class="p1" r="23" cx="26" cy="26" stroke-dasharray="110 144.5"></circle></svg></span>' +
      '<div><div class="r-name">' + esc(it.title) + '</div><div class="r-streak">' + esc(catLabel(it) || "루틴") + '</div></div>';
    return chip;
  }
  function renderSchedule(it) {
    var wrap = el("div", "tl-item");
    var t = itemStart(it);
    wrap.innerHTML = '<div class="tl-time">' + (t ? timeStr(t) : "--:--") + '</div>';
    var card = el("div", "tl-card");
    card.innerHTML = '<div class="tl-title">' + esc(it.title) + '</div>' +
      '<div class="tl-sub">' + esc(catLabel(it) || "일정") + '</div>' +
      '<div class="tl-foot"><span class="detail-hint">상세 <i class="ph ph-caret-right"></i></span></div>';
    card.addEventListener("click", function () { openEvent(it); });
    wrap.appendChild(card);
    return wrap;
  }
  function renderTodo(it) {
    var row = el("div", "row");
    var box = el("span", "checkbox todo-check", '<i class="ph ph-check"></i>');
    box.addEventListener("click", function () { openComplete(it); });
    row.appendChild(box);
    row.appendChild(el("div", "row-main", '<div class="row-title">' + esc(it.title) + '</div>' +
      (catLabel(it) ? '<div class="row-sub">' + esc(catLabel(it)) + '</div>' : "")));
    return row;
  }
  function catLabel(it) { return CATEGORY_KO[it.category] || ""; }

  function renderWeekStrip(now) {
    var box = $("#week-strip"); if (!box) return;
    box.innerHTML = "";
    var day = now.getDay(); // 0=Sun
    var monday = new Date(now); monday.setDate(now.getDate() - ((day + 6) % 7)); monday.setHours(0, 0, 0, 0);
    var names = ["월", "화", "수", "목", "금", "토", "일"];
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday); d.setDate(monday.getDate() + i);
      var isToday = isSameDay(d, now);
      var has = state.items.some(function (it) { var s = itemStart(it); return s && isSameDay(s, d); });
      var cell = el("div", "day" + (isToday ? " today" : "") + (has ? " has-events" : ""));
      cell.innerHTML = "<span>" + names[i] + "</span><span class='num'>" + d.getDate() + "</span><span class='dot'></span>";
      box.appendChild(cell);
    }
  }

  // ---------- compose ----------
  function bindCompose() {
    var input = $("#cmp-input"); if (!input) return;
    function update() {
      var text = (input.value != null ? input.value : input.textContent || "");
      var p = SaegimParser.parse(text, new Date());
      state.composeParsed = p;
      var kindEl = $("#cmp-kind");
      if (kindEl) kindEl.textContent = text.trim() ? ({ todo: "투두", schedule: "스케줄", routine: "루틴" }[p.suggestedKind]) + "로 분류됨" : "무엇이든 적어보세요";
      var hl = $("#cmp-highlight");
      if (hl) hl.innerHTML = renderHighlight(text, p.spans);
    }
    input.addEventListener("input", update);
    update();
  }
  function renderHighlight(text, spans) {
    if (!text) return '<span class="ph-muted">예: 내일 오후 8시 성수 카페에서 저녁</span>';
    var sorted = spans.slice().sort(function (a, b) { return a.start - b.start; });
    var out = "", cur = 0;
    sorted.forEach(function (s) {
      if (s.start < cur) return;
      out += esc(text.slice(cur, s.start));
      var cls = s.kind === "person" ? "tk person" : s.kind === "place" ? "tk place" : s.kind === "recurrence" ? "tk recur" : "tk";
      out += '<span class="' + cls + '">' + esc(text.slice(s.start, s.end)) + "</span>";
      cur = s.end;
    });
    out += esc(text.slice(cur));
    return out;
  }

  // ---------- complete sheet ----------
  function openComplete(item) {
    state.completeTarget = item;
    var sub = $("#complete-sub"); if (sub) sub.textContent = item.title + " · 완료";
    var memo = $("#complete-memo"); if (memo) memo.value = "";
    openSheet("complete");
  }
  async function saveComplete() {
    if (state.completeTarget) await toggleComplete(state.completeTarget, true);
    state.completeTarget = null; closeSheet();
  }

  // ---------- event detail ----------
  async function openEvent(item) {
    var t = itemStart(item);
    var title = $("#event-title"); if (title) title.textContent = item.title;
    var sub = $("#event-sub"); if (sub) sub.textContent = t ? (t.getMonth() + 1) + "월 " + t.getDate() + "일 " + timeStr(t) : "시간 미정";
    var w = $("#event-weather"); if (w) w.textContent = "날씨 불러오는 중…";
    openSheet("event");
    try {
      var r = await fetch("https://weather.clab.one/v1/forecast/hourly?lat=" + SEOUL.lat + "&lon=" + SEOUL.lon,
        { signal: AbortSignal.timeout(6000) });
      var j = await r.json();
      var h = j.series && j.series[0];
      if (w && h) w.textContent = Math.round(h.temperatureC) + "°C · 강수 " + Math.round((h.precipitationProbability || 0) * 100) + "%";
      else if (w) w.textContent = "날씨 정보 없음";
    } catch (e) { if (w) w.textContent = "날씨를 가져오지 못했어요"; }
  }

  // ---------- story ----------
  function renderStory() {
    var now = new Date();
    var sd = $("#story-date"); if (sd) sd.innerHTML = (now.getMonth() + 1) + "월 " + now.getDate() + "일 <span class='story-dow'>" + ["일", "월", "화", "수", "목", "금", "토"][now.getDay()] + "요일</span>";
    var done = state.items.filter(function (i) { return i.completedAt && isSameDay(i.completedAt, now); });
    var sum = $("#story-summary"); if (sum) sum.innerHTML = '<span class="badge neutral">완료 ' + done.length + "</span>";
    var box = $("#story-timeline"); if (!box) return;
    box.innerHTML = "";
    var empty = $("#story-empty");
    if (empty) empty.style.display = done.length ? "none" : "";
    done.sort(function (a, b) { return new Date(a.completedAt) - new Date(b.completedAt); }).forEach(function (it) {
      var item = el("div", "tl-item");
      item.innerHTML = '<div class="tl-time">' + timeStr(it.completedAt) + '</div>' +
        '<div class="tl-card"><div class="tl-head"><div class="tl-title">' + esc(it.title) + '</div>' +
        '<div class="tl-badges"><span class="badge neutral">' + esc(catLabel(it) || "기록") + '</span>' +
        '<i class="ph ph-check-circle moment-check"></i></div></div></div>';
      box.appendChild(item);
    });
  }

  // ---------- share ----------
  async function createShare() {
    var now = new Date();
    var done = state.items.filter(function (i) { return i.completedAt && isSameDay(i.completedAt, now); });
    try {
      await pb.collection("shares").create({
        kind: "story", title: (now.getMonth() + 1) + "월 " + now.getDate() + "일의 기록",
        subtitle: "완료 " + done.length, shareAlias: "", locationName: ""
      });
      var note = $("#share-status"); if (note) note.textContent = "공유 카드가 생성되었어요.";
    } catch (e) { var n2 = $("#share-status"); if (n2) n2.textContent = "공유 생성 실패: " + (e.message || ""); }
  }

  // ---------- boot ----------
  async function enterApp() {
    var em = $("#settings-email");
    if (em && pb.authStore.model) em.textContent = pb.authStore.model.email || "로그인됨";
    showView("home");
    await reload();
  }
  function bindOnce() {
    var s = $("#auth-submit"); if (s) s.addEventListener("click", submitAuth);
    var sw = $("#auth-switch"); if (sw) sw.addEventListener("click", function () { state.authMode = state.authMode === "login" ? "signup" : "login"; renderAuthMode(); });
    var pwf = $("#auth-pw"); if (pwf) pwf.addEventListener("keydown", function (e) { if (e.key === "Enter") submitAuth(); });
    var lo = $("#logout-btn"); if (lo) lo.addEventListener("click", logout);
    var cs = $("#cmp-submit"); if (cs) cs.addEventListener("click", createFromCompose);
    var cps = $("#complete-save"); if (cps) cps.addEventListener("click", saveComplete);
    var shc = $("#share-create"); if (shc) shc.addEventListener("click", createShare);
    bindCompose();
    renderAuthMode();
  }
  async function boot() {
    bindOnce();
    if (pb.authStore.isValid) {
      // refresh token / model, then enter
      try { await pb.collection("users").authRefresh(); } catch (e) { pb.authStore.clear(); }
    }
    if (pb.authStore.isValid) { await enterApp(); }
    else {
      var onboarded = localStorage.getItem("saegim-onboarded") === "1";
      showView(onboarded ? "auth" : "onboarding");
    }
  }
  // 온보딩 완료 -> 인증 화면으로
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-ob-complete]");
    if (t) { localStorage.setItem("saegim-onboarded", "1"); setTimeout(function () { if (!pb.authStore.isValid) showView("auth"); }, 0); }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
