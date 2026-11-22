import {dft,realDft,evaluate,chainTip,axisEnvelope,xyLayout} from './fourier.mjs';
import {xdog, styleParameters, thresholdSketch} from './lineart.mjs';
import {modelLineArt,cancelLineArt} from './ml-client.mjs';
import {formulaBody, latexDocument, limitChains} from './portrait.mjs';
import {encodePortrait,decodePortrait,cleanName,SHARE_BASE} from './share.mjs';
import {renderSocialCard} from './card.mjs';
import {analyzeSketch} from './path.mjs';
import {portraitInk,samplePortrait,closeStrokeSeams,visitorInk} from './portrait-render.mjs';
import {shouldReloadForHash} from './navigation.mjs';
import {getPalette,normalizePalette} from './palettes.mjs';
import {featureRegions} from './portrait-preprocess.mjs';
import {tintSketch,sketchReveal} from './sketch.mjs';

const $ = id => document.getElementById(id);
let palette='ink';
const colors=()=>getPalette(palette),drawingInk=()=>portraitInk(palette);
function applyPalette(value){
  palette=normalizePalette(value);document.body.dataset.palette=palette;
  document.documentElement.style.background=colors().background;
  $('card-palette').value=palette;document.querySelector('meta[name="theme-color"]').content=colors().background;
}
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const trail = document.createElement('canvas'); trail.width = trail.height = 900;
const ink = trail.getContext('2d'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
const samples = [
  ['fourier','傅里叶','Fourier2.jpg'],['einstein','爱因斯坦','Albert_Einstein_Head.jpg'],
  ['newton','牛顿','GodfreyKneller-IsaacNewton-1689.jpg'],['curie','居里夫人','Marie_Curie_c1920.jpg'],
  ['euler','欧拉','Leonhard_Euler.jpg'],['gauss','高斯','Carl_Friedrich_Gauss_1840_by_Jensen.jpg'],
];
let coefficients = [], active = [], path = [], picture = null, sketch = null;
let tinted=null,tintedPalette='',resultView='overlay';
function sketchSurface(){if(sketch&&(!tinted||tintedPalette!==palette)){tinted=tintSketch(sketch,palette);tintedPalette=palette;}return tinted;}
let xCoefficients = [], yCoefficients = [], activeX = [], activeY = [];
let mode = 'xy', plot = {x:450,y:450,scale:1}, topChain = {x:450,y:150}, leftChain = {x:150,y:450};
let automatic = null, manual = false;
let shared = false, cardSurface = null, cardPayload = null, cardGeneration = 0;
let sharedName = '', sharedGuess = false, scrubPending = false;
let surfaceRatio=1,sharedWidth=900;
let currentSampleId = '';
let automaticBounds = null;
let dimensions = {width:360,height:360}, scale = 1, time = 0, drawn = 0;
let stage = 'landing', view = 'fourier', stageTime = 0, playing = true, last = 0, generation = 0, isDemo = true, busy = false;
let sourceName = '示例 / 傅里叶', strokeCount = 0;
let cropStart = null, cropEnd = null, cropping = false;
const resolution = 6000;

function setView(next) {
  view = next;
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === next));
}

function setStage(next) {
  stage = next; stageTime = 0; document.body.dataset.stage = next;
  $('personal-formula').hidden=next!=='result';
  $('result-views').hidden=next!=='result'||shared;
  if(next==='result'&&!shared){plot={x:450,y:450,scale};ink.clearRect(0,0,900,900);drawn=0;drawTrail(resolution);setResultView('overlay');}
  if(next==='result')previewFormula();
  for (const [id, on] of [['step-sketch',next==='sketch'],['step-draw',next==='reveal'||next==='drawing'],['step-result',next==='result']]) $(id).classList.toggle('active',on);
  const content = {
    sketch:['01 / THE IMAGE BECOMES INK','光影落纸，<br><em>留下你的神态。</em>','发丝与明暗，由素描留住。<br>轮廓交给圆周，再慢慢画一遍。','照片 → 人像素描'],
    reveal:['02 / THE ORBITS AWAKEN','每一条线，<br><em>都有回响。</em>','笔画化作复数，圆周渐渐苏醒。<br>下一刻，它们将为你重新相遇。','沿笔画采样 · 圆周即将苏醒'],
    drawing:['02 / THE ORBITS AWAKEN','让时间，<br><em>慢慢画出你。</em>','大圆勾勒轮廓，小圆拾起细节。<br>沿着光点，看简单如何叠加成复杂。','旋转的尽头，是你的轮廓'],
    result:['03 / A MOMENT, PRESERVED','此刻，<br><em>留在圆周之间。</em>','无数个圆，终于相遇成一个你。<br>把这一刻带走，或再看星轨走过一遍。','每一笔，都是圆的回声'],
  }[next];
  if (content) { $('chapter').textContent=content[0];$('heading').innerHTML=content[1];$('story').innerHTML=content[2];$('lens-note').textContent=content[3]; }
  if(shared){
    const hiddenName=sharedGuess&&next!=='result';
    $('heading').textContent=hiddenName?'猜猜这是谁？':sharedName?sharedGuess?`${sharedName}，原来是你。`:`${sharedName}的傅里叶肖像`:'一份写在圆周里的肖像';
    $('heading').classList.toggle('name-revealed',sharedGuess&&next==='result');
    $('source-label').textContent=hiddenName?'圆周正在保守秘密':sharedName||'分享的傅里叶肖像';
    $('shared-controls').hidden=next!=='result';
  }
  if(shared&&next==='result'){
    plot={x:450,y:450,scale};drawSharedPortrait();
    $('lens-note').textContent='完整素描保存在 TA 的卡片里';
    $('story').textContent='这是由数学系数重建的肖像。完整素描保存在 TA 的卡片里。';
  }
  if(next==='sketch') setView('sketch');
  if(next==='reveal'||next==='drawing'||next==='result') setView('fourier');
  $('play').textContent = playing ? 'Ⅱ 暂停绘制' : '▷ 继续绘制';
}

