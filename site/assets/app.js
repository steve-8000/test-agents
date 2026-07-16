/* Saegim 프로토타입 공통 JS: 테마 + 스텝 플레이어 */

/* ---------- 테마 ---------- */
const THEME_KEY = "saegim-theme";

function preferredTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncThemeControls(theme) {
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    const icon = btn.querySelector(".ph");
    const label = btn.querySelector("span");
    if (icon) icon.className = theme === "dark" ? "ph ph-moon-stars" : "ph ph-sun";
    if (label) label.textContent = theme === "dark" ? "다크" : "라이트";
  });
  const saved = localStorage.getItem(THEME_KEY);
  const mode = saved === "light" || saved === "dark" ? saved : "system";
  document.querySelectorAll("[data-theme-seg] button").forEach((b) => {
    b.classList.toggle("on", b.dataset.mode === mode);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  syncThemeControls(theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "light" || saved === "dark" ? saved : preferredTheme());
}

function setThemeMode(mode) {
  if (mode === "system") {
    localStorage.removeItem(THEME_KEY);
    applyTheme(preferredTheme());
  } else {
    localStorage.setItem(THEME_KEY, mode);
    applyTheme(mode);
  }
}

function toggleTheme() {
  setThemeMode(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

initTheme();

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".theme-toggle").forEach((btn) => btn.addEventListener("click", toggleTheme));
  document.querySelectorAll("[data-theme-seg] button").forEach((b) =>
    b.addEventListener("click", () => setThemeMode(b.dataset.mode))
  );
});

/* ---------- 스텝 플레이어 ----------
   페이지에서 window.STEPS = [{ title, note }] 선언 후 initSteps() 호출.
   현재 스텝 n은 <body data-step="n">에 반영되고,
   data-show="0,2,3" 요소는 해당 스텝에서만 표시된다.
   스텝 전환 시 'stepchange' 커스텀 이벤트(detail.step) 발행. */

