/* =========================================================
   Hyper-Bot  app.js  (mobile console + history + autocomplete)
   ========================================================= */

const $ = id => document.getElementById(id);
const chat = $('chat');
const badge = $('aiIndicator');

/* ---------- safe console hook very early ---------- */
(() => {
  const orig = {...console};
  window.__dbgBuffer = [];
  ['log','warn','error','info'].forEach(fn=>{
    console[fn] = (...a)=>{
      orig[fn](...a);
      window.__dbgBuffer.push([fn,a]);
    };
  });
})();

/* ---------- helpers ---------- */
function append(who, text, cls) {
  // зеркалим в консоль
  console.log(`[UI] ${who}: ${text}`);
  const d = document.createElement('div');
  d.className = `msg ${cls}`; d.textContent = `${who}: ${text}`;
  chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
  return d;
}

const hidePanels=()=>{$('trainText').classList.add('hidden');$('trainURL').classList.add('hidden');};
function showTrainText(){hidePanels();$('trainText').classList.remove('hidden');}
function showTrainURL(){hidePanels();$('trainURL').classList.remove('hidden');}
function toggleTheme(){document.body.classList.toggle('dark');}

/* ---------- menu ---------- */
$('menuBtn').onclick=()=>$('menu').classList.toggle('hidden');
$('menu').addEventListener('click',e=>{
  if(e.target.tagName!=='BUTTON')return;
  const act=e.target.dataset.act; $('menu').classList.add('hidden');
  switch(act){
    case 'trainText': showTrainText(); break;
    case 'trainURL':  showTrainURL();  break;
    case 'analysis':  showAnalysis();  break;
    case 'export':    exportData();    break;
    case 'import':    $('fileInp').click(); break;
    case 'clearChat': clearChat();     break;
    case 'clearMemory': clearMemory(); break;
    case 'theme':     toggleTheme();   break;
    case 'doTrainText': trainFromText(); break;
    case 'doTrainURL' : trainFromURL();  break;
    case 'closePanels': hidePanels();  break;
  }
});
document.body.addEventListener('click',e=>{
  if(e.target.dataset.act==='closePanels') hidePanels();
});
$('fileInp').addEventListener('change',importData);
$('sendBtn').addEventListener('click',ask);
$('userInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();ask();}
});

/* ---------- memory ---------- */
let KB     = JSON.parse(localStorage.getItem('KB')||'[]');
let corpus = JSON.parse(localStorage.getItem('corpus')||'[]');
const save = ()=>{localStorage.setItem('KB',JSON.stringify(KB));
                  localStorage.setItem('corpus',JSON.stringify(corpus));updateBar();};
const updateBar=()=>$('progress').textContent=Math.min(100,Math.round(corpus.length/1000))+' %';
updateBar();

/* ---------- training ---------- */
function trainFromText(){
  const raw=$('textInput').value.trim(); if(!raw) return alert('Текст?');
  let pairs=0,single=0;
  raw.split(/\r?\n+/).forEach(line=>{
    const p=line.split(' - ');
    if(p.length===2){KB.push({q:p[0].toLowerCase(),a:p[1]});pairs++;}
    else{corpus.push(line);single++;}
  });
  save(); append('ИИ',`Обучено: пар ${pairs}, строк ${single}`,'bot');
  $('textInput').value=''; hidePanels();
}
async function trainFromURL(){
  const url=$('urlInput').value.trim(); if(!url) return alert('URL?');
  try{
    const res=await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url));
    const {contents}=await res.json();
    const text=[...new DOMParser().parseFromString(contents,'text/html').querySelectorAll('p')]
                .map(p=>p.textContent.trim()).join(' ');
    text.split(/[.!?\n]+/).filter(Boolean).forEach(s=>{
      KB.push({q:s.toLowerCase(),a:s}); corpus.push(s);
    });
    save(); append('ИИ','С URL обучено','bot');
    $('urlInput').value=''; hidePanels();
  }catch(err){ console.error('trainFromURL',err); alert('Не удалось загрузить URL: '+err); }
}

/* ---------- KB search ---------- */
function sim(a,b){const w1=a.split(/\s+/),w2=b.split(/\s+/);return w1.filter(x=>w2.includes(x)).length/Math.max(w1.length,w2.length);}
function kbFind(q){let best=null,s=0;KB.forEach(e=>{const c=sim(q,e.q);if(c>s){s=c;best=e;}});return s>0.35?best.a:null;}