function reset(reveal = false) {
  const count=Number($('terms').value);
  active = coefficients.slice(0,manual?count:automatic?.complex.count); time=0;drawn=0;playing=true;
  activeX=xCoefficients.slice(0,manual?count:automatic?.x.count);activeY=yCoefficients.slice(0,manual?count:automatic?.y.count);
  layout();readout();
  if(shared){const count=mode==='xy'?activeX.length+activeY.length:active.length;$('shared-terms').value=String(count);$('shared-count').value=`${count} / ${count} 个圆`;}
  ink.clearRect(0,0,900,900);$('terms-value').value=mode==='xy'?`X ${activeX.length} / Y ${activeY.length}`:String(active.length);
  if(!manual)$('terms').value=String(mode==='xy'?Math.max(activeX.length,activeY.length):active.length);
  if(automatic){
    const choices=mode==='xy'?[automatic.x,automatic.y]:[automatic.complex];
    $('auto-label').textContent=`${manual?'手动调整 · ':''}自动 N = ${mode==='xy'?`X ${automatic.x.count} / Y ${automatic.y.count}`:automatic.complex.count}（保留 ${(Math.min(...choices.map(c=>c.energy))*100).toFixed(2)}% 能量，平均误差 ≤ ${Math.max(...choices.map(c=>c.error)).toFixed(2)}px）`;
  }
  $('restore-auto').hidden=!manual;
  if(!isDemo) setStage(reveal ? 'sketch' : 'drawing');
}

function layout() {
  plot={x:450,y:450,scale};
  if(mode!=='xy')return;
  const X=!manual&&automaticBounds?automaticBounds.x:axisEnvelope(activeX),Y=!manual&&automaticBounds?automaticBounds.y:axisEnvelope(activeY);
  const positioned=xyLayout(dimensions,X,Y);plot=positioned.plot;topChain=positioned.top;leftChain=positioned.left;
}

function readout() {
  const groups=mode==='xy'?[['X',xCoefficients],['Y',yCoefficients]]:[['c',coefficients]];
  $('coefficients').replaceChildren(...groups.flatMap(([label,values])=>values.slice(0,mode==='xy'?2:4).map(c=>{
    const span=document.createElement('span');span.textContent=`${label}: r = ${c.amplitude.toFixed(2)}`;
    const small=document.createElement('small');small.textContent=`k = ${c.k>=0?'+':''}${c.k} · φ ${c.phase.toFixed(2)}`;span.append(small);return span;
  })));
}

function pen(t) {
  const p=mode==='xy'?{x:chainTip(activeX,t).x,y:chainTip(activeY,t,Math.PI/2).y}:evaluate(active,t);
  return {x:plot.x+p.x*plot.scale,y:plot.y+p.y*plot.scale};
}

function install(result, image, name, demo) {
  cropping=false;cropStart=cropEnd=null;canvas.classList.remove('cropping');
  ({path,sketch,dimensions,strokeCount}=result);tinted=null;picture=image;sourceName=name;isDemo=demo;
  coefficients=result.coefficients;$('terms').max=String(coefficients.length);
  xCoefficients=result.x;yCoefficients=result.y;
  scale=590/Math.max(dimensions.width,dimensions.height);
  automatic=result.automatic;automaticBounds=result.bounds;manual=false;
  reset(!demo);$('source-label').textContent=name;
  $('status').textContent=demo ? '示例 / 傅里叶 · 由他的圆，画出他本人' : `${strokeCount} 条笔画 · ${path.length} 个等距采样点 · 全程本地`;
}

