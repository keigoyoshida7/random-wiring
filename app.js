import { WiringEngine } from './engine.js';

const $ = id => document.getElementById(id);
const copy = {
  ja: {about:'この作品について ↗',parameters:'Parameters',time:'時間',speed:'生成速度',structure:'構造',componentCount:'要素数',elements:' elements',species:' types',density:'配線密度',persistence:'配線の寿命',lineWidth:'線の太さ',nodes:'端子',grid:'グリッド',motion:'自律的な変化',componentMotion:'部品の移動',boardMotion:'基板の変形',labels:'部品名を表示',inspectPart:'部品を選ぶ',selectPlaceholder:'すべての部品',view:'視点',perspective:'立体',plan:'平面',rotation:'回転速度',resetCamera:'視点を戻す',regenerate:'新しく生成する',terminal:'端子',connection:'配線',drawing:'生成中',drag:'回転',pan:'移動',zoom:'拡大',pauseShort:'一時停止',connections:' connections',generated:' generated',aboutBody:'電子部品と架空の機構が、群れ、渦、枝のような配置をつくり、またほどけていく。すべての要素が広い基板に取り付けられ、光の流れに応じて小さな機構が動きながら、回路全体が組み替わり続けます。',aboutControls:'要素数、配線密度、部品の移動、基板の変形を調整できます。名前のラベルを押すか一覧から選ぶと詳細が開きます。ドラッグで回転、ホイールやピンチで拡大。',shortcuts:'Space：一時停止 / R：再生成 / H：設定の表示・非表示 / F：全画面',pause:'一時停止',resume:'再開する',running:'生成中',paused:'一時停止中',saved:'書き出しました',failed:'書き出せませんでした',fullscreenFailed:'このブラウザでは全画面表示を利用できません',controlsLabel:'配線の設定',canvasLabel:'立体的な電子部品が移動し、基板が変形し続ける回路。部品名は画面のラベルか部品一覧から確認できます。',renderError:'3D表示を開始できませんでした。WebGLが使えるブラウザで開いてください。'},
  en: {about:'About this study ↗',parameters:'Parameters',time:'Time',speed:'Growth speed',structure:'Structure',componentCount:'Elements',elements:' elements',species:' types',density:'Wiring density',persistence:'Wire lifetime',lineWidth:'Line weight',nodes:'Terminals',grid:'Grid',motion:'Autonomous motion',componentMotion:'Component motion',boardMotion:'Board morphing',labels:'Component names',inspectPart:'Inspect a component',selectPlaceholder:'All components',view:'View',perspective:'Perspective',plan:'Plan',rotation:'Rotation speed',resetCamera:'Reset view',regenerate:'New circuit',terminal:'Terminal',connection:'Connection',drawing:'Drawing head',drag:'Rotate',pan:'Pan',zoom:'Zoom',pauseShort:'Pause',connections:' connections',generated:' generated',aboutBody:'Electronic components and imagined mechanisms form archipelagos, spirals and branching weaves, then dissolve into new arrangements. Every element is mounted to a wider board. Routing pulses animate small mechanisms as the circuit reorganizes along its surface.',aboutControls:'Adjust the population, wiring density, movement and board morphing. Click a name label, a 3D component or a list entry to inspect it. Drag to orbit; scroll or pinch to zoom.',shortcuts:'Space: pause / R: new circuit / H: show or hide controls / F: fullscreen',pause:'Pause',resume:'Resume',running:'Routing',paused:'Paused',saved:'Exported',failed:'Export failed',fullscreenFailed:'Fullscreen is unavailable in this browser',controlsLabel:'Circuit parameters',canvasLabel:'Solid three-dimensional components move on an autonomously morphing circuit board. Inspect their names using the labels or component list.',renderError:'The 3D view could not start. Please open this file in a browser with WebGL enabled.'}
};
let lang='ja', paused=false, currentView='perspective', lastStats={}, toastTimer, selectedPart=null, components=[], lastLabels=[], lastLabelTick=0;
const options={speed:1,density:1,persistence:75,lineWidth:0.65,rotation:0.25,nodes:true,grid:false,componentMotion:1,boardMotion:1,labels:true,componentCount:80};
const parameterKeys=['speed','density','persistence','lineWidth','rotation','componentMotion','boardMotion','componentCount'];
const labelNodes=new Map();
let stageSize={width:$('stage').clientWidth,height:$('stage').clientHeight};
new ResizeObserver(entries=>{const r=entries[0].contentRect;stageSize={width:r.width,height:r.height};}).observe($('stage'));
if(matchMedia('(prefers-reduced-motion: reduce)').matches){for(const key of ['rotation','componentMotion','boardMotion']){options[key]=0;$(key).value='0';}}
let engine;
try {
  engine=new WiringEngine($('wiring'),{
    onStats(stats){lastStats=stats;$('component-count').textContent=stats.componentCount??components.length;$('species-count').textContent=stats.speciesCount??new Set(components.map(p=>p.kind)).size;$('connection-count').textContent=Number(stats.connections||0).toLocaleString();$('total-count').textContent=Number(stats.totalConnections||0).toLocaleString();$('seed').textContent=stats.seed??'—';const t=Math.floor(stats.elapsed||0);$('elapsed').textContent=`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`;},
    onLabels:updateLabels,
    onInspect:renderInspector
  });
  engine.setOptions(options);engine.setView(currentView);components=engine.getComponents();
} catch(error) {
  const message=document.createElement('p');message.className='engine-error';message.textContent=copy[lang].renderError;$('stage').append(message);console.error(error);
}

