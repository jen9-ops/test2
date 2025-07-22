/* =========================================================
   Hyper-Bot  •  app.js  (2025-07-22)
   — добавлена массовая загрузка пар «вопрос - ответ»
     в модальном окне «Обучить текстом»
   ========================================================= */

/* ══════  UI HELPERS  ══════ */
function toggleTheme(){ document.body.classList.toggle('dark'); }

const chat    = document.getElementById('chat');
const aiBadge = document.getElementById('aiIndicator');

const append = (from, text, cls) => {
  const d = document.createElement('div');
  d.className = `msg ${cls}`;
  d.textContent = `${from}: ${text}`;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
};
const clearChat = () => { chat.innerHTML = ''; };

/* ══════  TEMPLATES  ══════ */
const templates = [
  { p:/создать vhdx (?<size>\d+(?:gb|mb)) в (?<path>.+)/i,
    f:({size,path})=>`# VHDX\n$vhd = "${path}\\VirtualDisk.vhdx"\nNew-VHD -Path $vhd -SizeBytes ${size.toUpperCase()} -Dynamic\nMount-VHD -Path $vhd` },
  { p:/зашифровать диск (?<letter>[a-z]): с ключом в (?<keyPath>.+)/i,
    f:({letter,keyPath})=>`Enable-BitLocker -MountPoint "${letter.toUpperCase()}:" -RecoveryKeyPath "${keyPath}" -EncryptionMethod XtsAes256` },
  { p:/показать процессы/i,            f:()=>'Get-Process | Sort-Object CPU -desc | Select -First 25' },
  { p:/убить процесс (?<name>\S+)/i,   f:({name})=>`Stop-Process -Name "${name}" -Force` }
];
const tmpl = q => {
  for(const t of templates){ const m=q.match(t.p); if(m) return t.f(m.groups||{}); }
  return null;
};

/* ══════  MEMORY  ══════ */
let knowledge = JSON.parse(localStorage.getItem('knowledgeBase')||'[]');
let corpus    = JSON.parse(localStorage.getItem('corpus')      ||'[]');
const save = () => {
  localStorage.setItem('knowledgeBase', JSON.stringify(knowledge));
  localStorage.setItem('corpus',        JSON.stringify(corpus));
};

/* ══════  PROGRESS  ══════ */
const TARGET = 100_000;                       // 100 % ≈ 100 k предложений
const bar    = document.getElementById('progress');
const updateBar = () => {
  const pct = Math.min(100, Math.round(corpus.length / TARGET * 100));
  bar.textContent = pct + ' %';
};
updateBar();

/* ══════  mini-GPT-2  ══════ */
let gpt=null;
async function loadModel(){
  if(gpt) return;
  const {pipeline} = window.transformers;
  gpt = await pipeline('text-generation','Xenova/gpt2-small',{quantized:true});
}
async function genPS(prompt){
  await loadModel();
  const out = await gpt(prompt+'\n```powershell\n',{max_new_tokens:120,temperature:.3,stop:['```']});
  return out[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();
}

/* ══════  TRAINING  ══════ */
const stopW = new Set('и в во не что он на я ...'.split(' '));
const splitSentences = t => t.split(/[.!?\r?\n]+/).map(s=>s.trim()).filter(Boolean);

/* === NEW: bulk “вопрос - ответ” support === */
function trainFromText(){
  const raw = document.getElementById('textInput').value.trim();
  if(!raw) return alert('Текст?');

  const lines = raw.split(/\r?\n+/);

  let pairs = 0, single = 0;

  lines.forEach(line=>{
    const parts = line.split(' - ');
    if(parts.length === 2){
      const [q,a] = parts.map(s=>s.trim());
      if(q && a){
        knowledge.push({request:q.toLowerCase(),answer:a});
        pairs++;
      }
    }else{
      const sent = line.trim();
      if(sent){
        corpus.push(sent);
        single++;
      }
    }
  });

  save(); updateBar();
  append('ИИ',`Загружено: пар ${pairs}, одиночных предложений ${single}`,'bot');
  document.getElementById('textInput').value='';
}

/* === URL training unchanged === */
async function trainFromURL(){
  const url = document.getElementById('urlInput').value.trim();
  if(!url) return alert('URL?');
  try{
    const data = await (await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url))).json();
    const text = [...new DOMParser().parseFromString(data.contents,'text/html').querySelectorAll('p')].map(p=>p.textContent.trim()).join(' ');
    const s = splitSentences(text);
    s.forEach(x=>{ knowledge.push({request:x.toLowerCase(),answer:x}); corpus.push(x); });
    save(); updateBar();
    append('ИИ',`С URL обучено: ${s.length}`,'bot');
    document.getElementById('urlInput').value='';
  }catch{ alert('Не удалось загрузить URL'); }
}