async function prepare(image,sampleId,token) {
  const started=performance.now(),style=$('model-style').value;
  const work=document.createElement('canvas'), ratio=Math.min(1,400/Math.max(image.naturalWidth,image.naturalHeight));
  work.width=Math.max(4,Math.round(image.naturalWidth*ratio));work.height=Math.max(4,Math.round(image.naturalHeight*ratio));
  const wc=work.getContext('2d',{willReadFrequently:true});wc.fillStyle='#fff';wc.fillRect(0,0,work.width,work.height);wc.drawImage(image,0,0,work.width,work.height);
  let binary,renderer='XDoG',fallback=false,face=null,landmarks=[],displaySketch=null,sketchFallback=false;
  if(style!=='classic')try{
    let gray;
    if(sampleId){
      const precomputed=new Image();precomputed.src=`samples/${sampleId}-${style}.png`;await precomputed.decode();
      const ratio=Math.min(1,400/Math.max(precomputed.naturalWidth,precomputed.naturalHeight));work.width=Math.max(4,Math.round(precomputed.naturalWidth*ratio));work.height=Math.max(4,Math.round(precomputed.naturalHeight*ratio));
      try{const metadata=await (await fetch('samples/portraits.json')).json();face=metadata[sampleId]?.face||null;landmarks=metadata[sampleId]?.landmarks||[];}catch{}
      const preview=document.createElement('canvas');preview.width=work.width;preview.height=work.height;const pc=preview.getContext('2d',{willReadFrequently:true});pc.drawImage(precomputed,0,0,work.width,work.height);
      const rgba=pc.getImageData(0,0,work.width,work.height).data;gray=Uint8Array.from({length:work.width*work.height},(_,i)=>rgba[i*4]);
      renderer=style==='anime'?'预绘素描线稿':'预绘清晰轮廓';
    }else{
      if(token===generation)$('use-classic').hidden=false;
      const result=await modelLineArt(image,style,progress=>{if(token===generation)$('status').textContent=progress.message||(progress.inference?'模型正在静静描线…':`正在准备${progress.model||'描线模型'}… ${progress.progress}%${progress.cached?' · 已缓存':''}`);});
      if(token===generation)$('use-classic').hidden=true;
      gray=result.gray;face=result.face;landmarks=result.landmarks;work.width=result.width;work.height=result.height;renderer=style==='anime'?'AI 素描线稿':'AI 清晰轮廓';
      sketchFallback=result.sketchFallback;displaySketch=graySurface(result.sketch||{gray,width:result.width,height:result.height});
    }
    binary=thresholdSketch(gray,work.width,work.height,Number($('detail').value),Number($('style').value),featureRegions(landmarks,face));
  }catch{fallback=true;renderer='XDoG';}
  if(sampleId)try{const image=new Image();image.src=`samples/${sampleId}-u2.png`;await image.decode();displaySketch=document.createElement('canvas');displaySketch.width=image.naturalWidth;displaySketch.height=image.naturalHeight;displaySketch.getContext('2d').drawImage(image,0,0);}catch{sketchFallback=true;}
  if(!binary)binary=xdog(wc.getImageData(0,0,work.width,work.height).data,work.width,work.height,styleParameters(Number($('style').value),Number($('detail').value)));
  const minLength=(renderer==='XDoG'?8:18)-Number($('detail').value)*(renderer==='XDoG'?.08:.16);
  const analysis=await analyze(binary,work.width,work.height,minLength,renderer!=='XDoG',face,landmarks),{strokes}=analysis;
  wc.fillStyle='#fff';wc.fillRect(0,0,work.width,work.height);wc.strokeStyle='#161512';wc.lineWidth=1.15;wc.lineJoin='round';wc.lineCap='round';
  for(const stroke of strokes){wc.beginPath();wc.moveTo(stroke[0].x,stroke[0].y);for(const p of stroke.slice(1))wc.lineTo(p.x,p.y);wc.stroke();}
  return {...analysis,sketch:displaySketch||work,dimensions:{width:work.width,height:work.height},strokeCount:strokes.length,renderer,fallback,sketchFallback,elapsed:Math.round(performance.now()-started)};
}

function graySurface({gray,width,height}){
  const surface=document.createElement('canvas');surface.width=width;surface.height=height;const context=surface.getContext('2d'),pixels=context.createImageData(width,height);
  for(let i=0;i<gray.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=gray[i];pixels.data[i*4+3]=255;}context.putImageData(pixels,0,0);return surface;
}

function analyze(binary,width,height,minLength,portrait,face,landmarks){
  if(!globalThis.Worker)return Promise.resolve(analyzeSketch(binary,width,height,minLength,portrait,face,landmarks));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./path-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.result);};
    worker.onerror=event=>{event.preventDefault();worker.terminate();reject(Error('线条处理失败，请重试。'));};
    worker.postMessage({binary,width,height,minLength,portrait,face,landmarks},[binary.buffer]);
  });
}