function componentName(part){return (lang==='ja'?part.nameJa:part.name)||part.name||part.id;}
function updateLabels(items=[]){
  const now=performance.now();if(now-lastLabelTick<40)return;lastLabelTick=now;
  const seen=new Set(),placed=[];lastLabels=[];
  const candidates=items.filter(p=>p.visible!==false&&Number.isFinite(p.x)&&Number.isFinite(p.y));
  const compact=stageSize.width<600,budget=compact?10:18,chosen=new Set(),cycle=Math.floor((lastStats.elapsed||0)/6);
  if(selectedPart)chosen.add(selectedPart.id);
  if(candidates.length<=budget){for(const p of candidates)chosen.add(p.id);}
  else {
    const offset=cycle*budget%candidates.length,points=[];
    const selected=candidates.find(p=>p.id===selectedPart?.id);if(selected)points.push(selected);
    for(const separation of [compact?45:90,compact?25:55,0]){
      for(let i=0;i<candidates.length&&chosen.size<budget;i++){
        const p=candidates[(offset+i)%candidates.length];if(chosen.has(p.id))continue;
        if(points.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>=separation)){chosen.add(p.id);points.push(p);}
      }
    }
  }
  const sorted=[...items].sort((a,b)=>(b.id===selectedPart?.id)-(a.id===selectedPart?.id)||a.y-b.y);
  const offsets=[[0,0],[-35,0],[35,0],[0,-24],[-65,-15],[65,-15],[0,28],[-45,30],[45,30],[-90,-35],[90,-35],[0,-48],[-75,50],[75,50],[0,52]];
  for(const part of sorted){
    seen.add(part.id);let item=labelNodes.get(part.id);
    if(!item){const button=document.createElement('button');button.className='part-label';button.setAttribute('aria-pressed','false');const id=document.createElement('small'),name=document.createElement('span');button.append(id,name);button.addEventListener('click',()=>engine?.selectComponent(selectedPart?.id===part.id?null:part.id));$('part-labels').append(button);const guide=document.createElementNS('http://www.w3.org/2000/svg','line');$('label-guides').append(guide);item={button,id,name,guide};labelNodes.set(part.id,item);}
    const visible=options.labels&&chosen.has(part.id)&&part.visible!==false&&Number.isFinite(part.x)&&Number.isFinite(part.y);item.button.hidden=!visible;item.guide.style.display=visible?'':'none';if(!visible)continue;
    const name=componentName(part),text=`${part.id} ${name}`;
    item.id.textContent=part.id;item.name.textContent=name;item.name.hidden=compact;item.button.title=`${text}${part.value?' · '+part.value:''}`;item.button.setAttribute('aria-label',item.button.title);item.button.setAttribute('aria-pressed',String(selectedPart?.id===part.id));
    const width=compact?29:Math.min(180,Math.max(55,text.length*(lang==='ja'?7.5:4.7)+12)),height=19;
    let best={cost:Infinity,x:part.x,y:part.y};
    for(const [dx,dy] of offsets){
      const x=Math.max(width/2+5,Math.min(stageSize.width-width/2-5,part.x+dx)),y=Math.max(40,Math.min(stageSize.height-83,part.y-13+dy));
      let overlap=0;for(const q of placed){const ox=(q.width+width)/2+4-Math.abs(q.x-x),oy=height+4-Math.abs(q.y-y);if(ox>0&&oy>0)overlap+=ox*oy;}
      const cost=overlap*1000+Math.hypot(x-part.x,y-(part.y-13));if(cost<best.cost)best={cost,x,y};
    }
    const {x,y}=best;placed.push({x,y,width});item.button.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    item.guide.setAttribute('x1',part.x);item.guide.setAttribute('y1',part.y);item.guide.setAttribute('x2',x);item.guide.setAttribute('y2',y+2);item.guide.style.opacity=Math.hypot(x-part.x,y-part.y)>25?'.5':'0';
    lastLabels.push({x,y,text,width});
  }
  for(const [id,item]of labelNodes)if(!seen.has(id)){item.button.hidden=true;item.guide.style.display='none';}
}
function renderInspector(part){selectedPart=part||null;$('part-inspector').hidden=!part;if(part){$('part-id').textContent=part.id;$('part-name').textContent=componentName(part);$('part-value').textContent=part.value||part.kind||'';}$('part-select').value=part?.id||'';for(const [id,item]of labelNodes)item.button.setAttribute('aria-pressed',String(id===part?.id));}
function updateComponentList(){const previous=$('part-select').value;$('part-select').replaceChildren();const first=document.createElement('option');first.value='';first.textContent=copy[lang].selectPlaceholder;$('part-select').append(first);for(const part of components){const option=document.createElement('option');option.value=part.id;option.textContent=`${part.id} — ${componentName(part)}`;$('part-select').append(option);}$('part-select').value=previous;}
function setLang(next){lang=next;document.documentElement.lang=lang;document.querySelectorAll('[data-i18n]').forEach(el=>{const value=copy[lang][el.dataset.i18n];if(value!==undefined)el.textContent=value;});$('lang-en').setAttribute('aria-pressed',String(lang==='en'));$('lang-jp').setAttribute('aria-pressed',String(lang==='ja'));$('controls').setAttribute('aria-label',copy[lang].controlsLabel);$('wiring').setAttribute('aria-label',copy[lang].canvasLabel);document.querySelector('[data-i18n="drag"]').textContent=copy[lang][currentView==='plan'?'pan':'drag'];for(const key of parameterKeys)$(key).setAttribute('aria-label',copy[lang][key]);$('part-select').setAttribute('aria-label',copy[lang].inspectPart);$('pause-label').textContent=copy[lang][paused?'resume':'pause'];$('status-label').textContent=copy[lang][paused?'paused':'running'];engine?.setLanguage?.(lang);updateComponentList();renderInspector(selectedPart);}
function updateOutput(key){const value=options[key];$(`${key}-value`).textContent=key==='componentCount'?`${Math.round(value)}`:key==='persistence'?`${Math.round(value)} s`:key==='lineWidth'?value.toFixed(2):`${value.toFixed(2)}×`;$(key).setAttribute('aria-valuetext',$(`${key}-value`).textContent);}
for(const key of parameterKeys){$(key).addEventListener('input',()=>{options[key]=key==='speed'?Math.min(12,Math.max(.05,10**Number($(key).value))):Number($(key).value);if(key!=='componentCount')engine?.setOptions({[key]:options[key]});updateOutput(key);});updateOutput(key);}
$('componentCount').addEventListener('change',()=>{engine?.setOptions({componentCount:options.componentCount});components=engine?.getComponents()||[];updateComponentList();renderInspector(null);});
for(const key of ['nodes','grid','labels'])$(key).addEventListener('click',()=>{options[key]=!options[key];$(key).setAttribute('aria-pressed',String(options[key]));engine?.setOptions({[key]:options[key]});if(key==='labels')$('part-labels').hidden=!options.labels;});
function setPaused(next){paused=next;engine?.setPaused(paused);$('pause').setAttribute('aria-pressed',String(paused));$('pause-label').textContent=copy[lang][paused?'resume':'pause'];$('pause-symbol').textContent=paused?'▷':'Ⅱ';$('status-label').textContent=copy[lang][paused?'paused':'running'];$('status-dot').classList.toggle('paused',paused);}
$('pause').addEventListener('click',()=>setPaused(!paused));
for(const view of ['perspective','plan'])$(view).addEventListener('click',()=>{currentView=view;engine?.setView(view);for(const v of ['perspective','plan'])$(v).setAttribute('aria-pressed',String(v===view));$('view-label').textContent=view==='plan'?'2D / PLAN':'3D / PERSPECTIVE';$('rotation').disabled=view==='plan';document.querySelector('[data-i18n="drag"]').textContent=copy[lang][view==='plan'?'pan':'drag'];});
function showControls(show){document.body.classList.toggle('controls-hidden',!show);$('panel-open').hidden=show;}
$('panel-close').addEventListener('click',()=>showControls(false));$('panel-open').addEventListener('click',()=>showControls(true));if(matchMedia('(max-width:760px)').matches)showControls(false);
$('part-select').addEventListener('change',()=>engine?.selectComponent($('part-select').value||null));$('inspector-close').addEventListener('click',()=>engine?.selectComponent(null));
function reset(){engine?.reset();components=engine?.getComponents()||[];updateComponentList();renderInspector(null);}
$('reset').addEventListener('click',reset);$('reset-camera').addEventListener('click',()=>engine?.fit());$('zoom-in').addEventListener('click',()=>engine?.zoomBy(1.18));$('zoom-out').addEventListener('click',()=>engine?.zoomBy(1/1.18));$('lang-en').addEventListener('click',()=>setLang('en'));$('lang-jp').addEventListener('click',()=>setLang('ja'));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast(copy[lang].fullscreenFailed);}catch{toast(copy[lang].fullscreenFailed);}}
$('fullscreen').addEventListener('click',fullscreen);document.addEventListener('fullscreenchange',()=>$('fullscreen').setAttribute('aria-pressed',String(!!document.fullscreenElement)));
const dialog=$('about-dialog');$('about-open').addEventListener('click',()=>dialog.showModal());$('about-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function download(blob,extension){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`random-wiring-${lastStats.seed||'circuit'}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(copy[lang].saved);}
$('save-png').addEventListener('click',()=>{try{const source=$('wiring'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);const scale=source.width/stageSize.width;ctx.scale(scale,scale);if(options.labels)for(const label of lastLabels){ctx.font='9px Georgia, "Yu Mincho", serif';ctx.textAlign='center';ctx.fillStyle='#050505dd';ctx.fillRect(label.x-label.width/2,label.y-17,label.width,18);ctx.fillStyle='#d0d0d0';ctx.fillText(label.text,label.x,label.y-5);}canvas.toBlob(blob=>blob?download(blob,'png'):toast(copy[lang].failed),'image/png');}catch{toast(copy[lang].failed);}});
$('save-svg').addEventListener('click',()=>{try{const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));const text=options.labels?lastLabels.map(p=>`<text x="${p.x.toFixed(1)}" y="${(p.y-5).toFixed(1)}" text-anchor="middle" font-size="9" font-family="Georgia,serif" fill="#ddd">${escape(p.text)}</text>`).join(''):'';const svg=engine.exportSVG().replace(/<text\b[\s\S]*?<\/text>/g,'').replace('</svg>',text+'</svg>');download(new Blob([svg],{type:'image/svg+xml'}),'svg');}catch{toast(copy[lang].failed);}});
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||dialog.open||e.target.matches('input,select,textarea,button,a,[contenteditable=true]'))return;if(e.code==='Space'){e.preventDefault();setPaused(!paused);}else if(e.key.toLowerCase()==='r')reset();else if(e.key.toLowerCase()==='h')showControls(document.body.classList.contains('controls-hidden'));else if(e.key.toLowerCase()==='f')fullscreen();});
window.addEventListener('pagehide',event=>{if(!event.persisted)engine?.destroy();});
setLang(lang);
