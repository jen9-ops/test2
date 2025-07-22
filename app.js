/* === helpers === */
const $ = id => document.getElementById(id);
const chat = $('chat');

const append = (from,text,cls)=>{
  const m=document.createElement('div');m.className=`msg ${cls}`;m.textContent=`${from}: ${text}`;
  chat.appendChild(m);chat.scrollTop=chat.scrollHeight;return m;
};
const badge = $('aiIndicator');
const menu  = $('menu');

/* === memory === */
let KB      = JSON.parse(localStorage.getItem('KB')||'[]');
let corpus  = JSON.parse(localStorage.getItem('corpus')||'[]');
const save  = ()=>{localStorage.setItem('KB',JSON.stringify(KB));localStorage.setItem('corpus',JSON.stringify(corpus));updateBar();};
const updateBar = ()=>$('progress').textContent=Math.min(100,Math.round(corpus.length/1000))+' %';

/* === burger === */
$('menuBtn').onclick = ()=>menu.style.display=menu.style.display==='block'?'none':'block';

/* === train panels === */
function hidePanels(){ $('trainText').style.display='none';$('trainURL').style.display='none'; }
function showTrainText(){hidePanels();$('trainText').style.display='block';menu.style.display='none';}
function showTrainURL(){ hidePanels();$('trainURL').style.display='block';menu.style.display='none';}

/* === training === */
function trainFromText(){
  const raw=$('textInput').value.trim(); if(!raw)return alert('Текст?');
  let p=0,s=0;
  raw.split(/\r?\n+/).forEach(line=>{
    const parts=line.split(' - ');
    if(parts.length===2){KB.push({q:parts[0].toLowerCase(),a:parts[1]});p++;}
    else{corpus.push(line);s++;}
  });
  save();append('ИИ',`Загружено: пар ${p}, предложений ${s}`,'bot');$('textInput').value='';
}
async function trainFromURL(){
  const u=$('urlInput').value.trim();if(!u)return alert('URL?');
  const d=await(await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(u))).json();
  const txt=[...new DOMParser().parseFromString(d.contents,'text/html').querySelectorAll('p')].map(p=>p.textContent.trim()).join(' ');
  txt.split(/[.!?\n]+/).filter(Boolean).forEach(s=>{KB.push({q:s.toLowerCase(),a:s});corpus.push(s);});
  save();append('ИИ','С URL обучено','bot');$('urlInput').value='';
}

/* === KB search === */
function sim(a,b){const w1=a.split(/\s+/),w2=b.split(/\s+/);return w1.filter(x=>w2.includes(x)).length/Math.max(w1.length,w2.length);}
function kbFind(q){let best=null,s=0;KB.forEach(e=>{const c=sim(q,e.q);if(c>s){s=c;best=e;}});return s>0.35?best.a:null;}

/* === GPT model === */
let gpt=null, waitBubble=null;
async function loadModel(){
  if(gpt) return;
  if(!window.transformers){append('ИИ','⚠ transformers.min.js не подключён!','bot');throw 0;}
  const {pipeline,env}=window.transformers;
  env.onprogress=p=>{if(waitBubble)waitBubble.textContent=`ИИ: качаю ${(p*100|0)} %`;};
  gpt=await pipeline('text-generation','Xenova/distilgpt2',{quantized:true});
}
async function ai(prompt){
  await loadModel();
  const o=await gpt(prompt+'\n```powershell\n',{max_new_tokens:60,temperature:.3,stop:['```']});
  return o[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();
}

/* === ask === */
async function ask(){
  const q=$('userInput').value.trim(); if(!q)return;
  append('Ты',q,'user'); $('userInput').value='';

  if(/^анализ/i.test(q)){append('ИИ',analysis(),'bot');return;}
  if(q.includes(' - ')){const[p,a]=q.split(' - ');KB.push({q:p.toLowerCase(),a});save();append('ИИ','Запомнил!','bot');return;}

  let ans=kbFind(q.toLowerCase());
  if(!ans){
    waitBubble=append('ИИ','ИИ: качаю 0 %','bot'); badge.classList.remove('d-none');
    try{ans=await Promise.race([ai(`Напиши PowerShell-скрипт: ${q}`),new Promise((_,rej)=>setTimeout(()=>rej('timeout'),30000))]);}
    catch(e){ans='⚠ GPT-2 не ответил: '+e;}
    badge.classList.add('d-none'); waitBubble.textContent='ИИ: '+ans; waitBubble=null; return;
  }
  append('ИИ',ans,'bot');
}

/* === analysis === */
function analysis(){
  if(!corpus.length)return'Корпус пуст!';
  let total=0,f={}; corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u).forEach(w=>{if(!w)return;total++;f[w]=(f[w]||0)+1;}));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return`Всего: ${corpus.length}\nСредняя длина: ${avg}\nТоп-10: ${top}`;
}

/* === backup === */
function exportData(){const blob=new Blob([JSON.stringify({KB,corpus})],{type:'application/json'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'bot-memory.json'}).click();}
function importData(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=ev=>{const d=JSON.parse(ev.target.result);if(d.KB&&d.corpus){KB=d.KB;corpus=d.corpus;save();append('ИИ','Память загружена!','bot');}};
  r.readAsText(f);}
function clearMemory(){if(confirm('Удалить все знания?')){KB=[];corpus=[];localStorage.clear();save();chat.innerHTML='';append('ИИ','Память очищена','bot');}}
function clearChat(){chat.innerHTML='';}

/* === console === */
(()=>{const box=$('dbgLog'),toggle=$('dbgToggle'),panel=$('dbgPanel'),clr=$('dbgClear');
['log','warn','error'].forEach(fn=>{const o=console[fn];console[fn]=(...a)=>{o(...a);box.textContent+=`[${fn}] ${a.join(' ')}\n`;box.scrollTop=box.scrollHeight;};});
toggle.onclick=()=>panel.classList.toggle('open'); clr.onclick=()=>box.textContent='';
console.log('🔧 Debug console ready');})();

/* === hot-key === */
$('userInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();ask();}});