function showError(message) { $('error').textContent=message;$('error').hidden=false; }

async function focusStage(token) {
  const top=Math.min($('heading').getBoundingClientRect().top,document.querySelector('.instrument').getBoundingClientRect().top);
  const target=Math.max(0,Math.min(scrollY+top-24,document.documentElement.scrollHeight-innerHeight));
  scrollTo({top:target,behavior:reduced.matches?'instant':'smooth'});
  if(reduced.matches)return;
  await new Promise(resolve=>{
    const deadline=performance.now()+1800;
    function settled(){
      if(token!==generation||Math.abs(scrollY-target)<1||performance.now()>deadline)resolve();
      else requestAnimationFrame(settled);
    }
    requestAnimationFrame(settled);
  });
}

async function loadImage(source,name,demo=false,sampleId='') {
  const token=++generation;busy=true;$('error').hidden=true;$('status').textContent='正在本地将照片化作线条…';
  try {
    const image=source instanceof HTMLImageElement?source:new Image();
    if(typeof source==='string'){image.src=source;await image.decode();}
    await new Promise(resolve=>setTimeout(resolve,40));if(token!==generation)return;
    const result=await prepare(image,sampleId,token);if(token!==generation)return;
    currentSampleId=sampleId;
    install(result,image,name,demo);
    $('status').textContent+=` · ${result.renderer} · ${result.elapsed}ms`;
    if(!result.fallback&&!result.sketchFallback&&(sampleId||$('model-style').value!=='classic'))$('status').textContent+=' · U²-Net 人像素描';
    if(result.fallback)$('status').textContent+=' · 模型暂未就绪，已切换经典算法';
    else if(result.sketchFallback)$('status').textContent+=' · 素描暂不可用，已保留轮廓';
    for(const button of document.querySelectorAll('[data-sample]'))button.setAttribute('aria-pressed',String(button.dataset.sample===sampleId));
    if(!demo)await focusStage(token);
  } catch(error) {
    if(token===generation){showError(error.message.startsWith('未找到')?error.message:'无法读取图片。请选择有效的 JPG / PNG，或尝试较小的照片。');$('status').textContent=picture?'上一幅作品仍为你保留。':'请选择照片，或试试下方名人肖像。';}
  } finally {if(token===generation){busy=false;$('use-classic').hidden=true;}}
}

async function upload(file) {
  if(!file)return;
  if(!['image/jpeg','image/png'].includes(file.type)){showError('请选择 JPG 或 PNG 格式的图片。');return;}
  const url=URL.createObjectURL(file);try{await loadImage(url,file.name);}finally{URL.revokeObjectURL(url);}
}

