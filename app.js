"use strict";

/* ---------- Shortcuts ---------- */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const chat       = $("#chat");
const progressEl = $("#progress");
const aiBadge    = $("#aiIndicator");
const inputEl    = $("#userInput");
const btnAsk     = $("#btnAsk");

/* ---------- UI helpers ---------- */
function append(who, txt, cls="ai"){
  const el = document.createElement("div");
  el.className = `msg ${cls}`;
  el.textContent = `${who}: ${txt}`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}
function clearChat(){ chat.innerHTML = ""; }
function toggleTheme(){ document.body.classList.toggle("dark"); }

/* ---------- Memory / Markov ---------- */
let sentences = [];
let markov = new Map();
const TARGET = 10000;

function updateBar(txt){
  if(typeof txt === "string"){ progressEl.textContent = txt; return; }
  const chars = sentences.join(" ").length;
  progressEl.textContent = Math.min(100, Math.round(chars / TARGET * 100)) + " %";
}

function saveLocal(){ localStorage.setItem("hb.sentences", JSON.stringify(sentences)); }
function loadLocal(){
  try{
    const arr = JSON.parse(localStorage.getItem("hb.sentences") || "[]");
    if(Array.isArray(arr)) sentences = arr;
  }catch{}
  rebuildMarkov(); updateBar();
}
loadLocal();

const splitSent  = t => t.split(/[.!?\r?\n]+/).map(s=>s.trim()).filter(Boolean);
const splitWords = s => s.toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);

function trainFromText(){
  const txt = $("#textInput").value.trim();
  if(!txt) return;
  const parts = splitSent(txt);
  if(!parts.length) return;
  sentences.push(...parts);
  rebuildMarkov(); updateBar(); saveLocal();
  append("Система", `Обучено: ${parts.length} предложений`, "sys");
}
async function trainFromURL(){
  const url = $("#urlInput").value.trim();
  if(!url) return;
  try{
    append("Система","Качаю текст…","sys");
    const r = await fetch(url);
    const t = await r.text();
    const n = splitSent(t);
    sentences.push(...n);
    rebuildMarkov(); updateBar(); saveLocal();
    append("Система", `Обучено: ${n.length} предложений`, "sys");
  }catch(e){
    append("Система","Не удалось скачать","err");
  }
}

function rebuildMarkov(){
  markov.clear();
  for(const s of sentences){
    const w = splitWords(s);
    for(let i=0;i<w.length-1;i++){
      if(!markov.has(w[i])) markov.set(w[i], []);
      markov.get(w[i]).push(w[i+1]);
    }
  }
}
function genMarkov(seed,max=60){
  const keys = [...markov.keys()];
  let w = seed || (keys.length? keys[Math.floor(Math.random()*keys.length)] : "");
  if(!w) return "";
  const out=[];
  for(let i=0;i<max;i++){
    out.push(w);
    const arr = markov.get(w);
    if(!arr || !arr.length) break;
    w = arr[Math.floor(Math.random()*arr.length)];
  }
  return out[0].charAt(0).toUpperCase()+out.join(" ").slice(1)+".";
}

/* ---------- Templates ---------- */
const templates = [
  {
    p:/создать vhdx (?<size>\d+(?:gb|mb)) в (?<path>.+)/i,
    f:({size,path})=>`# VHDX
$vhd = "${path.replace(/\\$/,'')}\\VirtualFleshDrive.vhdx"
New-VHD -Path $vhd -SizeBytes ${size.toUpperCase()} -Dynamic
Mount-VHD -Path $vhd`
  },
  {
    p:/зашифровать диск (?<letter>[a-z]):?\s*с ключом в (?<keyPath>.+)/i,
    f:({letter,keyPath})=>`Enable-BitLocker -MountPoint "${letter.toUpperCase()}:\" -RecoveryKeyPath "${keyPath}" -EncryptionMethod XtsAes256`
  },
  { p:/показать процессы/i, f:()=>'Get-Process | Sort-Object CPU -Descending | Select -First 20' }
];

/* ---------- GPT-2 ---------- */
let gpt = null;
async function loadGPT2(){
  if(gpt) return gpt;
  aiBadge.classList.remove("d-none");
  aiBadge.textContent = "GPT-2: loading…";

  window.transformers = window.transformers || {};
  window.transformers.env = window.transformers.env || {};
  window.transformers.env.allowLocalModels = false;

  const { pipeline } = window.transformers;
  gpt = await pipeline("text-generation","Xenova/distilgpt2",{
    progress_callback:d=>{
      if(d.status==="progress" && d.total){
        updateBar(`Модель: ${Math.round(d.loaded/d.total*100)} %`);
      }
    }
  });

  aiBadge.textContent = "GPT-2";
  updateBar();
  return gpt;
}

