/* ─── UI helpers ─── */
const trainText = document.getElementById('trainText');
const trainURL  = document.getElementById('trainURL');
function hideSections(){trainText.classList.add('d-none');trainURL.classList.add('d-none');}
function showTrainText(){hideSections();trainText.classList.remove('d-none');}
function showTrainURL (){hideSections();trainURL.classList.remove('d-none');}
function toggleTheme  (){document.body.classList.toggle('dark');}

/* ─── шаблоны PowerShell ─── */
const templates=[{pattern:/создать vhdx (?<size>\d+(?:gb|mb)) в (?<path>.+)/i,
  script:({size,path})=>`# VHDX\n$vhd="${path}\\VirtualDisk.vhdx"\nNew-VHD -Path $vhd -SizeBytes ${size.toUpperCase()} -Dynamic\nMount-VHD -Path $vhd`},
 {pattern:/зашифровать диск (?<letter>[a-z]): с ключом в (?<keyPath>.+)/i,
  script:({letter,keyPath})=>`Enable-BitLocker -MountPoint "${letter.toUpperCase()}:" -RecoveryKeyPath "${keyPath}" -EncryptionMethod XtsAes256`},
 {pattern:/показать процессы/i,script:()=>`Get-Process | Sort-Object CPU -desc | Select -First 25`},
 {pattern:/убить процесс (?<name>\S+)/i,script:({name})=>`Stop-Process -Name "${name}" -Force`}];
const templateMatch=q=>{for(const t of templates){const m=q.match(t.pattern);if(m)return typeof t.script==='function'?t.script(m.groups||{}):t.script;}return null;};

/* ─── память ─── */
let knowledgeBase=JSON.parse(localStorage.getItem('knowledgeBase')||'[]');
let corpus       =JSON.parse(localStorage.getItem('corpus')||'[]');
const saveAll=()=>{localStorage.setItem('knowledgeBase',JSON.stringify(knowledgeBase));
                   localStorage.setItem('corpus',JSON.stringify(corpus));};

/* ─── процент (медленный) ─── */
const TARGET=1000;
function updateProgress(){
  const pct=Math.min(100,Math.round(corpus.length/TARGET*100/1000));
  document.getElementById('progress').textContent=pct+' %';
}
updateProgress();

/* ─── mini-GPT-2 ─── */
let gpt=null;
async function loadModel(){if(gpt)return;
  const {pipeline}=window.transformers;
  gpt=await pipeline('text-generation','Xenova/gpt2-small',{quantized:true});}
async function neuralScript(prompt){
  await loadModel();
  const out=await gpt(prompt+'\n```powershell\n',{max_new_tokens:120,temperature:.3,stop:['```']});
  return out[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();}

/* ─── DOM & helpers ─── */
const chat=document.getElementById('chat');
const userInput=document.getElementById('userInput');
const textInput=document.getElementById('textInput');
const urlInput =document.getElementById('urlInput');
function append(sender,text,cls){const d=document.createElement('div');
  d.className=`msg ${cls}`;d.textContent=`${sender}: ${text}`;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d;}
function clearChat(){chat.innerHTML='';}

/* ─── backup ─── */
function exportData(){
  const blob=new Blob([JSON.stringify({knowledgeBase,corpus})],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:'bot-memory.json'}).click();
  URL.revokeObjectURL(url);}
function importData(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{try{const d=JSON.parse(ev.target.result);
    if(Array.isArray(d.knowledgeBase)&&Array.isArray(d.corpus)){
      knowledgeBase=d.knowledgeBase; corpus=d.corpus; saveAll(); updateProgress();
      append('ИИ','Память восстановлена!','bot'); clearChat();}}
    catch{alert('Ошибка импорта');}};
  r.readAsText(f);}

/* ─── полная очистка памяти ─── */
function clearMemory(){
  if(!confirm('Удалить все знания? Это действие необратимо.')) return;
  knowledgeBase=[]; corpus=[];
  localStorage.removeItem('knowledgeBase');
  localStorage.removeItem('corpus');
  updateProgress(); clearChat();
  append('ИИ','Память очищена полностью','bot');
}

/* ─── обучение ─── */
const stopW=new Set('и в во не что он на я ...'.split(' '));
const sentences=txt=>txt.split(/[.!?\\r?\\n]+/).map(s=>s.trim()).filter(Boolean);
function trainFromText(){
  const txt=textInput.value.trim(); if(!txt){alert('Текст?');return;}
  const s=sentences(txt);
  s.forEach(x=>{knowledgeBase.push({request:x.toLowerCase(),answer:x});corpus.push(x);});
  saveAll(); updateProgress(); textInput.value=''; append('ИИ',`Обучено: ${s.length}`,'bot'); clearChat();}
async function trainFromURL(){
  const u=urlInput.value.trim(); if(!u){alert('URL?');return;}
  try{const res=await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(u));
    const data=await res.json();
    const doc=new DOMParser().parseFromString(data.contents,'text/html');
    const text=[...doc.querySelectorAll('p')].map(p=>p.textContent.trim()).join(' ');
    const s=sentences(text);
    s.forEach(x=>{knowledgeBase.push({request:x.toLowerCase(),answer:x});corpus.push(x);});
    saveAll(); updateProgress(); urlInput.value='';
    append('ИИ',`С URL обучено: ${s.length}`,'bot'); clearChat();}
  catch{alert('Ошибка URL');}}

/* ─── анализ ─── */
function analysis(){
  if(!corpus.length)return'Корпус пуст!';
  let total=0,freq={};
  corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u)
    .forEach(w=>{if(!w||stopW.has(w))return; total++; freq[w]=(freq[w]||0)+1;}));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return`Всего: ${corpus.length}\\nСредняя длина: ${avg}\\nТоп-10: ${top}`;}
function showAnalysis(){append('ИИ',analysis(),'bot'); hideSections(); clearChat();}

/* ─── чат-движок ─── */
const sim=(a,b)=>{const w1=a.split(/\\s+/),w2=b.split(/\\s+/);return w1.filter(x=>w2.includes(x)).length/Math.max(w1.length,w2.length);};
const kb=q=>{let best=null,s=0; knowledgeBase.forEach(e=>{const sc=sim(q,e.request); if(sc>s){s=sc; best=e;}}); return s>0.35?best.answer:null;};
async function ask(){
  const q=userInput.value.trim(); if(!q)return;
  userInput.value=''; append('Ты',q,'user');
  if(/^анализ( текста)?$/i.test(q)){append('ИИ',analysis(),'bot'); clearChat(); return;}
  if(q.includes(' - ')){const [req,ans]=q.split(' - ').map(s=>s.trim()); if(req&&ans){
    knowledgeBase.push({request:req.toLowerCase(),answer:ans}); saveAll(); updateProgress();
    append('ИИ','Запомнил!','bot'); clearChat();} return;}
  let ans=templateMatch(q.toLowerCase())||kb(q.toLowerCase());
  if(!ans){const wait=append('ИИ','⚙️ Думаю…','bot');
    ans=await neuralScript(`Напиши PowerShell-скрипт: ${q}`);
    wait.textContent=`ИИ: ${ans||'🤷 Не удалось сгенерировать'}`; return;}
  append('ИИ',ans,'bot');}

/* ─── export для меню ─── */
Object.assign(window,{showTrainText,showTrainURL,showAnalysis,
                      exportData,importData,clearMemory,
                      trainFromText,trainFromURL,
                      clearChat,ask,toggleTheme});