/* ---------- transformers loader ---------- */
async function ensureTransformersLoaded(){
  if(window.transformers?.pipeline) return true;
  console.warn('Transformers not found, trying to attach dynamically...');
  // попробуем подключить локально ещё раз
  await new Promise(resolve=>{
    const s=document.createElement('script');
    s.src='transformers.min.js'; s.onload=resolve; s.onerror=resolve;
    document.head.appendChild(s);
  });
  if(window.transformers?.pipeline) return true;

  // как fallback — CDN
  await new Promise(resolve=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
    s.onload=resolve; s.onerror=resolve;
    document.head.appendChild(s);
  });
  return !!window.transformers?.pipeline;
}

/* ---------- GPT model ---------- */
let gpt=null, waitBubble=null;
async function loadModel(){
  if(gpt) return;
  const ok = await ensureTransformersLoaded();
  if(!ok){ append('ИИ','⚠ transformers.min.js не подключён!','bot'); throw new Error('no transformers'); }

  const {pipeline, env} = window.transformers;
  try{
    // локальный WASM (если файлы лежат рядом)
    if(env?.onnx?.wasm) env.onnx.wasm.wasmPaths = './';
    console.log('▶ Загружаю DistilGPT-2…');
    env.onprogress=p=>{if(waitBubble)waitBubble.textContent=`ИИ: качаю ${(p*100|0)} %`;};
    gpt=await pipeline('text-generation','Xenova/distilgpt2',{quantized:true});
    console.log('✔ Модель готова');
  }catch(e){
    console.error('loadModel error',e);
    throw e;
  }
}
async function ai(prompt){
  await loadModel();
  const o=await gpt(prompt+'\n```powershell\n',{max_new_tokens:60,temperature:.3,stop:['```']});
  return o[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();
}

/* ---------- ask ---------- */
async function ask(){
  const q=$('userInput').value.trim(); if(!q) return;
  append('Ты',q,'user'); $('userInput').value='';

  if(/^анализ/i.test(q)){showAnalysis();return;}

  if(q.includes(' - ')){
    const [rq,ans]=q.split(' - ').map(s=>s.trim());
    if(rq&&ans){KB.push({q:rq.toLowerCase(),a:ans});save();append('ИИ','Запомнил!','bot');}
    return;
  }

  let ans=kbFind(q.toLowerCase());
  if(!ans){
    waitBubble=append('ИИ','ИИ: качаю 0 %','bot');
    badge.classList.remove('d-none');
    const timeout=new Promise((_,rej)=>setTimeout(()=>rej('timeout'),30_000));
    try{ ans=await Promise.race([ ai(`Напиши PowerShell-скрипт: ${q}`), timeout ]); }
    catch(e){ console.error('GPT-2 error',e); ans='⚠ GPT-2 не ответил: '+e; }
    badge.classList.add('d-none');
    waitBubble.textContent='ИИ: '+ans; waitBubble=null;
    return;
  }
  append('ИИ',ans,'bot');
}

/* ---------- analysis ---------- */
const stop=new Set('и в во не что он на я ...'.split(' '));
function analysis(){
  if(!corpus.length)return'Корпус пуст!';
  let total=0,f={};
  corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u).forEach(w=>{
    if(!w||stop.has(w))return; total++; f[w]=(f[w]||0)+1;
  }));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return `Всего предложений: ${corpus.length}\nСредняя длина: ${avg}\nТоп-10 слов: ${top}`;
}
function showAnalysis(){append('ИИ',analysis(),'bot');}

/* ---------- backup ---------- */
function exportData(){
  const blob=new Blob([JSON.stringify({KB,corpus})],{type:'application/json'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'bot-memory.json'}).click();
}
function importData(e){
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(d.KB&&d.corpus){KB=d.KB;corpus=d.corpus;save();append('ИИ','Память загружена!','bot');}
    }catch{alert('Некорректный файл');}
  };
  r.readAsText(f);
}
function clearMemory(){
  if(confirm('Удалить все знания?')){
    KB=[]; corpus=[]; localStorage.clear(); save(); clearChat(); append('ИИ','Память очищена','bot');
  }
}
function clearChat(){ chat.innerHTML=''; }

/* =========================================================
   Interactive Console (mobile full-screen + history + autocomplete)
   ========================================================= */