/* ---------- Ask ---------- */
async function ask(){
  const q = inputEl.value.trim();
  if(!q) return;
  inputEl.value = "";
  append("Ты", q, "you");

  // 1. Templates
  for(const t of templates){
    const m = q.match(t.p);
    if(m){
      aiBadge.classList.remove("d-none");
      aiBadge.textContent = "TEMPLATE";
      append("ИИ", t.f(m.groups||{}), "ai");
      return;
    }
  }

  // 2. GPT-2
  try{
    const pipe = await loadGPT2();
    aiBadge.classList.remove("d-none");
    aiBadge.textContent = "GPT-2";
    const out = await pipe(q,{
      max_new_tokens: 160,
      temperature: 0.9,
      top_p: 0.95,
      repetition_penalty: 1.15
    });
    let txt = out[0].generated_text;
    if(txt.startsWith(q)) txt = txt.slice(q.length).trimStart();
    append("ИИ", txt || "(пусто)", "ai");
    return;
  }catch(e){
    console.error(e);
    append("Система","GPT-2 не доступна, fallback → Markov","sys");
  }

  // 3. Markov fallback
  aiBadge.classList.remove("d-none");
  aiBadge.textContent = "MARKOV";
  const seed = splitWords(q)[0];
  append("ИИ", genMarkov(seed) || "Обучи меня текстом.", "ai");
}

/* ---------- Analysis / Export ---------- */
function showAnalysis(){
  const freq = new Map();
  sentences.forEach(s=>splitWords(s).forEach(w=>{
    freq.set(w,(freq.get(w)||0)+1);
  }));
  const top = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,50)
               .map(([w,c])=>`${w} — ${c}`).join("\n");
  alert(`Всего предложений: ${sentences.length}\nТоп слов:\n${top}`);
}
function exportData(){
  const blob = new Blob([JSON.stringify(sentences)],{type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hyper-bot-data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(e){
  const f = e.target.files[0]; if(!f) return;
  f.text().then(t=>{
    try{
      const arr = JSON.parse(t);
      if(Array.isArray(arr)){
        sentences = arr; rebuildMarkov(); updateBar(); saveLocal();
        append("Система","База загружена","sys");
      }else alert("Неверный формат");
    }catch{ alert("Ошибка файла"); }
  });
}
function clearMemory(){
  if(confirm("Точно очистить память?")){
    sentences = []; markov.clear(); saveLocal(); updateBar(); append("Система","Память очищена","sys");
  }
}

/* ---------- Bottom panel drag ---------- */
(function(){
  const panel  = $("#consolePanel");
  const handle = $("#consoleHandle");
  if(!panel || !handle) return;

  let startY=0,startH=0,isDrag=false,lastTap=0;

  const setH = h=>{
    const max = window.innerHeight;
    const min = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--console-h-min'))||120;
    h = Math.min(max, Math.max(min, h));
    document.documentElement.style.setProperty('--console-h', h + 'px');
  };

  handle.addEventListener('pointerdown', e=>{
    isDrag=true; startY=e.clientY; startH=panel.offsetHeight;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e=>{
    if(!isDrag) return;
    const dy = startY - e.clientY;
    setH(startH + dy);
  });
  handle.addEventListener('pointerup', e=>{
    isDrag=false; handle.releasePointerCapture(e.pointerId);
  });

  handle.addEventListener('click', ()=>{
    const now = Date.now();
    if(now - lastTap < 300){
      const curH = panel.offsetHeight;
      if(curH < window.innerHeight*0.9) setH(window.innerHeight);
      else setH(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--console-h-min'))||120);
    }
    lastTap = now;
  });

  window.addEventListener('resize', ()=>{
    const curH = panel.offsetHeight;
    if(curH > window.innerHeight) setH(window.innerHeight);
  });
})();

/* ---------- Bindings ---------- */
btnAsk.addEventListener("click", ask);
inputEl.addEventListener("keydown", e=>{
  if(e.key==="Enter" && e.ctrlKey){ e.preventDefault(); ask(); }
});

/* expose for menu */
Object.assign(window,{
  trainFromText, trainFromURL, showAnalysis,
  exportData, importData, clearMemory,
  clearChat, ask, toggleTheme
});

/* first render */
updateBar();
