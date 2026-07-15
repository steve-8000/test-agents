/* Saegim 프로토타입 공통 JS: 테마 + 스텝 플레이어 */

/* ---------- 테마 ---------- */
const THEME_KEY = "saegim-theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    const icon = btn.querySelector(".ph");
    const label = btn.querySelector("span");
    if (icon) icon.className = theme === "dark" ? "ph ph-moon-stars" : "ph ph-sun";
    if (label) label.textContent = theme === "dark" ? "다크" : "라이트";
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(saved || preferred);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

initTheme();

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", toggleTheme);
  });
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
