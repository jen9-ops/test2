/* =========================================================
   Hyper-Bot • app.js • локальная версия
   ---------------------------------------------------------
   • Использует локальный  transformers.min.js
     (лежит рядом с index.html)
   • DistilGPT-2  (≈45 MB, быстрее чем gpt2-small)
   • Таймаут инференса 30 s
   • Массовое обучение “вопрос - ответ”
   ========================================================= */

/* ---------- DOM helpers ---------- */
function toggleTheme(){ document.body.classList.toggle('dark'); }

const chat    = document.getElementById('chat');
const aiBadge = document.getElementById('aiIndicator');

const append = (who,txt,cls)=>{
  const d=document.createElement('div');
  d.className=`msg ${cls}`; d.textContent=`${who}: ${txt}`;
  chat.appendChild(d); chat.scrollTop=chat.scrollHeight;
  return d;
};
const clearChat=()=>{chat.innerHTML='';};

/* ---------- PowerShell templates ---------- */
const templates=[
  {p:/создать vhdx (?<size>\d+(?:gb|mb)) в (?<path>.+)/i,
   f:({size,path})=>`# VHDX\n$vhd="${path}\\VirtualDisk.vhdx"\nNew-VHD -Path $vhd -SizeBytes ${size.toUpperCase()} -Dynamic\nMount-VHD -Path $vhd`},
  {p:/зашифровать диск (?<letter>[a-z]): с ключом в (?<keyPath>.+)/i,
   f:({letter,keyPath})=>`Enable-BitLocker -MountPoint "${letter.toUpperCase()}:" -RecoveryKeyPath "${keyPath}" -EncryptionMethod XtsAes256`},
  {p:/показать процессы/i,            f:()=>'Get-Process | Sort-Object CPU -desc | Select -First 25'},
  {p:/убить процесс (?<name>\S+)/i,   f:({name})=>`Stop-Process -Name "${name}" -Force`}
];
const tmpl=q=>{for(const t of templates){const m=q.match(t.p);if(m)return t.f(m.groups||{});}return null;};

/* ---------- localStorage memory ---------- */
let knowledge=JSON.parse(localStorage.getItem('knowledgeBase')||'[]');
let corpus   =JSON.parse(localStorage.getItem('corpus')      ||'[]');
const save   =()=>{localStorage.setItem('knowledgeBase',JSON.stringify(knowledge));
                   localStorage.setItem('corpus',       JSON.stringify(corpus));};

/* ---------- progress badge ---------- */
const TARGET=100_000;
const bar=document.getElementById('progress');
const updateBar=()=>{bar.textContent=Math.min(100,Math.round(corpus.length/TARGET*100))+' %';};
updateBar();

/* ---------- DistilGPT-2 ---------- */
let gpt=null, activeWait=null;

async function loadModel(){
  if(gpt) return;

  if(!window.transformers){
    append('ИИ','transformers.min.js не подключён!','bot');
    throw new Error('Transformers not found');
  }

  const {pipeline,env}=window.transformers;

  /* прогресс скачивания весов */
  env.onprogress = p=>{
    if(activeWait) activeWait.textContent = `ИИ: качаю ${(p*100|0)} %`;
  };

  gpt = await pipeline('text-generation','Xenova/distilgpt2',{quantized:true});
}

async function genPS(prompt){
  await loadModel();
  const out=await gpt(prompt+'\n```powershell\n',{max_new_tokens:60,temperature:.3,stop:['```']});
  return out[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();
}

/* ---------- bulk training ---------- */
function trainFromText(){
  const raw=document.getElementById('textInput').value.trim();
  if(!raw) return alert('Текст?');

  let pairs=0,single=0;
  raw.split(/\r?\n+/).forEach(line=>{
    const parts=line.split(' - ');
    if(parts.length===2){
      const[q,a]=parts.map(s=>s.trim());
      if(q&&a){knowledge.push({request:q.toLowerCase(),answer:a});pairs++;}
    }else{
      const s=line.trim(); if(s){corpus.push(s);single++;}
    }
  });

  save(); updateBar();
  append('ИИ',`Загружено: пар ${pairs}, предложений ${single}`,'bot');
  document.getElementById('textInput').value='';
}

async function trainFromURL(){
  const url=document.getElementById('urlInput').value.trim();
  if(!url) return alert('URL?');
  try{
    const data=await (await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url))).json();
    const text=[...new DOMParser().parseFromString(data.contents,'text/html').querySelectorAll('p')].map(p=>p.textContent.trim()).join(' ');
    text.split(/[.!?\r?\n]+/).map(s=>s.trim()).filter(Boolean).forEach(s=>{
      knowledge.push({request:s.toLowerCase(),answer:s}); corpus.push(s);
    });
    save(); updateBar();
    append('ИИ',`С URL обучено: ${corpus.length}`,'bot');
    document.getElementById('urlInput').value='';
  }catch{alert('Не удалось загрузить URL');}
}

