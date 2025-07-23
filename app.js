import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.15.0/dist/transformers.min.js";

const $ = (sel) => document.querySelector(sel);
const logEl = $("#log");
const progBar = $("#progress-bar");
const progLabel = $("#progress-label");
const consoleBox = $("#console");
const grip = $("#console-grip");

let pipe = null;
let memory = [];
let isDark = true;

function log(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
function setProgress(p) {
  const pct = Math.min(100, Math.max(0, Math.floor(p)));
  progBar.style.width = pct + "%";
  progLabel.textContent = pct + "%";
}
function saveFile(name, dataStr) {
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function toggleTheme() {
  isDark = !isDark;
  document.documentElement.classList.toggle('light', !isDark);
}

async function loadModel() {
  const modelName = $("#model-select").value;
  log(`🔄 Загружаю модель: ${modelName} ...`);
  setProgress(0);

  pipe = await pipeline("text-generation", modelName, {
    progress_callback: (p) => {
      if (p && p.total) {
        setProgress((p.loaded / p.total) * 100);
      }
      if (p.status) log(`[dl] ${p.status}: ${p.file || ''} (${p.loaded}/${p.total})`);
    }
  });

  setProgress(100);
  log("✅ Модель загружена");
}

async function onGenerate() {
  if (!pipe) await loadModel();

  const prompt = $("#input").value.trim();
  if (!prompt) return log("⚠ Введи текст для генерации.");

  const maxTokens = +$("#max-tokens").value || 128;
  const temperature = +$("#temperature").value || 0.7;

  log(`🧠 Генерация... (max_tokens=${maxTokens}, temp=${temperature})`);
  try {
    const out = await pipe(prompt, {
      max_new_tokens: maxTokens,
      temperature
    });
    const text = Array.isArray(out) ? out[0].generated_text : out.generated_text;
    log(`ИИ: ${text}`);
  } catch (e) {
    console.error(e);
    log("❌ Ошибка генерации", e);
  }
}

function onTrainText() {
  const txt = prompt("Вставь обучающий текст:");
  if (!txt) return;
  memory.push({ type: "text", data: txt, ts: Date.now() });
  log(`📥 Текст добавлен в память (${txt.length} симв.)`);
}

async function onTrainURL() {
  const url = prompt("Вставь URL:");
  if (!url) return;
  log(`🌐 Скачиваю ${url}...`);
  try {
    const res = await fetch(url);
    const t = await res.text();
    memory.push({ type: "url", url, data: t, ts: Date.now() });
    log(`📥 Контент с ${url} добавлен (${t.length} симв.)`);
  } catch (e) {
    log("❌ Не удалось получить URL", e);
  }
}

function onSaveMemory() {
  if (!memory.length) return log("⚠ Память пуста");
  saveFile("memory.json", JSON.stringify(memory, null, 2));
  log("💾 Память выгружена -> memory.json");
}

function onReset() {
  memory = [];
  logEl.textContent = "";
  setProgress(0);
  pipe = null;
  log("♻ Сброс: модель выгружена, память очищена.");
}
function onClearLog() { logEl.textContent = ""; }

// Drag console
(function initDrag() {
  let startY = 0;
  let startHeight = 0;
  let dragging = false;

  const down = (e) => {
    dragging = true;
    startY = e.clientY || e.touches?.[0]?.clientY;
    startHeight = consoleBox.offsetHeight;
    e.preventDefault();
  };
  const move = (e) => {
    if (!dragging) return;
    const y = e.clientY || e.touches?.[0]?.clientY;
    const diff = startY - y;
    let newH = startHeight + diff;
    newH = Math.min(window.innerHeight - 56, Math.max(80, newH));
    consoleBox.style.height = newH + "px";
  };
  const up = () => { dragging = false; };

  grip.addEventListener("mousedown", down);
  grip.addEventListener("touchstart", down, { passive: false });
  window.addEventListener("mousemove", move);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
})();

grip.addEventListener("dblclick", () => {
  consoleBox.classList.toggle("fullscreen");
});

$("#btn-generate").addEventListener("click", onGenerate);
$("#btn-train-text").addEventListener("click", onTrainText);
$("#btn-train-url").addEventListener("click", onTrainURL);
$("#btn-save-mem").addEventListener("click", onSaveMemory);
$("#btn-reset").addEventListener("click", onReset);
$("#btn-theme").addEventListener("click", toggleTheme);
$("#btn-clear-log").addEventListener("click", onClearLog);
$("#model-select").addEventListener("change", () => {
  pipe = null;
  setProgress(0);
  log("🔁 Модель будет перезагружена при следующей генерации.");
});

log("Привет! Старый дизайн возвращён. Жми «Сгенерировать» или обучи память.");
