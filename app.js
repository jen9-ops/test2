/* ====  глобальные короткие ссылки  ==== */
const M  = msg => append('ИИ',msg,'bot');
const $  = sel => document.getElementById(sel);

/* ═════════════  menu  ═════════════ */
const menu = $('menu');
$('menuBtn').onclick = () => menu.style.display
  = menu.style.display === 'block' ? 'none' : 'block';

/* ═════════════  train panels  ═════════════ */
function hidePanels(){ $('trainText').style.display='none'; $('trainURL').style.display='none'; }
function showTrainText(){ hidePanels(); $('trainText').style.display='block'; menu.style.display='none'; }
function showTrainURL(){ hidePanels(); $('trainURL').style.display='block'; menu.style.display='none'; }

/* ═════════════  KB storage  ═════════════ */
let KB = JSON.parse(localStorage.getItem('KB')||'[]');
let corpus = JSON.parse(localStorage.getItem('corpus')||'[]');
const save = ()=>{localStorage.setItem('KB',JSON.stringify(KB));
                  localStorage.setItem('corpus',JSON.stringify(corpus)); updateBar();};
function updateBar(){ $('progress').textContent =
  Math.min(100,Math.round(corpus.length/1000)) + ' %'; }

/* ═════════════  training  ═════════════ */
function trainFromText(){
  const raw=$('textInput').value.trim(); if(!raw) return alert('Текст?');
  let pairs=0,single=0;
  raw.split(/\r?\n+/).forEach(l=>{
    const p=l.split(' - ');
    if(p.length===2){KB.push({q:p[0].toLowerCase(),a:p[1]}); pairs++;}
    else{corpus.push(l); single++;}
  });
  save(); M(`Обучено: пар ${pairs}, строк ${single}`); $('textInput').value='';
}
async function trainFromURL(){
  const url=$('urlInput').value.trim(); if(!url) return alert('URL?');
  const r=await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url));
  const {contents}=await r.json();
  const txt=[...new DOMParser().parseFromString(contents,'text/html').querySelectorAll('p')].map(p=>p.textContent.trim()).join(' ');
  txt.split(/[.!?\n]+/).filter(Boolean).forEach(s=>{KB.push({q:s.toLowerCase(),a:s}); corpus.push(s);});
  save(); M('С URL обучено: '+txt.length); $('urlInput').value='';
}

/* ═════════════  KB search  ═════════════ */
const sim=(a,b)=>a.split(/\s+/).filter(x=>b.includes(x)).length/Math.max(a.split(/\s+/).length,b.length);
function kbFind(q){
  let best=null,s=0;
  KB.forEach(e=>{const c=sim(q,e.q); if(c>s){s=c;best=e;}});
  return s>0.35?best.a:null;
}

/* ═════════════  distilgpt-2  ═════════════ */
let gpt=null, activeWait=null;
async function loadModel(){
  if(gpt) return;
  if(!window.transformers){M('⚠ transformers.min.js не подключён!');throw 0;}
  const {pipeline,env}=window.transformers;
  env.onprogress=p=>{if(activeWait)activeWait.textContent=`ИИ: качаю ${(p*100|0)} %`;};
  gpt=await pipeline('text-generation','Xenova/distilgpt2',{quantized:true});
}
async function aiGenerate(prompt){
  await loadModel();
  const o=await gpt(prompt+'\n```powershell\n',{max_new_tokens:60,temperature:.3,stop:['```']});
  return o[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();
}

/* ═════════════  ask  ═════════════ */
async function ask(){
  const q=$('userInput').value.trim(); if(!q) return;
  append('Ты',q,'user'); $('userInput').value='';

  if(/^анализ/i.test(q)){M(analysis());return;}

  if(q.includes(' - ')){const[p,a]=q.split(' - '); KB.push({q:p.toLowerCase(),a}); save(); M('Запомнил!');return;}

  let ans=kbFind(q.toLowerCase());
  if(!ans){
    activeWait=append('ИИ','ИИ: качаю 0 %','bot'); $('aiIndicator').classList.remove('d-none');
    try{ ans=await Promise.race([aiGenerate(`Напиши PowerShell-скрипт: ${q}`),new Promise((_,rej)=>setTimeout(()=>rej('timeout'),30000))]);}
    catch(e){ans='⚠ GPT-2 не ответил: '+e;}
    $('aiIndicator').classList.add('d-none');
    activeWait.textContent='ИИ: '+ans; activeWait=null; return;
  }
  M(ans);
}

/* ═════════════  analysis  ═════════════ */
const stop=new Set('и в во не что он на я ...'.split(' '));
function analysis(){
  if(!corpus.length)return'Корпус пуст!';let total=0,f={};
  corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u).forEach(w=>{if(!w||stop.has(w))return;total++;f[w]=(f[w]||0)+1;}));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return`Всего предложений: ${corpus.length}\nСредняя длина: ${avg}\nТоп-10 слов: ${top}`;
}

/* ═════════════  backup  ═════════════ */
function exportData(){const blob=new Blob([JSON.stringify({KB,corpus})],{type:'application/json'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'bot-memory.json'}).click();}
function importData(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=ev=>{const d=JSON.parse(ev.target.result);if(d.KB&&d.corpus){KB=d.KB;corpus=d.corpus;save();M('Память загружена!');}};
  r.readAsText(f);}
function clearMemory(){if(confirm('Удалить все знания?')){KB=[];corpus=[];localStorage.clear();save();clearChat();M('Память очищена');}}
function clearChat(){ $('chat').innerHTML=''; }

/* ═════════════  console  ═════════════ */
(()=>{const box=$('dbgLog'),toggle=$('dbgToggle'),panel=$('dbgPanel'),clr=$('dbgClear');
const log=(t,a)=>{box.textContent+=`[${t}] ${[...a].join(' ')}\n`;box.scrollTop=box.scrollHeight;};
['log','warn','error'].forEach(fn=>{const o=console[fn];console[fn]=(...a)=>{o.apply(console,a);log(fn,a);};});
toggle.onclick=()=>panel.classList.toggle('open'); clr.onclick=()=>box.textContent=''; console.log('🔧 Debug console ready'); })();

/* ═════════════  keysend  ═════════════ */
$('userInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();ask();}});
