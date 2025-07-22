/* helpers */
function toggleTheme(){document.body.classList.toggle('dark');}
const chat=document.getElementById('chat');
const aiBadge=document.getElementById('aiIndicator');
const append=(s,t,c)=>{const d=document.createElement('div');d.className=`msg ${c}`;d.textContent=`${s}: ${t}`;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d;};
const clearChat=()=>{chat.innerHTML='';};

/* templates */
const templates=[
  {p:/создать vhdx (?<size>\\d+(?:gb|mb)) в (?<path>.+)/i,
   f:({size,path})=>`# VHDX\n$vhd="${path}\\VirtualDisk.vhdx"\nNew-VHD -Path $vhd -SizeBytes ${size.toUpperCase()} -Dynamic\nMount-VHD -Path $vhd`},
  {p:/зашифровать диск (?<letter>[a-z]): с ключом в (?<keyPath>.+)/i,
   f:({letter,keyPath})=>`Enable-BitLocker -MountPoint "${letter.toUpperCase()}:"
 -RecoveryKeyPath "${keyPath}" -EncryptionMethod XtsAes256`},
  {p:/показать процессы/i,f:()=>`Get-Process | Sort-Object CPU -desc | Select -First 25`},
  {p:/убить процесс (?<name>\\S+)/i,f:({name})=>`Stop-Process -Name "${name}" -Force`}
];
const tmpl=q=>{for(const t of templates){const m=q.match(t.p);if(m)return t.f(m.groups||{});}return null;};

/* memory */
let knowledge=JSON.parse(localStorage.getItem('knowledgeBase')||'[]');
let corpus   =JSON.parse(localStorage.getItem('corpus')||'[]');
const save=()=>{localStorage.setItem('knowledgeBase',JSON.stringify(knowledge));
                localStorage.setItem('corpus',JSON.stringify(corpus));};

/* progress */
const TARGET=1000;const bar=document.getElementById('progress');
const updateBar=()=>{bar.textContent=Math.min(100,Math.round(corpus.length/TARGET*100/1000))+' %';};updateBar();

/* mini-GPT-2 */
let gpt=null;
async function load(){if(gpt)return;const{pipeline}=window.transformers;
  gpt=await pipeline('text-generation','Xenova/gpt2-small',{quantized:true});}
async function genPS(p){await load();
  const o=await gpt(p+'\n```powershell\n',{max_new_tokens:120,temperature:.3,stop:['```']});
  return o[0].generated_text.split('```powershell')[1]?.replace('```','')?.trim();}

/* training */
const stopW=new Set('и в во не что он на я ...'.split(' '));
const split=t=>t.split(/[.!?\\r?\\n]+/).map(s=>s.trim()).filter(Boolean);
function trainFromText(){
  const txt=document.getElementById('textInput').value.trim();if(!txt)return;
  const s=split(txt);s.forEach(x=>{knowledge.push({request:x.toLowerCase(),answer:x});corpus.push(x);});
  save();updateBar();append('ИИ',`Обучено: ${s.length}`,'bot');document.getElementById('textInput').value='';}
async function trainFromURL(){
  const url=document.getElementById('urlInput').value.trim();if(!url)return;
  try{const data=await(await fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url))).json();
    const text=[...new DOMParser().parseFromString(data.contents,'text/html').querySelectorAll('p')].map(p=>p.textContent.trim()).join(' ');
    const s=split(text);s.forEach(x=>{knowledge.push({request:x.toLowerCase(),answer:x});corpus.push(x);});
    save();updateBar();append('ИИ',`С URL обучено: ${s.length}`,'bot');document.getElementById('urlInput').value='';}
  catch{alert('Ошибка URL');}}

/* analysis */
function analysis(){
  if(!corpus.length)return'Корпус пуст!';
  let total=0,f={};corpus.forEach(s=>s.toLowerCase().split(/[^\\p{L}0-9]+/u).forEach(w=>{if(!w||stopW.has(w))return;total++;f[w]=(f[w]||0)+1;}));
  const avg=(total/corpus.length).toFixed(1);
  const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>`${w}(${c})`).join(', ');
  return`Всего: ${corpus.length}\\nСредняя длина: ${avg}\\nТоп-10: ${top}`;}
function showAnalysis(){append('ИИ',analysis(),'bot');}

/* backup */
function exportData(){const blob=new Blob([JSON.stringify({knowledge,corpus})],{type:'application/json'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'bot-memory.json'}).click();}
function importData(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=ev=>{try{const d=JSON.parse(ev.target.result);
    if(Array.isArray(d.knowledge)&&Array.isArray(d.corpus)){knowledge=d.knowledge;corpus=d.corpus;save();updateBar();append('ИИ','Память восстановлена!','bot');}}
    catch{alert('Неверный файл');}};r.readAsText(f);}
function clearMemory(){if(!confirm('Удалить все знания?'))return;
  knowledge=[];corpus=[];localStorage.clear();updateBar();clearChat();append('ИИ','Память очищена полностью','bot');}

/* chat */
function sim(a,b){const w1=a.split(/\\s+/),w2=b.split(/\\s+/);return w1.filter(x=>w2.includes(x)).length/Math.max(w1.length,w2.length);}
function kb(q){let best=null,s=0;knowledge.forEach(e=>{const sc=sim(q,e.request);if(sc>s){s=sc;best=e;}});return s>0.35?best.answer:null;}
async function ask(){
  const ta=document.getElementById('userInput'),q=ta.value.trim();if(!q)return;
  ta.value='';append('Ты',q,'user');
  if(/^анализ/i.test(q)){append('ИИ',analysis(),'bot');return;}
  if(q.includes(' - ')){const[req,ans]=q.split(' - ').map(s=>s.trim());if(req&&ans){
    knowledge.push({request:req.toLowerCase(),answer:ans});save();updateBar();append('ИИ','Запомнил!','bot');}return;}
  let ans=tmpl(q.toLowerCase())||kb(q.toLowerCase());
  if(!ans){const wait=append('ИИ','⚙️ Думаю…','bot');aiBadge.classList.remove('d-none');
    ans=await genPS(`Напиши PowerShell-скрипт: ${q}`);aiBadge.classList.add('d-none');
    wait.textContent=`ИИ: ${ans||'🤷 Не удалось сгенерировать'}`;return;}
  append('ИИ',ans,'bot');}

/* expose */
Object.assign(window,{trainFromText,trainFromURL,showAnalysis,exportData,importData,clearMemory,clearChat,ask,toggleTheme});

/* отправка Ctrl+Enter */
document.getElementById('userInput').addEventListener('keydown',e=>{
  if(e.key==='Enter' && e.ctrlKey){e.preventDefault();ask();}
});