for(const [id,name,file] of samples) {
  const button=document.createElement('button');button.className='sample';button.dataset.sample=id;button.setAttribute('aria-pressed',String(id==='fourier'));
  const img=document.createElement('img');img.src=`samples/${id}-thumb.jpg`;img.alt='';img.width=52;img.height=52;button.append(img,document.createTextNode(name));
  button.addEventListener('click',()=>loadImage(`samples/${id}.jpg`,`示例 / ${name}`,false,id));$('samples').append(button);
  const link=document.createElement('a');link.href=`https://commons.wikimedia.org/wiki/File:${file}`;link.textContent=`${name} ↗`;link.target='_blank';link.rel='noreferrer';$('credits').append(link);
}
for(const id of ['choose','change'])$(id).addEventListener('click',()=>$('upload').click());
$('upload').addEventListener('change',e=>{upload(e.target.files[0]);e.target.value='';});
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('observatory').classList.add('dragging');}});
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('observatory').classList.remove('dragging');}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('observatory').classList.remove('dragging');upload(e.dataTransfer.files[0]);});
for(const id of ['style','detail']){
  $(id).addEventListener('input',()=>{$(`${id}-value`).value=$(id).value;});
  $(id).addEventListener('change',()=>{if(picture)loadImage(picture,sourceName,false,currentSampleId);});
}
$('model-style').addEventListener('change',()=>{if(picture)loadImage(picture,sourceName,false,currentSampleId);});
$('use-classic').addEventListener('click',()=>{$('model-style').value='classic';cancelLineArt();});
$('terms').addEventListener('input',()=>{if(coefficients.length){manual=true;isDemo=false;reset();}});
$('restore-auto').addEventListener('click',()=>{manual=false;isDemo=false;reset();});
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{
  mode=button.dataset.mode;
  manual=false;
  for(const choice of document.querySelectorAll('[data-mode]'))choice.setAttribute('aria-pressed',String(choice===button));
  if(coefficients.length){isDemo=false;reset();setView('fourier');}
});
$('speed').addEventListener('input',()=>{$('speed-value').value=`${Number($('speed').value).toFixed(1)}×`;});
$('play').addEventListener('click',()=>{playing=!playing;$('play').textContent=playing?'Ⅱ 暂停绘制':'▷ 继续绘制';});
$('replay').addEventListener('click',()=>{isDemo=false;reset();});
$('skip').addEventListener('click',()=>{time=1;drawTrail(resolution);setStage('result');});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>setView(button.dataset.view));
function setResultView(value){resultView=value;for(const button of document.querySelectorAll('[data-result-view]'))button.setAttribute('aria-pressed',String(button.dataset.resultView===value));}
for(const button of document.querySelectorAll('[data-result-view]'))button.addEventListener('click',()=>{setResultView(button.dataset.resultView);setView('fourier');});
$('formula-link').addEventListener('click',()=>{$('formula-details').open=true;});
$('credits-link').addEventListener('click',()=>{$('sample-credits').open=true;});
$('crop').addEventListener('click',()=>{
  if(!picture||busy)return;
  cropping=!cropping;cropStart=cropEnd=null;canvas.classList.toggle('cropping',cropping);
  if(cropping){setView('photo');playing=false;$('play').textContent='▷ 继续绘制';$('status').textContent='在原图上拖选要保留的肖像区域；再次点击调整取景可取消。';canvas.scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'});}
});
function cropPoint(event){
  const rect=canvas.getBoundingClientRect(),{width:w,height:h}=photoFrame();
  return {x:Math.max(450-w/2,Math.min(450+w/2,(event.clientX-rect.left)/rect.width*900)),y:Math.max(450-h/2,Math.min(450+h/2,(event.clientY-rect.top)/rect.height*900))};
}
canvas.addEventListener('pointerdown',event=>{if(cropping){event.preventDefault();cropStart=cropEnd=cropPoint(event);canvas.setPointerCapture(event.pointerId);}});
canvas.addEventListener('pointermove',event=>{if(cropping&&cropStart)cropEnd=cropPoint(event);});
canvas.addEventListener('pointercancel',()=>{cropStart=cropEnd=null;});
canvas.addEventListener('pointerup',async event=>{
  if(!cropping||!cropStart)return;
  cropEnd=cropPoint(event);const x=Math.min(cropStart.x,cropEnd.x),y=Math.min(cropStart.y,cropEnd.y),w=Math.abs(cropStart.x-cropEnd.x),h=Math.abs(cropStart.y-cropEnd.y);
  cropStart=cropEnd=null;
  if(w<35||h<35){showError('取景区域太小，请重新拖选。');return;}
  const frame=photoFrame(),factor=picture.naturalWidth/frame.width,cropCanvas=document.createElement('canvas');
  cropCanvas.width=Math.round(w*factor);cropCanvas.height=Math.round(h*factor);
  cropCanvas.getContext('2d').drawImage(picture,(x-450+frame.width/2)*factor,(y-450+frame.height/2)*factor,w*factor,h*factor,0,0,cropCanvas.width,cropCanvas.height);
  await loadImage(cropCanvas.toDataURL('image/png'),`${sourceName.replace(/ · 已取景$/,'')} · 已取景`);
});
function download(surface,name) {const a=document.createElement('a');a.download=name;a.href=surface.toDataURL('image/png');a.click();}
function currentChains(){return {x:activeX,y:activeY,complex:active};}
function previewFormula(){
  const body=formulaBody(mode,currentChains(),8);
  $('formula-preview').textContent=body;
  if(window.katex)window.katex.render(body,$('formula-preview'),{throwOnError:false,displayMode:true});
  $('formula-count').textContent=`${mode==='xy'?`X ${activeX.length} 项 / Y ${activeY.length} 项`:`${active.length} 项`} · ${$('auto-label').textContent} · 下载完整系数，预览每链前 8 项；请使用 XeLaTeX 编译。`;
  $('formula-status').textContent='';
}
async function createCard(){
  const token=++cardGeneration;$('card-status').textContent='正在点亮你的分享卡片…';
  for(const id of ['save-card','system-share','copy-link'])$(id).disabled=true;
  try{
    await document.fonts.ready;await Promise.all(['24px KaTeX_Main','italic 24px KaTeX_Math','36px KaTeX_Size2'].map(font=>document.fonts.load(font)));await new Promise(resolve=>requestAnimationFrame(resolve));
    if(token!==cardGeneration)return;
    const snapshot={mode,chains:currentChains(),path,dimensions,name:cleanName($('card-name').value),guess:$('card-guess').checked,palette};
    const payload=encodePortrait(snapshot,SHARE_BASE);
    const card=renderSocialCard({...snapshot,sketch:sketchSurface(),energy:payload.energy,shareURL:payload.url},$('card-format').value);
    cardSurface=card.canvas;cardPayload=payload;$('card-preview').src=cardSurface.toDataURL('image/png');$('share-url').value=payload.url;
    $('card-status').textContent=`${payload.url.length} 字符 · QR v${card.qrVersion} · 分享 ${payload.terms.filter(Boolean).join(' / ')} 项 · 保留 ${(payload.energy*100).toFixed(1)}% 能量`;
    for(const id of ['save-card','system-share','copy-link'])$(id).disabled=false;
  }catch(error){$('card-status').textContent=error.message;}
}
$('open-card').addEventListener('click',()=>{$('card-dialog').showModal();createCard();});
$('close-card').addEventListener('click',()=>$('card-dialog').close());
for(const id of ['card-name','card-format','card-guess'])$(id).addEventListener('change',createCard);
$('card-palette').addEventListener('change',()=>{
  applyPalette($('card-palette').value);const target=drawn;ink.clearRect(0,0,900,900);drawn=0;drawTrail(target);createCard();
});
$('shared-terms').addEventListener('input',()=>{
  if(!shared||stage!=='result'||scrubPending)return;
  scrubPending=true;requestAnimationFrame(()=>{
    scrubPending=false;if(stage!=='result')return;
    const selected=limitChains(mode,{x:xCoefficients,y:yCoefficients,complex:coefficients},Number($('shared-terms').value));
    activeX=selected.x;activeY=selected.y;active=selected.complex;
    const count=mode==='xy'?activeX.length+activeY.length:active.length;$('shared-count').value=`${count} / ${$('shared-terms').max} 个圆`;
    drawSharedPortrait();
  });
});
$('save-card').addEventListener('click',()=>{if(cardSurface)download(cardSurface,`fourier-card-${$('card-format').value}.png`);});
async function copyLink(){
  try{await navigator.clipboard.writeText(cardPayload.url);$('card-status').textContent='分享链接已复制。';}
  catch{$('share-url').focus();$('share-url').select();$('card-status').textContent='请长按或手动复制选中的链接。';}
}
$('copy-link').addEventListener('click',copyLink);
$('system-share').addEventListener('click',async()=>{
  if(!cardSurface)return;
  const blob=await new Promise(resolve=>cardSurface.toBlob(resolve,'image/png'));
  const file=new File([blob],'fourier-portrait-card.png',{type:'image/png'});
  if(navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:'我的傅里叶公式'});}catch(error){if(error.name!=='AbortError')await copyLink();}
  }else await copyLink();
});
$('download-formula').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([latexDocument(mode,currentChains())],{type:'application/x-tex;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='fourier-portrait.tex';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('copy-formula').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(formulaBody(mode,currentChains()));$('formula-status').textContent='公式已复制。';}
  catch{$('formula-status').textContent='无法访问剪贴板，请保存 LaTeX 文件。';}
});
$('download-sketch').addEventListener('click',()=>{if(sketch){const surface=sketchSurface(),output=document.createElement('canvas');output.width=surface.width;output.height=surface.height;const out=output.getContext('2d');out.fillStyle=colors().background;out.fillRect(0,0,output.width,output.height);out.drawImage(surface,0,0);download(output,'portrait-sketch.png');}});
$('download').addEventListener('click',()=>{
  const output=document.createElement('canvas');output.width=output.height=900;const out=output.getContext('2d');out.fillStyle=colors().background;out.fillRect(0,0,900,900);drawComposition(out,shared?'lines':resultView,1);download(output,'fourier-portrait.png');
});