(()=>{
  const panel   = $('dbgPanel');
  const toggle  = $('dbgToggle');
  const logBox  = $('dbgLog');
  const clrBtn  = $('dbgClear');
  const cmdInp  = $('dbgCmd');
  const runBtn  = $('dbgRun');
  const hintBtn = $('dbgHintBtn');
  const histUp  = $('dbgHistUp');
  const histDn  = $('dbgHistDown');
  const fullBtn = $('dbgFull');
  const closeBtn= $('dbgClose');
  const hintBox = $('dbgHints');

  const MAX_LINES=500, MAX_HISTORY=100;
  let history = JSON.parse(localStorage.getItem('dbgHistory')||'[]');
  let histPos = history.length;
  let hintIndex=-1, lastPrefix='';

  const toStr = v => (typeof v==='string'?v: (()=>{try{return JSON.stringify(v)}catch{ return String(v)}})() );

  function log(type,...a){
    logBox.textContent += `[${type}] ${a.map(toStr).join(' ')}\n`;
    const lines=logBox.textContent.split('\n');
    if(lines.length>MAX_LINES) logBox.textContent=lines.slice(-MAX_LINES).join('\n');
    logBox.scrollTop=logBox.scrollHeight;
  }

  // слить накопленное, подключённое раньше
  if(window.__dbgBuffer){
    window.__dbgBuffer.forEach(([t,a])=>log(t,...a));
    window.__dbgBuffer=null;
  }

  ['log','warn','error','info'].forEach(fn=>{
    const orig=console[fn];
    console[fn]=(...a)=>{orig.apply(console,a);log(fn,...a);};
  });
  window.addEventListener('error',e=>log('error',e.message,'@',e.filename,`${e.lineno}:${e.colno}`));
  window.addEventListener('unhandledrejection',e=>log('error','UnhandledRejection:',toStr(e.reason)));

  function pushHistory(cmd){
    if(!cmd.trim())return;
    if(history[history.length-1]!==cmd){
      history.push(cmd);
      if(history.length>MAX_HISTORY) history=history.slice(-MAX_HISTORY);
      localStorage.setItem('dbgHistory',JSON.stringify(history));
    }
    histPos=history.length;
  }
  function prevHist(){ if(histPos>0){histPos--; cmdInp.value=history[histPos];} }
  function nextHist(){ if(histPos<history.length-1){histPos++; cmdInp.value=history[histPos];} else {histPos=history.length; cmdInp.value='';} }

  function getCandidates(prefix){
    if(!prefix) return [];
    const gl=Object.getOwnPropertyNames(window);
    gl.push('KB','corpus','ask','trainFromText','trainFromURL','showAnalysis');
    return [...new Set(gl)].filter(w=>w.toLowerCase().startsWith(prefix.toLowerCase())).sort();
  }
  function showHints(prefix){
    lastPrefix=prefix;
    const list=getCandidates(prefix);
    if(!list.length){hideHints();return;}
    hintBox.innerHTML=list.map((w,i)=>`<li data-i=\"${i}\">${w}</li>`).join('');
    hintBox.classList.remove('hidden'); hintIndex=-1;
  }
  function hideHints(){hintBox.classList.add('hidden');hintBox.innerHTML='';hintIndex=-1;}
  function setActiveHint(i){
    const items=hintBox.querySelectorAll('li');
    items.forEach(li=>li.classList.remove('active'));
    if(i>=0&&i<items.length){items[i].classList.add('active');}
    hintIndex=i;
  }
  function applyHint(i){
    const items=hintBox.querySelectorAll('li');
    if(i<0||i>=items.length)return;
    const word=items[i].textContent;
    cmdInp.value = cmdInp.value.replace(/([A-Za-z$_][\\w$]*)?$/, word);
    hideHints(); cmdInp.focus();
  }

  function runCmd(){
    const code=cmdInp.value.trim(); if(!code) return;
    pushHistory(code);
    try{
      const res=eval(code);
      log('eval','> '+code,'=>',res);
    }catch(err){log('error',err.stack||err);}
    cmdInp.value=''; hideHints();
  }

  runBtn.onclick=runCmd;
  clrBtn.onclick=()=>logBox.textContent='';
  histUp.onclick=prevHist;
  histDn.onclick=nextHist;
  hintBtn.onclick=()=>{
    const m=cmdInp.value.match(/([A-Za-z$_][\\w$]*)$/);
    if(!m){hideHints();return;}
    if(hintBox.classList.contains('hidden')) showHints(m[1]);
    else applyHint(hintIndex<0?0:hintIndex);
  };
  hintBox.addEventListener('click',e=>{
    if(e.target.tagName==='LI'){applyHint(+e.target.dataset.i);}
  });

  toggle.onclick = ()=>{panel.classList.toggle('open');panel.classList.remove('full');};
  fullBtn.onclick = ()=>{panel.classList.add('open','full');};
  closeBtn.onclick= ()=>{panel.classList.remove('open','full');};

  cmdInp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();runCmd();}
  });
  cmdInp.addEventListener('input',()=>{
    const m=cmdInp.value.match(/([A-Za-z$_][\\w$]*)$/);
    if(m && m[1]!==lastPrefix) showHints(m[1]); else if(!m) hideHints();
  });

  console.log('🔧 Interactive console ready (mobile full-screen)');
})();

/* Экспортируем функции (удобно из консоли) */
Object.assign(window,{
  showTrainText,showTrainURL,showAnalysis,
  trainFromText,trainFromURL,
  exportData,importData,clearChat,clearMemory,
  toggleTheme,ask
});