/* ---------- analysis ---------- */
const stopW=new Set('и в во не что он на я ...'.split(' '));
function analysis(){
  if(!corpus.length) return 'Корпус пуст!';
  let total=0,f={};
  corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u).forEach(w=>{
    if(!w||stopW.has(w)) return; total++; f[w]=(f[w]||0)+1;
  }));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return `Всего предложений: ${corpus.length}\nСредняя длина: ${avg}\nТоп-10 слов: ${top}`;
}
const showAnalysis=()=>append('ИИ',analysis(),'bot');

/* ---------- backup ---------- */
function exportData(){
  const blob=new Blob([JSON.stringify({knowledge,corpus})],{type:'application/json'});
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
    }catch{alert('Некорректный файл');}
  };
  r.readAsText(f);
}
function clearMemory(){
  if(!confirm('Удалить все знания?')) return;
  knowledge=[]; corpus=[]; localStorage.clear(); updateBar(); clearChat();
  append('ИИ','Память очищена полностью','bot');
}

/* ---------- chat engine ---------- */
function sim(a,b){
  const w1=a.split(/\s+/), w2=b.split(/\s+/);
  return w1.filter(x=>w2.includes(x)).length / Math.max(w1.length,w2.length);
}
function kbMatch(q){
  let best=null,s=0;
  knowledge.forEach(e=>{const sc=sim(q,e.request); if(sc>s){s=sc;best=e;}});
  return s>0.35?best.answer:null;
}

async function ask(){
  const ta=document.getElementById('userInput'), q=ta.value.trim();
  if(!q) return;
  ta.value=''; append('Ты',q,'user');

  if(/^анализ/i.test(q)){append('ИИ',analysis(),'bot');return;}

  if(q.includes(' - ')){
    const [req,ans]=q.split(' - ').map(s=>s.trim());
    if(req&&ans){knowledge.push({request:req.toLowerCase(),answer:ans}); save(); updateBar(); append('ИИ','Запомнил!','bot');}
    return;
  }

  let ans=tmpl(q.toLowerCase()) || kbMatch(q.toLowerCase());
  if(!ans){
    activeWait=append('ИИ','ИИ: качаю 0 %','bot');
    aiBadge.classList.remove('d-none');

    const timeout=new Promise((_,rej)=>setTimeout(()=>rej('timeout'),30_000));
    try{ ans = await Promise.race([genPS(`Напиши PowerShell-скрипт: ${q}`), timeout]); }
    catch(e){ ans = ` GPT-2 не ответил: ${e}`; }

    aiBadge.classList.add('d-none');
    activeWait.textContent='ИИ: '+ans; activeWait=null;
    return;
  }
  append('ИИ',ans,'bot');
}

/* ---------- expose ---------- */
Object.assign(window,{trainFromText,trainFromURL,showAnalysis,
                      exportData,importData,clearMemory,
                      clearChat,ask,toggleTheme});

/* Ctrl+Enter = send */
document.getElementById('userInput')
  .addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();ask();}
});
/* ==== tiny debug console ================================= */
(() => {
  const logBox   = document.getElementById('dbgLog');
  const toggle   = document.getElementById('dbgToggle');
  const panel    = document.getElementById('dbgPanel');
  const clearBtn = document.getElementById('dbgClear');

  const clog = (type, args) => {
    const msg = [...args].map(x => (typeof x==='object'? JSON.stringify(x): x)).join(' ');
    logBox.textContent += `[${type}] ${msg}\n`;
    logBox.scrollTop = logBox.scrollHeight;
  };

  ['log','warn','error'].forEach(fn => {
    const orig = console[fn];
    console[fn] = (...args) => { orig.apply(console,args); clog(fn,args); };
  });

  toggle.onclick = () => panel.classList.toggle('open');
  clearBtn.onclick = () => logBox.textContent='';
   
console.log('🔧 Debug console ready (Android)');
})();