function drawComposition(context,kind,progress){
  if(sketch&&kind!=='lines'){context.globalAlpha=sketchReveal(progress);const w=dimensions.width*plot.scale,h=dimensions.height*plot.scale;context.drawImage(sketchSurface(),plot.x-w/2,plot.y-h/2,w,h);}
  if(kind!=='sketch'){context.globalAlpha=sketch&&kind==='overlay'?.28:1;context.drawImage(trail,0,0,900,900);}context.globalAlpha=1;
}

function drawSharedPortrait(){
  const count=Math.max(7200,Math.ceil(canvas.width*8/path.length)*path.length);
  const points=samplePortrait(mode,currentChains(),path,count).map(p=>({...p,x:plot.x+p.x*plot.scale,y:plot.y+p.y*plot.scale}));
  const strokes=closeStrokeSeams(points,12),style=visitorInk(sharedWidth,surfaceRatio,palette);
  ink.clearRect(0,0,900,900);ink.save();ink.strokeStyle=drawingInk().color;ink.lineWidth=style.width;ink.lineJoin='round';ink.lineCap='round';ink.shadowBlur=style.glow;ink.shadowColor=drawingInk().shadow;ink.beginPath();
  strokes.forEach((p,i)=>{if(!i||!p.draw)ink.moveTo(p.x,p.y);else ink.lineTo(p.x,p.y);});ink.stroke();ink.restore();drawn=resolution;
}