/* ══════  ANALYSIS  ══════ */
function analysis(){
  if(!corpus.length) return 'Корпус пуст!';
  let total=0,freq={};
  corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u).forEach(w=>{
    if(!w || stopW.has(w)) return; total++; freq[w]=(freq[w]||0)+1;
  }));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return `Всего предложений: ${corpus.length}\nСредняя длина: ${avg}\nТоп-10 слов: ${top}`;
}
function showAnalysis(){ append('ИИ',analysis(),'bot'); }

/* ══════  BACKUP / RESET  ══════ */
function exportData(){
  const blob = new Blob([JSON.stringify({knowledge,corpus})],{type:'application/json'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'bot-memory.json'}).click();
}
function importData(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(Array.isArray(d.knowledge)&&Array.isArray(d.corpus)){
        knowledge=d.knowledge; corpus=d.corpus; save(); updateBar();
        append('ИИ','Память восстановлена!','bot');
      }
    }catch{ alert('Некорректный файл'); }
  };
  r.readAsText(f);
}
function clearMemory(){
  if(!confirm('Удалить все знания?')) return;
  knowledge=[]; corpus=[]; localStorage.clear(); updateBar(); clearChat();
  append('ИИ','Память очищена полностью','bot');
}

/* ══════  CHAT ENGINE  ══════ */
function sim(a,b){
  const w1=a.split(/\s+/), w2=b.split(/\s+/);
  return w1.filter(x=>w2.includes(x)).length / Math.max(w1.length,w2.length);
}
function kbMatch(q){
  let best=null,score=0;
  knowledge.forEach(e=>{
    const s=sim(q,e.request);
    if(s>score){score=s; best=e;}
  });
  return score>0.35 ? best.answer : null;
}

async function ask(){
  const ta=document.getElementById('userInput'), q=ta.value.trim();
  if(!q) return;
  ta.value=''; append('Ты',q,'user');

  /* анализ */
  if(/^анализ/i.test(q)){ append('ИИ',analysis(),'bot'); return; }

  /* inline learning (одиночная пара) */
  if(q.includes(' - ')){
    const [req,ans] = q.split(' - ').map(s=>s.trim());
    if(req && ans){
      knowledge.push({request:req.toLowerCase(),answer:ans});
      save(); updateBar(); append('ИИ','Запомнил!','bot');
    }
    return;
  }

  /* шаблоны / KB */
  let ans = tmpl(q.toLowerCase()) || kbMatch(q.toLowerCase());
  if(!ans){
    /* GPT-2 с бегущими точками */
    const wait = append('ИИ','ИИ: генерирую','bot');
    aiBadge.classList.remove('d-none');
    let dots=0;
    const spin=setInterval(()=>{ dots=(dots+1)%4; wait.textContent='ИИ: генерирую'+'.'.repeat(dots); },300);
    ans = await genPS(`Напиши PowerShell-скрипт: ${q}`);
    clearInterval(spin);
    aiBadge.classList.add('d-none');
    wait.textContent = 'ИИ: ' + (ans || '🤷 Не удалось сгенерировать');
    return;
  }
  append('ИИ',ans,'bot');
}

/* ══════  expose  ══════ */
Object.assign(window,{
  trainFromText, trainFromURL, showAnalysis,
  exportData, importData, clearMemory,
  clearChat, ask, toggleTheme
});

/* Ctrl+Enter → send */
document.getElementById('userInput')
  .addEventListener('keydown', e=>{
    if(e.key==='Enter' && e.ctrlKey){ e.preventDefault(); ask(); }
});
