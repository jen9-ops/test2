/* =========================================================
   Hyper-Bot  •  app.js  • 2025-07-22
   — Локальный transformers.min.js
   — DistilGPT-2, прогресс загрузки, таймаут 30s
   — Bulk-обучение "вопрос - ответ" через панель
   — Все кнопки работают через data-act
   ========================================================= */

const $ = id => document.getElementById(id);
const chat = $('chat');

/* helper to append messages */
const append = (who,text,cls)=>{const d=document.createElement('div');d.className=`msg ${cls}`;d.textContent=`${who}: ${text}`;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d;};
const badge=$('aiIndicator');

/* ===== PANELS / MENU ===== */
const hidePanels=()=>{$('trainText').classList.add('hidden');$('trainURL').classList.add('hidden');};
function showTrainText(){hidePanels();$('trainText').classList.remove('hidden');}
function showTrainURL(){hidePanels();$('trainURL').classList.remove('hidden');}
function toggleTheme(){document.body.classList.toggle('dark');}

$('menuBtn').onclick=()=>$('menu').classList.toggle('hidden');
$('menu').addEventListener('click',e=>{
  if(e.target.tagName!=='BUTTON')return;const act=e.target.dataset.act;$('menu').classList.add('hidden');
  switch(act){
    case 'trainText': showTrainText();break;
    case 'trainURL':  showTrainURL(); break;
    case 'analysis':  showAnalysis();  break;
    case 'export':    exportData();    break;
    case 'import':    $('fileInp').click(); break;
    case 'clearChat': clearChat();     break;
    case 'clearMemory': clearMemory(); break;
    case 'theme':     toggleTheme();   break;
  }
});

document.body.addEventListener('click',e=>{if(e.target.dataset.act==='closePanels')hidePanels();});
$('fileInp').addEventListener('change',importData);
$('sendBtn').addEventListener('click',ask);
$('userInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();ask();}});

/* ===== MEMORY ===== */
let KB=JSON.parse(localStorage.getItem('KB')||'[]');
let corpus=JSON.parse(localStorage.getItem('corpus')||'[]');
const save=()=>{localStorage.setItem('KB',JSON.stringify(KB));localStorage.setItem('corpus',JSON.stringify(corpus));updateBar();};
const updateBar=()=>$('progress').textContent=Math.min(100,Math.round(corpus.length/1000))+' %';
updateBar();

/* ===== TRAINING ===== */
function trainFromText(){
  const raw=$('textInput').value.trim();if(!raw)return alert('Текст?');
  let pairs=0,single=0;
  raw.split(/\r?\n+/).forEach(line=>{const p=line.split(' - ');
    if(p.length===2){KB.push({q:p[0].toLowerCase(),a:p[1]});pairs++;}
    else{corpus.push(line);single++;}
  });
  save();append('ИИ',`Обучено: пар ${pairs}, строк ${single}`,'bot');$('textInput').value='';hidePanels();
}
async function trainFromURL(){
  const url=$('urlInput').value.trim();if(!url)return alert('URL?');
  try{
    const res=await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url));
    const {contents}=await res.json();
    const text=[...new DOMParser().parseFromString(contents,'text/html').querySelectorAll('p')].map(p=>p.textContent.trim()).join(' ');
    text.split(/[.!?\n]+/).filter(Boolean).forEach(s=>{KB.push({q:s.toLowerCase(),a:s});corpus.push(s);});
    save();append('ИИ','С URL обучено','bot');$('urlInput').value='';hidePanels();
  }catch(err){alert('Не удалось загрузить URL: '+err);}
}

/* ===== KB SEARCH ===== */
function sim(a,b){const w1=a.split(/\s+/),w2=b.split(/\s+/);return w1.filter(x=>w2.includes(x)).length/Math.max(w1.length,w2.length);}
function kbFind(q){let best=null,s=0;KB.forEach(e=>{const c=sim(q,e.q);if(c>s){s=c;best=e;}});return s>0.35?best.a:null;}

/* ===== GPT MODEL ===== */
let gpt=null,waitBubble=null;
async function loadModel(){
  if(gpt)return;
  if(!window.transformers){append('ИИ','⚠ transformers.min.js не подключён!','bot');throw new Error('no transformers');}
  const {pipeline,env}=window.transformers;
  env.onprogress=p=>{if(waitBubble)waitBubble.textContent=`ИИ: качаю ${(p*100|0)} %`;};
  gpt=await pipeline('text-generation','Xenova/distilgpt2',{quantized:true});
}
async function ai(prompt){
  await loadModel();
  const o=await gpt(prompt+'\n```powershell\n',{max_new_tokens:60,temperature:.3,stop:['```']});
  return o[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();
}

/* ===== ASK ===== */
async function ask(){
  const q=$('userInput').value.trim();if(!q)return;
  append('Ты',q,'user');$('userInput').value='';

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
    try{ans=await Promise.race([ai(`Напиши PowerShell-скрипт: ${q}`),timeout]);}
    catch(e){ans='⚠ GPT-2 не ответил: '+e;}
    badge.classList.add('d-none');
    waitBubble.textContent='ИИ: '+ans;waitBubble=null;return;
  }
  append('ИИ',ans,'bot');
}

/* ===== ANALYSIS ===== */
const stop=new Set('и в во не что он на я ...'.split(' '));
function analysis(){
  if(!corpus.length)return'Корпус пуст!';let total=0,f={};
  corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u).forEach(w=>{if(!w||stop.has(w))return;total++;f[w]=(f[w]||0)+1;}));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return`Всего предложений: ${corpus.length}\nСредняя длина: ${avg}\nТоп-10 слов: ${top}`;
}
function showAnalysis(){append('ИИ',analysis(),'bot');}

/* ===== BACKUP ===== */
function exportData(){const blob=new Blob([JSON.stringify({KB,corpus})],{type:'application/json'});Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'bot-memory.json'}).click();}
function importData(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.KB&&d.corpus){KB=d.KB;corpus=d.corpus;save();append('ИИ','Память загружена!','bot');}}catch{alert('Некорректный файл');}};r.readAsText(f);}
function clearMemory(){if(confirm('Удалить все знания?')){KB=[];corpus=[];localStorage.clear();save();clearChat();append('ИИ','Память очищена','bot');}}
function clearChat(){chat.innerHTML='';}

/* ===== INLINE DEBUG CONSOLE ===== */
(()=>{const box=$('dbgLog'),toggle=$('dbgToggle'),panel=$('dbgPanel'),clr=$('dbgClear');
  const log=(t,a)=>{box.textContent+=`[${t}] ${[...a].map(x=>typeof x==='object'?JSON.stringify(x):x).join(' ')}\n`;box.scrollTop=box.scrollHeight;};
  ['log','warn','error'].forEach(fn=>{const o=console[fn];console[fn]=(...a)=>{o.apply(console,a);log(fn,a);};});
  toggle.onclick=()=>panel.classList.toggle('open');
  clr.onclick=()=>box.textContent='';
  console.log('🔧 Debug console ready');
})();