function resizeSharedCanvas(){
  if(!shared)return;
  const width=canvas.getBoundingClientRect().width,size=Math.max(1,Math.round(width*devicePixelRatio));
  if(canvas.width===size&&sharedWidth===width)return;
  const target=drawn;sharedWidth=width;surfaceRatio=size/900;canvas.width=canvas.height=trail.width=trail.height=size;
  ctx.setTransform(surfaceRatio,0,0,surfaceRatio,0,0);ink.setTransform(surfaceRatio,0,0,surfaceRatio,0,0);drawn=0;
  if(stage==='result')drawSharedPortrait();else drawTrail(target);
}
new ResizeObserver(resizeSharedCanvas).observe(canvas);window.addEventListener('resize',resizeSharedCanvas);
function watchDensity(){matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change',()=>{resizeSharedCanvas();watchDensity();},{once:true});}
watchDensity();

function drawTrail(target) {
  ink.strokeStyle=colors().line;ink.lineWidth=shared?visitorInk(sharedWidth,surfaceRatio,palette).width:2.2;ink.lineJoin='round';ink.lineCap='round';ink.beginPath();
  const start=pen(drawn/resolution);ink.moveTo(start.x,start.y);
  for(let i=drawn+1;i<=target;i++) {
    const {x,y}=pen(i/resolution);
    if(path[Math.min(path.length-1,Math.floor(i/resolution*path.length))]?.draw)ink.lineTo(x,y);else ink.moveTo(x,y);
  }
  ink.stroke();drawn=target;
}

function photoFrame(){
  const ratio=590/Math.max(picture.naturalWidth,picture.naturalHeight);return {width:picture.naturalWidth*ratio,height:picture.naturalHeight*ratio};
}
function drawSurface(surface,alpha=1,drawing=false) {
  ctx.globalAlpha=alpha;
  const s=drawing?plot.scale:scale,frame=surface===picture?photoFrame():{width:dimensions.width*s,height:dimensions.height*s},w=frame.width,h=frame.height;
  ctx.drawImage(surface,(drawing?plot.x:450)-w/2,(drawing?plot.y:450)-h/2,w,h);ctx.globalAlpha=1;
}

function drawChain(values,origin,rotation=0,emphasis=1) {
  let {x,y}=origin;
  const weight=Math.max(emphasis,1.2*900/canvas.getBoundingClientRect().width);
  for(const c of values){
    const a=c.phase+2*Math.PI*c.k*time+rotation,r=c.amplitude*plot.scale,nx=x+r*Math.cos(a),ny=y+r*Math.sin(a);
    if($('circles').checked&&r>.6){ctx.strokeStyle=r>8?colors().strong:colors().guide;ctx.lineWidth=r>8?weight:weight*.65;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=r>8?colors().accent+'AA':colors().guide;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();}x=nx;y=ny;
  }
  return {x,y};
}

function render() {
  ctx.clearRect(0,0,900,900);
  ctx.fillStyle=colors().muted;
  for(let i=0;i<55;i++) {const x=(i*173.71+51)%900,y=(i*i*113.17+47)%900;ctx.globalAlpha=.08+(i%4)*.035;ctx.beginPath();ctx.arc(x,y,i%7===0?1.3:.6,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  if(view==='photo'&&picture){
    drawSurface(picture);
    if(cropping){ctx.strokeStyle=colors().accent;ctx.lineWidth=2;ctx.setLineDash([8,5]);const frame=photoFrame(),a=cropStart||{x:450-frame.width/2,y:450-frame.height/2},b=cropEnd||{x:450+frame.width/2,y:450+frame.height/2};ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([]);}
    return;
  }
  if(view==='sketch'&&sketch){drawSurface(sketchSurface());if(stage==='sketch'&&stageTime<1.6&&!reduced.matches)drawSurface(picture,Math.max(0,1-stageTime/1.6));return;}
  if(stage==='reveal'){
    ctx.fillStyle=colors().line;const count=Math.floor(path.length*Math.min(1,stageTime/1.3));
    for(let i=0;i<count;i+=2){const p=path[i];if(!p.draw)continue;ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(plot.x+p.x*plot.scale,plot.y+p.y*plot.scale,1.25,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;return;
  }
  if($('original').checked&&picture)drawSurface(picture,.13,true);
  if(isDemo){
    ctx.globalAlpha=.15;ctx.strokeStyle=colors().line;ctx.lineWidth=1;ctx.beginPath();
    for(let i=0;i<path.length;i++){const p=path[i],x=plot.x+p.x*plot.scale,y=plot.y+p.y*plot.scale;if(!i||!p.draw)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.shadowBlur=shared?(stage==='result'?0:visitorInk(sharedWidth,surfaceRatio,palette).glow):reduced.matches?0:colors().glow;ctx.shadowColor=drawingInk().shadow;drawComposition(ctx,shared?'lines':stage==='result'?resultView:'overlay',stage==='result'?1:time);ctx.shadowBlur=0;
  if(stage==='result')return;
  let tip;
  if(mode==='xy'){
    const X=drawChain(activeX,topChain,0,2),Y=drawChain(activeY,leftChain,Math.PI/2,2);
    tip={x:X.x,y:Y.y};
    ctx.strokeStyle=colors().accent+'70';ctx.lineWidth=1;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(X.x,X.y);ctx.lineTo(tip.x,tip.y);ctx.lineTo(Y.x,Y.y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=colors().text;ctx.font=`${Math.max(26,12*900/canvas.getBoundingClientRect().width)}px "Noto Serif SC",serif`;ctx.textAlign='right';ctx.fillText('X · x(t)',210,180);ctx.textAlign='center';ctx.save();ctx.translate(12,530);ctx.rotate(-Math.PI/2);ctx.fillText('Y · y(t)',0,0);ctx.restore();ctx.textAlign='left';
    for(const p of [X,Y]){ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();}
  }else tip=drawChain(active,{x:plot.x,y:plot.y});
  ctx.globalAlpha=1;
  const down=path[Math.min(path.length-1,Math.floor(time*path.length))]?.draw;
  ctx.fillStyle=down?colors().accent:colors().muted;ctx.shadowColor=colors().shadow;ctx.shadowBlur=reduced.matches||!down?0:colors().glow;ctx.beginPath();ctx.arc(tip.x,tip.y,down?2.6:1.6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
}

function frame(timestamp) {
  if(shared&&canvas.width!==Math.round(canvas.getBoundingClientRect().width*devicePixelRatio))resizeSharedCanvas();
  const dt=last?Math.min((timestamp-last)/1000,.08):0;last=timestamp;
  if(!busy){
    stageTime+=dt;
    if(stage==='sketch'&&stageTime>(reduced.matches?.15:2.6))setStage('reveal');
    if(stage==='reveal'&&stageTime>(reduced.matches?.15:1.5))setStage('drawing');
    if(playing&&active.length&&(stage==='drawing'||stage==='landing')){
      time=Math.min(1,time+(reduced.matches?1:dt*Number($('speed').value)/22));drawTrail(Math.floor(time*resolution));
      if(time===1&&!isDemo)setStage('result');
      if(time===1&&isDemo&&!reduced.matches&&stageTime>25){reset();stageTime=0;}
    }
  }
  $('progress').textContent=`${String(Math.round(time*100)).padStart(2,'0')}%`;$('progress-bar').style.width=`${time*100}%`;
  if(!busy)render();requestAnimationFrame(frame);
}

function formulas(){if(window.katex)for(const element of document.querySelectorAll('[data-tex]'))window.katex.render(element.dataset.tex,element,{throwOnError:false});}
window.addEventListener('load',formulas);
function loadShared(){
  try{
    const data=decodePortrait(location.hash);applyPalette(data.palette);shared=true;sharedName=data.name;sharedGuess=data.guess;document.body.classList.add('shared');$('shared-start').hidden=false;
    ({path,dimensions,mode}=data);picture=sketch=null;isDemo=false;
    coefficients=mode==='complex'?data.chains.complex:dft(path);
    xCoefficients=mode==='xy'?data.chains.x:realDft(path.map(p=>p.x));yCoefficients=mode==='xy'?data.chains.y:realDft(path.map(p=>p.y));
    automaticBounds=null;automatic={complex:{count:coefficients.length,energy:data.energy,error:0},x:{count:xCoefficients.length,energy:data.energy,error:0},y:{count:yCoefficients.length,energy:data.energy,error:0}};
    scale=350/Math.max(1,...path.map(p=>Math.max(Math.abs(p.x),Math.abs(p.y))));$('terms').max=String(Math.max(coefficients.length,xCoefficients.length,yCoefficients.length));
    for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
    const count=mode==='xy'?xCoefficients.length+yCoefficients.length:coefficients.length;$('shared-terms').max=String(Math.max(1,count));$('shared-terms').disabled=count<2;
    reset();canvas.closest('.lens').after($('lens-note'));resizeSharedCanvas();$('status').textContent='仅由数学系数重建 · 没有原始照片';
  }catch(error){showError(error.message);loadImage('samples/fourier.jpg','示例 / 傅里叶',true,'fourier');}
}
window.addEventListener('hashchange',()=>{
  try{if(shouldReloadForHash(location.hash)){history.scrollRestoration='manual';scrollTo({top:0,left:0,behavior:'instant'});location.reload();}}
  catch(error){showError(error.message);}
});
if(location.hash.startsWith('#p=')||location.hash.startsWith('#n'))loadShared();else loadImage('samples/fourier.jpg','示例 / 傅里叶',true,'fourier');requestAnimationFrame(frame);