function renderStep(n) {
  const steps = window.STEPS || [];
  const clamped = Math.max(0, Math.min(n, steps.length - 1));
  document.body.dataset.step = String(clamped);

  document.querySelectorAll("[data-show]").forEach((el) => {
    const visible = el.dataset.show.split(",").map((s) => s.trim()).includes(String(clamped));
    el.classList.toggle("step-on", visible);
  });

  const list = document.querySelector(".step-list");
  if (list) {
    list.querySelectorAll("li").forEach((li, i) => li.classList.toggle("active", i === clamped));
    const active = list.querySelector("li.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  const prev = document.querySelector("[data-step-prev]");
  const next = document.querySelector("[data-step-next]");
  if (prev) prev.disabled = clamped === 0;
  if (next) next.disabled = clamped === steps.length - 1;

  document.dispatchEvent(new CustomEvent("stepchange", { detail: { step: clamped } }));
}

function initSteps() {
  const steps = window.STEPS || [];
  if (!steps.length) return;

  const list = document.querySelector(".step-list");
  if (list) {
    list.innerHTML = "";
    steps.forEach((s, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="no">${i + 1}</span><span><strong>${s.title}</strong>${s.note || ""}</span>`;
      li.addEventListener("click", () => renderStep(i));
      list.appendChild(li);
    });
  }

  const prev = document.querySelector("[data-step-prev]");
  const next = document.querySelector("[data-step-next]");
  const cur = () => Number(document.body.dataset.step || 0);
  if (prev) prev.addEventListener("click", () => renderStep(cur() - 1));
  if (next) next.addEventListener("click", () => renderStep(cur() + 1));

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") renderStep(cur() + 1);
    if (e.key === "ArrowLeft") renderStep(cur() - 1);
  });

  renderStep(0);
}

document.addEventListener("DOMContentLoaded", initSteps);

/* ---------- 액센트 (5종 픽커) ---------- */
const ACCENT_KEY = "saegim-accent";
const ACCENTS = ["rose", "coral", "amber", "sage", "ocean"];

function applyAccent(name) {
  const a = ACCENTS.includes(name) ? name : "rose";
  document.documentElement.dataset.accent = a;
  document.querySelectorAll(".swatch-btn").forEach((btn) => {
    const on = btn.dataset.pick === a;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function initAccent() {
  applyAccent(localStorage.getItem(ACCENT_KEY) || "rose");
}

function setAccent(name) {
  localStorage.setItem(ACCENT_KEY, name);
  applyAccent(name);
}

initAccent();

/* ---------- 원페이지 앱: 뷰 / 시트 전환 ---------- */
function showView(id) {
  const app = document.querySelector(".app");
  if (!app) return;
  app.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + id));
  closeSheet();
  const screen = app.querySelector(".screen");
  if (screen) screen.scrollTop = 0;
}

function openSheet(id) {
  const s = document.getElementById("sheet-" + id);
  if (s) s.classList.add("open");
}

function closeSheet() {
  document.querySelectorAll(".app .sheet-scrim.open").forEach((s) => s.classList.remove("open"));
}

function bindGrabberDrag(grabber) {
  const sheet = grabber.closest(".sheet");
  if (!sheet) return;
  let startY = null;
  grabber.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    sheet.style.transition = "none";
    grabber.setPointerCapture(e.pointerId);
  });
  grabber.addEventListener("pointermove", (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = "translateY(" + dy + "px)";
  });
  const end = (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (dy > 60) closeSheet();
    startY = null;
  };
  grabber.addEventListener("pointerup", end);
  grabber.addEventListener("pointercancel", end);
}

function initApp() {
  const app = document.querySelector(".app");
  if (!app) return;

  document.querySelectorAll("[data-show-view]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); showView(el.dataset.showView); })
  );
  document.querySelectorAll("[data-open-sheet]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); openSheet(el.dataset.openSheet); })
  );
  document.querySelectorAll("[data-close-sheet]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); closeSheet(); })
  );

  // 스크림 탭으로 닫기 (시트 본문 클릭은 제외)
  app.querySelectorAll(".sheet-scrim").forEach((scrim) =>
    scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSheet(); })
  );
  // 그래버 드래그로 닫기
  app.querySelectorAll(".sheet .grabber").forEach(bindGrabberDrag);

  // 액센트 픽커 (셸 + 설정 공용)
  document.querySelectorAll(".swatch-btn").forEach((btn) =>
    btn.addEventListener("click", () => setAccent(btn.dataset.pick))
  );
  applyAccent(document.documentElement.dataset.accent || "rose");

  // 스위치 토글 (마스터는 하위 그룹 활성/비활성 동반)
  app.querySelectorAll(".switch").forEach((sw) =>
    sw.addEventListener("click", () => {
      if (sw.hasAttribute("data-master")) {
        const card = sw.closest("[data-smart]");
        const on = sw.classList.toggle("on");
        if (card) card.classList.toggle("smart-on", on);
      } else {
        sw.classList.toggle("on");
      }
    })
  );

  // 온보딩 내부 단계
  const obSteps = Array.from(app.querySelectorAll(".ob-step"));
  app.querySelectorAll("[data-ob-next]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const cur = obSteps.findIndex((s) => s.classList.contains("active"));
      const next = obSteps[cur + 1];
      if (next) { obSteps[cur].classList.remove("active"); next.classList.add("active"); }
    })
  );

  // 완료 시트 저장 → 대상 투두 완료 처리 후 홈 유지
  const completeSave = document.getElementById("completeSave");
  if (completeSave) completeSave.addEventListener("click", () => {
    const target = document.getElementById("todoGrocery");
    if (target) {
      target.classList.add("done");
      const box = target.querySelector(".checkbox");
      if (box) { box.classList.add("checked"); box.innerHTML = '<i class="ph ph-check"></i>'; }
    }
    closeSheet();
  });

  syncThemeControls(document.documentElement.dataset.theme);
}

document.addEventListener("DOMContentLoaded", initApp);
