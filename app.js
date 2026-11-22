import {dft,realDft,evaluate,chainTip,axisEnvelope,xyLayout} from './fourier.mjs';
import {xdog,styleParameters,thresholdSketch} from './lineart.mjs';
import {modelLineArt,cancelLineArt} from './ml-client.mjs';
import {formulaBody,latexDocument,limitChains} from './portrait.mjs';
import {encodePortrait,decodePortrait,cleanName,SHARE_BASE} from './share.mjs';
import {renderSocialCard} from './card.mjs';
import {analyzeSketch} from './path.mjs';
import {portraitInk,samplePortrait,closeStrokeSeams,visitorInk} from './portrait-render.mjs';
import {shouldReloadForHash} from './navigation.mjs';
import {getPalette,normalizePalette} from './palettes.mjs';
import {featureRegions} from './portrait-preprocess.mjs';
import {tintSketch,sketchReveal,drawSketch} from './sketch.mjs';
import {initialLanguage,translatePage,progressDetails} from './i18n.mjs';
import {createToneMap,renderTonePixels} from './tone.mjs';
import {publishSketch,fetchSketch} from './encrypted-sketch.mjs';

const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const trail=document.createElement('canvas');trail.width=trail.height=900;
const ink=trail.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const narrow=matchMedia('(max-width:650px)');
let lang=initialLanguage(),palette='ink',mode='xy',stage='landing',generation=0,shared=false,demo=true;
let path=[],coefficients=[],xCoefficients=[],yCoefficients=[],active=[],activeX=[],activeY=[],automatic=null,bounds=null;
let dimensions={width:360,height:360},plot={x:450,y:450,scale:1},topChain={},leftChain={};
let picture=null,sketch=null,tinted=null,sketchPending=false,sketchArrived=0,lateSketch=null,installed=0,pathWorker=null;
let toneMap=null,toneSurface=null,sketchHasTone=false;
let fullShare=null,fullUpload=null,fullUploadController=null,sharedReference=null,sharedFull=null,fullArrived=0,fullState='none';
let manual=false,time=0,drawn=0,playing=true,last=0,busy=false,source='',sampleId='',strokeCount=0;
let sharedName='',sharedGuess=false,surfaceRatio=1,sharedWidth=900;
let processing=false,processingStarted=0,downloadStarted=0,downloadFile='',progressData={},processingPhase='loading',matte=null,matteArrived=0;
let cardSurface=null,cardPayload=null,cardGeneration=0,status=()=>'',errorText=()=>'',formulaStatus=()=>'',cardStatus=()=>'';
const samples=[['fourier','傅里叶','Fourier','Fourier2.jpg'],['einstein','爱因斯坦','Einstein','Albert_Einstein_Head.jpg'],['newton','牛顿','Newton','GodfreyKneller-IsaacNewton-1689.jpg'],['curie','居里夫人','Curie','Marie_Curie_c1920.jpg'],['euler','欧拉','Euler','Leonhard_Euler.jpg'],['gauss','高斯','Gauss','Carl_Friedrich_Gauss_1840_by_Jensen.jpg']];
const t=(zh,en)=>lang==='zh'?zh:en,colors=()=>getPalette(palette),chains=()=>({x:activeX,y:activeY,complex:active});
function applyPalette(value){palette=normalizePalette(value);document.body.dataset.palette=palette;document.documentElement.style.background=colors().background;document.querySelector('meta[name="theme-color"]').content=colors().background;tinted=null;}
function count(){return mode==='xy'?activeX.length+activeY.length:active.length;}
function updateUI(){
  translatePage(lang);
  $('heading').textContent=shared?(sharedGuess&&stage!=='result'?t('猜猜这是谁？','Guess who?'):sharedName?t(`${sharedName}的傅里叶画像`,`${sharedName} · A Fourier portrait`):t('一份写在圆周里的肖像','A portrait written in circles')):stage==='landing'?t('每个人，都有自己的圆周。','You are a thousand little circles.'):stage==='result'?t('原来，圆周记得你。','The circles remember you.'):t('让时间，慢慢画出你。','Let the circles bring you to life.');
  $('story').textContent=shared?(sharedReference?t('加密素描仅在你的浏览器中解密，不含原始照片。','The encrypted sketch is decrypted only in your browser. No original photo.'):toneMap?t('由公式与低分辨率明暗重建，不含原始照片或完整素描。','Rebuilt from a formula and coarse sketch tones. No original photo or full sketch.'):t('仅由公式重建，不含原始照片或素描。','Reconstructed from a formula. No original photo or sketch.')):t('让一张照片化作纸上素描，再借旋转的圆，慢慢将你唤回。','A photo becomes a sketch on paper. Then rotating circles slowly bring you back.');
  $('landing-actions').hidden=shared||stage!=='landing'||processing;
  $('working-actions').hidden=stage!=='drawing'||demo;
  $('result-actions').hidden=shared||stage!=='result';
  $('shared-start').hidden=!shared;
  $('personal-formula').hidden=!path.length||demo||(!shared&&processing);
  $('shared-controls').hidden=!shared;
  $('play').textContent=playing?t('Ⅱ 暂停绘制','Ⅱ Pause'):t('▷ 继续绘制','▷ Continue');
  $('download').disabled=sketchPending;
  $('open-card').disabled=sketchPending||processing;
  $('include-full').disabled=!sketchHasTone||sketchPending||processing;
  $('shared-sketch-note').hidden=!shared||!sharedReference||fullState==='ready';
  $('shared-sketch-note').textContent=fullState==='loading'?t('正在获取并本地解密完整素描…','Fetching and locally decrypting the full sketch…'):toneMap?t('完整素描已过期或不可用，已保留本地明暗预览。','Full sketch unavailable or expired. Showing the local tone preview.'):t('完整素描不可用，已保留公式画像。','Full sketch unavailable. Showing the formula portrait.');
  $('status').textContent=status();$('error').textContent=errorText();$('error').hidden=!errorText();
  $('formula-status').textContent=formulaStatus();$('card-status').textContent=cardStatus();
  $('source-label').textContent=shared?(sharedGuess&&stage!=='result'?t('圆周正在保守秘密','The circles are keeping a secret'):sharedName||t('分享的傅里叶画像','A shared Fourier portrait')):sampleId?t('示例 / ','Example / ')+(samples.find(s=>s[0]===sampleId)?.[lang==='zh'?1:2]||sampleId):source;
  for(const button of document.querySelectorAll('[data-sample]')){button.querySelector('span').textContent=samples.find(s=>s[0]===button.dataset.sample)[lang==='zh'?1:2];button.setAttribute('aria-pressed',String(button.dataset.sample===sampleId));}
  if(path.length&&!demo)previewFormula();
  if(processing)updateProcessing();
}
function setProcessing(value){processing=value;$('processing').hidden=!value;document.body.classList.toggle('processing-active',value);updateUI();}
function updateProcessing(){
  const labels={loading:t('正在加载模型','Loading the models'),matting:t('正在分离人物与背景','Separating you from the background'),sketching:t('光影正在落纸','Bringing the sketch to paper'),formula:t('正在计算你的公式','Computing your formula')};
  const percentage=progressData.progress??(processingPhase==='loading'?0:100);
  $('processing-title').textContent=labels[processingPhase];$('processing-percent').textContent=progressData.received!==undefined||progressData.cached?`${percentage}%`:'';
  $('model-progress').value=percentage;
  if(!progressData.cached&&progressData.received===undefined)$('model-progress').removeAttribute('value');
  const detail=progressDetails(progressData,lang,performance.now()-downloadStarted);
  $('processing-bytes').textContent=detail.bytes;
  $('processing-eta').textContent=progressData.cached?t('缓存命中 · 继续本地处理','Cache hit · Continuing locally'):detail.eta;
  for(const item of document.querySelectorAll('[data-step]')){const current=item.dataset.step===processingPhase;item.classList.toggle('active',current);if(current)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');}
  $('matte-note').textContent=matte?t('真实背景遮罩 · 本地计算','Actual subject mask · Computed locally'):t('原图预览 · 等待背景遮罩','Original preview · Waiting for the subject mask');
}
function onProgress(data,token){
  if(token!==generation)return;
  if(data.matte){matte=data.matte;matteArrived=performance.now();progressData={};processingPhase='matting';updateProcessing();return;}
  if(data.file&&data.file!==downloadFile){downloadFile=data.file;downloadStarted=performance.now();}
  progressData=data;
  processingPhase=data.received!==undefined||data.cached?'loading':data.phase|| (data.sketchProgress?'sketching':'formula');
  updateProcessing();
}
function acceptSketch(data,token){
  if(token!==generation)return;
  lateSketch=data;if(installed!==token)return;
  sketchPending=false;
  if(data.sketch){sketch=graySurface(data.sketch);tinted=null;toneMap=null;sketchHasTone=true;sketchArrived=performance.now();}
  status=()=>data.sketch?t('素描与公式均已就绪 · 全程本地','Sketch and formula ready · Entirely local'):t('素描暂不可用，已保留圆周轮廓','Sketch unavailable. Your Fourier contours are preserved.');
  setProcessing(false);
}
function graySurface({gray,width,height}){
  const surface=document.createElement('canvas');surface.width=width;surface.height=height;const c=surface.getContext('2d'),pixels=c.createImageData(width,height);
  for(let i=0;i<gray.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=gray[i];pixels.data[i*4+3]=255;}c.putImageData(pixels,0,0);return surface;
}
function sketchTone(){
  const surface=document.createElement('canvas');surface.width=sketch.width;surface.height=sketch.height;
  const c=surface.getContext('2d',{willReadFrequently:true});c.drawImage(sketch,0,0);
  return createToneMap(c.getImageData(0,0,surface.width,surface.height).data,surface.width,surface.height);
}
function toneLayer(){
  if(!toneMap)return null;
  const surface=document.createElement('canvas'),longest=Math.max(dimensions.width,dimensions.height);
  surface.width=Math.max(4,Math.round(512*dimensions.width/longest));surface.height=Math.max(4,Math.round(512*dimensions.height/longest));
  const c=surface.getContext('2d'),pixels=c.createImageData(surface.width,surface.height),rgb=[1,3,5].map(i=>parseInt(colors().line.slice(i,i+2),16));
  pixels.data.set(renderTonePixels(toneMap,surface.width,surface.height,rgb));c.putImageData(pixels,0,0);return surface;
}
function analyze(binary,width,height,portrait,face,landmarks){
  if(!globalThis.Worker)return Promise.resolve(analyzeSketch(binary,width,height,portrait?10:4,portrait,face,landmarks));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./path-worker.mjs',import.meta.url),{type:'module'});pathWorker=worker;
    worker.onmessage=({data})=>{worker.terminate();if(pathWorker===worker)pathWorker=null;data.error?reject(Error(data.error)):resolve(data.result);};
    worker.onerror=event=>{event.preventDefault();worker.terminate();if(pathWorker===worker)pathWorker=null;reject(Error('analysis'));};
    worker.postMessage({binary,width,height,minLength:portrait?10:4,portrait,face,landmarks},[binary.buffer]);
  });
}
async function prepare(image,id,token){
  const work=document.createElement('canvas'),ratio=Math.min(1,400/Math.max(image.naturalWidth,image.naturalHeight));
  work.width=Math.max(4,Math.round(image.naturalWidth*ratio));work.height=Math.max(4,Math.round(image.naturalHeight*ratio));
  const wc=work.getContext('2d',{willReadFrequently:true});wc.fillStyle='#fff';wc.fillRect(0,0,work.width,work.height);wc.drawImage(image,0,0,work.width,work.height);
  let binary,face=null,landmarks=[],displaySketch=null,pending=false,classic=false,hasTone=false;
  try{
    let gray;
    if(id){
      const precomputed=new Image();precomputed.src=`samples/${id}-contour.png`;await precomputed.decode();wc.drawImage(precomputed,0,0,work.width,work.height);
      const pixels=wc.getImageData(0,0,work.width,work.height).data;gray=Uint8Array.from({length:work.width*work.height},(_,i)=>pixels[i*4]);
      try{const metadata=await(await fetch('samples/portraits.json')).json();face=metadata[id]?.face||null;landmarks=metadata[id]?.landmarks||[];}catch{}
    }else{
      const result=await modelLineArt(image,'contour',data=>onProgress(data,token),data=>acceptSketch(data,token));
      gray=result.gray;face=result.face;landmarks=result.landmarks;work.width=result.width;work.height=result.height;pending=result.sketchPending;displaySketch=graySurface(result);
    }
    binary=thresholdSketch(gray,work.width,work.height,50,50,featureRegions(landmarks,face));
  }catch{classic=true;}
  if(id)try{const sample=new Image();sample.src=`samples/${id}-u2.png`;await sample.decode();displaySketch=sample;hasTone=true;}catch{}
  if(!binary){wc.fillStyle='#fff';wc.fillRect(0,0,work.width,work.height);wc.drawImage(image,0,0,work.width,work.height);binary=xdog(wc.getImageData(0,0,work.width,work.height).data,work.width,work.height,styleParameters(50,50));}
  if(token===generation){processingPhase='formula';progressData={};updateProcessing();}
  const result=await analyze(binary,work.width,work.height,!classic,face,landmarks);
  if(token===generation&&pending){processingPhase='sketching';updateProcessing();}
  if(!displaySketch){wc.fillStyle='#fff';wc.fillRect(0,0,work.width,work.height);wc.strokeStyle='#242729';wc.lineWidth=1.15;wc.lineJoin='round';wc.lineCap='round';for(const stroke of result.strokes){wc.beginPath();wc.moveTo(stroke[0].x,stroke[0].y);for(const p of stroke.slice(1))wc.lineTo(p.x,p.y);wc.stroke();}displaySketch=work;}
  return {...result,sketch:displaySketch,sketchPending:pending,dimensions:{width:work.width,height:work.height},classic,hasTone};
}
async function loadImage(src,name,isDemo=false,id=''){
  const token=++generation;cancelLineArt(true);pathWorker?.terminate();pathWorker=null;lateSketch=null;busy=true;
  fullUploadController?.abort();fullUploadController=null;fullUpload=null;fullShare=null;$('include-full').checked=false;cardGeneration++;cardPayload=cardSurface=null;
  if($('card-dialog').open)$('card-dialog').close();
  toneMap=toneSurface=null;sketchHasTone=false;
  errorText=()=>'';matte=null;matteArrived=0;processingStarted=performance.now();downloadStarted=processingStarted;downloadFile='';progressData={};processingPhase=id?'formula':'loading';
  demo=isDemo;sampleId=id;source=name;stage=isDemo?'landing':'loading';document.body.dataset.stage=stage;
  if(!isDemo)setProcessing(true);
  try{
    const image=src instanceof HTMLImageElement?src:new Image();if(typeof src==='string'){image.src=src;await image.decode();}
    if(token!==generation)return;picture=image;updateUI();
    const result=await prepare(image,id,token);if(token!==generation)return;
    ({path,coefficients,dimensions,automatic,bounds}=result);xCoefficients=result.x;yCoefficients=result.y;strokeCount=result.strokes.length;mode='xy';manual=false;
    sketch=result.sketch;tinted=null;sketchPending=Boolean(result.sketchPending);sketchHasTone=result.hasTone;sketchArrived=0;installed=token;
    $('terms').max=String(Math.max(xCoefficients.length,yCoefficients.length));
    status=()=>result.classic?t('模型不可用 · 已使用经典算法','Models unavailable · Using the classic algorithm'):t(`${strokeCount} 条笔画 · 公式已就绪 · 全程本地`,`${strokeCount} strokes · Formula ready · Entirely local`);
    reset(isDemo);busy=false;
    if(lateSketch)acceptSketch(lateSketch,token);else if(!sketchPending)setProcessing(false);
    for(const button of document.querySelectorAll('[data-sample]'))button.setAttribute('aria-pressed',String(button.dataset.sample===id));
    updateUI();
  }catch{
    if(token===generation){sketchPending=false;setProcessing(false);stage=path.length&&!demo?'result':'landing';document.body.dataset.stage=stage;errorText=()=>t('无法生成画像。请选择轮廓清晰的 JPG / PNG 照片。','Could not create a portrait. Choose a clear JPG / PNG photo.');updateUI();}
  }finally{if(token===generation)busy=false;}
}
function layout(){
  const scale=590/Math.max(dimensions.width,dimensions.height);plot={x:450,y:450,scale};
  if(stage==='result')return;
  if(mode==='xy'){const xy=xyLayout(dimensions,!manual&&bounds?bounds.x:axisEnvelope(activeX),!manual&&bounds?bounds.y:axisEnvelope(activeY));plot=xy.plot;topChain=xy.top;leftChain=xy.left;}
}
function reset(isDemo=false){
  const n=Number($('terms').value);active=coefficients.slice(0,manual?n:automatic?.complex.count);activeX=xCoefficients.slice(0,manual?n:automatic?.x.count);activeY=yCoefficients.slice(0,manual?n:automatic?.y.count);
  time=drawn=0;playing=true;demo=isDemo;stage=isDemo?'landing':'drawing';document.body.dataset.stage=stage;ink.clearRect(0,0,900,900);layout();
  if(!manual)$('terms').value=String(Math.max(activeX.length,activeY.length));
  $('shared-terms').value=String(count());updateUI();
}
function finish(){time=1;stage='result';document.body.dataset.stage=stage;layout();ink.clearRect(0,0,900,900);drawn=0;if(shared)drawSharedPortrait();else drawTrail(7200);updateUI();}
function previewFormula(){
  const limit=narrow.matches?1:2,body=formulaBody(mode,chains(),limit,lang);$('formula-preview').textContent=body;
  if(window.katex)window.katex.render(body,$('formula-preview'),{throwOnError:false,displayMode:true});
  $('terms-value').value=mode==='xy'?`X ${activeX.length} / Y ${activeY.length}`:String(active.length);
  $('formula-count').textContent=shared?t(`${count()} 个圆 · 由分享的数学系数重建`,`${count()} circles · Reconstructed from shared coefficients`):t(`${manual?'手动 N':'自动 N'} · X ${activeX.length} / Y ${activeY.length} 项 · 预览每轴前 ${limit} 项`,`${manual?'Manual N':'Automatic N'} · X ${activeX.length} / Y ${activeY.length} terms · First ${limit} ${limit===1?'term':'terms'} per axis`);
  $('restore-auto').hidden=!manual;$('shared-count').textContent=t(`${count()} / ${$('shared-terms').max} 个圆`,`${count()} / ${$('shared-terms').max} circles`);
}
function pen(t){const p=mode==='xy'?{x:chainTip(activeX,t).x,y:chainTip(activeY,t,Math.PI/2).y}:evaluate(active,t);return{x:plot.x+p.x*plot.scale,y:plot.y+p.y*plot.scale};}
function drawTrail(target){
  ink.strokeStyle=colors().line;ink.lineWidth=shared?visitorInk(sharedWidth,surfaceRatio,palette).width:2.2;ink.lineJoin=ink.lineCap='round';ink.beginPath();const start=pen(drawn/7200);ink.moveTo(start.x,start.y);
  for(let i=drawn+1;i<=target;i++){const p=pen(i/7200);if(path[Math.min(path.length-1,Math.floor(i/7200*path.length))]?.draw)ink.lineTo(p.x,p.y);else ink.moveTo(p.x,p.y);}ink.stroke();drawn=target;
}
function drawSharedPortrait(){
  const points=samplePortrait(mode,chains(),path,Math.max(7200,Math.ceil(canvas.width*8/path.length)*path.length)).map(p=>({...p,x:plot.x+p.x*plot.scale,y:plot.y+p.y*plot.scale}));
  const strokes=closeStrokeSeams(points,12),style=visitorInk(sharedWidth,surfaceRatio,palette);ink.clearRect(0,0,900,900);ink.strokeStyle=portraitInk(palette).color;ink.lineWidth=style.width;ink.lineJoin=ink.lineCap='round';ink.beginPath();
  strokes.forEach((p,i)=>{if(!i||!p.draw)ink.moveTo(p.x,p.y);else ink.lineTo(p.x,p.y);});ink.stroke();drawn=7200;
}
function composition(context,progress,complete=false){
  const visible=shared?Boolean(toneSurface||sharedFull):sketch&&!sketchPending,arrival=!shared&&sketchArrived&&!reduced.matches&&!complete?Math.min(1,(performance.now()-sketchArrived)/1200):1,fade=sharedFull?(reduced.matches||complete?1:Math.min(1,(performance.now()-fullArrived)/1200)):0;
  if(visible){
    if(!shared&&!tinted)tinted=tintSketch(sketch,palette);
    const base=shared?toneSurface:tinted,w=dimensions.width*plot.scale,h=dimensions.height*plot.scale;
    if(base){context.globalAlpha=sketchReveal(progress)*arrival*(1-fade);drawSketch(context,base,plot.x-w/2,plot.y-h/2,w,h,palette);}
    if(sharedFull){context.globalAlpha=sketchReveal(progress)*fade;drawSketch(context,sharedFull,plot.x-w/2,plot.y-h/2,w,h,palette);}
  }
  context.globalAlpha=visible?(shared?1-.65-.17*fade:1-.82*arrival):1;context.drawImage(trail,0,0,900,900);context.globalAlpha=1;
}
function drawChain(values,origin,rotation=0){
  let{x,y}=origin;const weight=Math.max(2,1.2*900/canvas.getBoundingClientRect().width);
  for(const c of values){const a=c.phase+2*Math.PI*c.k*time+rotation,r=c.amplitude*plot.scale,nx=x+r*Math.cos(a),ny=y+r*Math.sin(a);
    if(r>.6){ctx.strokeStyle=r>8?colors().strong:colors().guide;ctx.lineWidth=r>8?weight:weight*.65;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=r>8?colors().accent+'AA':colors().guide;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();}x=nx;y=ny;}return{x,y};
}
function render(){
  ctx.clearRect(0,0,900,900);if(!path.length)return;
  composition(ctx,stage==='result'?1:time);if(stage==='result')return;
  let tip;if(mode==='xy'){const X=drawChain(activeX,topChain),Y=drawChain(activeY,leftChain,Math.PI/2);tip={x:X.x,y:Y.y};ctx.strokeStyle=colors().accent+'70';ctx.lineWidth=1;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(X.x,X.y);ctx.lineTo(tip.x,tip.y);ctx.lineTo(Y.x,Y.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=colors().text;ctx.font=`${Math.max(26,12*900/canvas.getBoundingClientRect().width)}px "Noto Serif SC",serif`;ctx.textAlign='right';ctx.fillText('X · x(t)',210,180);ctx.textAlign='center';ctx.save();ctx.translate(34,530);ctx.rotate(-Math.PI/2);ctx.fillText('Y · y(t)',0,0);ctx.restore();ctx.textAlign='left';}else tip=drawChain(active,{x:plot.x,y:plot.y});
  ctx.fillStyle=colors().accent;ctx.beginPath();ctx.arc(tip.x,tip.y,2.6,0,Math.PI*2);ctx.fill();
}
function renderMatte(now){
  if(!processing||!picture)return;const c=$('matte-canvas'),cx=c.getContext('2d',{willReadFrequently:true}),ratio=Math.min(c.width/picture.naturalWidth,c.height/picture.naturalHeight),w=Math.round(picture.naturalWidth*ratio),h=Math.round(picture.naturalHeight*ratio),x=Math.floor((c.width-w)/2),y=Math.floor((c.height-h)/2);
  cx.clearRect(0,0,c.width,c.height);cx.drawImage(picture,x,y,w,h);
  if(matte){const pixels=cx.getImageData(x,y,w,h),fade=reduced.matches?1:Math.min(1,(now-matteArrived)/1600);
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){const a=matte.gray[Math.min(matte.height-1,Math.floor(j/h*matte.height))*matte.width+Math.min(matte.width-1,Math.floor(i/w*matte.width))]/255;pixels.data[(j*w+i)*4+3]=Math.round(255*(1-fade*(1-a)));}
    cx.putImageData(pixels,x,y);
  }
}
function resizeShared(){
  if(!shared)return;const width=canvas.getBoundingClientRect().width,size=Math.max(1,Math.round(width*devicePixelRatio));if(canvas.width===size&&sharedWidth===width)return;
  const target=drawn;sharedWidth=width;surfaceRatio=size/900;canvas.width=canvas.height=trail.width=trail.height=size;ctx.setTransform(surfaceRatio,0,0,surfaceRatio,0,0);ink.setTransform(surfaceRatio,0,0,surfaceRatio,0,0);drawn=0;if(stage==='result')drawSharedPortrait();else drawTrail(target);
}
new ResizeObserver(resizeShared).observe(canvas);
narrow.addEventListener('change',()=>{if(path.length&&!demo)previewFormula();});
function frame(now){
  const dt=last?Math.min((now-last)/1000,.08):0;last=now;if(shared)resizeShared();
  if(!busy&&active.length&&playing&&(stage==='drawing'||stage==='landing')){time=Math.min(1,time+(reduced.matches?1:dt/22));drawTrail(Math.floor(time*7200));if(time===1){if(demo){if(!reduced.matches)reset(true);}else finish();}}
  $('progress').textContent=`${String(Math.round(time*100)).padStart(2,'0')}%`;$('drawing-progress').value=time;if(!busy)render();renderMatte(now);requestAnimationFrame(frame);
}
function download(surface,name){const a=document.createElement('a');a.download=name;a.href=surface.toDataURL('image/png');a.click();}
async function encryptedReference(){
  if(fullShare)return fullShare;
  if(!sketchHasTone||!sketch||sketchPending)throw new Error('Sketch unavailable');
  if(!fullUpload){
    const imageGeneration=generation,controller=new AbortController();
    const pending=publishSketch(sketch,{signal:controller.signal}).then(reference=>{
      if(imageGeneration!==generation||controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
      fullShare=reference;status=()=>t('加密素描已保存 30 天 · 原始照片仍在本地','Encrypted sketch stored for 30 days · Original photo stays local');updateUI();return reference;
    }).catch(error=>{if(fullUpload===pending)fullUpload=null;throw error;});
    fullUploadController=controller;fullUpload=pending;
  }
  return fullUpload;
}
async function createCard(){
  const token=++cardGeneration,imageGeneration=generation,includeFull=$('include-full').checked;cardStatus=()=>t('正在排版你的公式卡…','Typesetting your formula card…');$('card-status').textContent=cardStatus();for(const id of ['save-card','system-share','copy-link'])$(id).disabled=true;cardPayload=cardSurface=null;$('share-url').value='';
  try{
    await document.fonts.ready;await Promise.all(['36px KaTeX_Main','italic 36px KaTeX_Math'].map(font=>document.fonts.load(font)));
    const teaser=new Image();teaser.src='samples/fourier-u2.png';await teaser.decode();if(token!==cardGeneration)return;
    if(sketchHasTone&&!toneMap)toneMap=sketchTone();
    let encryptedSketch=null;
    if(includeFull){cardStatus=()=>t('正在本地加密并上传素描…','Encrypting locally and uploading the sketch…');$('card-status').textContent=cardStatus();encryptedSketch=await encryptedReference();}
    if(token!==cardGeneration||imageGeneration!==generation)return;
    const snapshot={mode,chains:chains(),path,dimensions,toneMap,encryptedSketch,name:cleanName($('card-name').value),guess:$('card-guess').checked,palette:'ink'},payload=encodePortrait(snapshot,SHARE_BASE);
    const card=renderSocialCard({...snapshot,teaser,lang,energy:payload.energy,shareURL:payload.url},$('card-format').value);
    cardSurface=card.canvas;cardPayload=payload;$('card-preview').src=cardSurface.toDataURL('image/png');$('share-url').value=payload.url;
    cardStatus=()=>t(`${payload.bytes} 字节 · QR v${card.qrVersion} · ${encryptedSketch?'完整素描已加密 · 保存 30 天':toneMap?'含素描明暗':'仅轮廓'} · 分享 ${payload.terms.filter(Boolean).join(' / ')} 项`,`${payload.bytes} bytes · QR v${card.qrVersion} · ${encryptedSketch?'Full sketch encrypted · Stored 30 days':toneMap?'Includes sketch tones':'Contours only'} · ${payload.terms.filter(Boolean).join(' / ')} shared terms`);$('card-status').textContent=cardStatus();for(const id of ['save-card','system-share','copy-link'])$(id).disabled=false;
  }catch{if(token===cardGeneration){cardStatus=()=>includeFull?t('加密卡片暂不可用。请重试，或取消附带完整素描。','Encrypted card unavailable. Retry, or uncheck full sketch.'):t('卡片暂时无法生成，请重试或缩短署名。','Could not create the card. Retry or use a shorter nickname.');$('card-status').textContent=cardStatus();}}
}
for(const button of document.querySelectorAll('[data-lang]'))button.addEventListener('click',()=>{lang=button.dataset.lang;try{localStorage.setItem('fourier-language',lang);}catch{}updateUI();if($('card-dialog').open)createCard();});
for(const[id,zh,en,file]of samples){const button=document.createElement('button');button.className='sample';button.dataset.sample=id;const image=new Image(52,52);image.src=`samples/${id}-thumb.jpg`;image.alt='';const label=document.createElement('span');label.textContent=t(zh,en);button.append(image,label);button.addEventListener('click',()=>loadImage(`samples/${id}.jpg`,en,false,id));$('samples').append(button);
  const link=document.createElement('a');link.href=`https://commons.wikimedia.org/wiki/File:${file}`;link.textContent=en+' ↗';link.target='_blank';link.rel='noreferrer';$('credits').append(link);}
async function upload(file){if(!file)return;if(!['image/jpeg','image/png'].includes(file.type)){errorText=()=>t('请选择 JPG 或 PNG 格式的图片。','Please choose a JPG or PNG image.');updateUI();return;}const url=URL.createObjectURL(file);try{await loadImage(url,file.name);}finally{URL.revokeObjectURL(url);}}
for(const id of ['choose','change'])$(id).addEventListener('click',()=>$('upload').click());
$('upload').addEventListener('change',e=>{upload(e.target.files[0]);e.target.value='';});
let dragDepth=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('observatory').classList.add('dragging');}});document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('observatory').classList.remove('dragging');}});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('observatory').classList.remove('dragging');if(!shared)upload(e.dataTransfer.files[0]);});
$('play').addEventListener('click',()=>{playing=!playing;updateUI();});$('skip').addEventListener('click',finish);$('replay').addEventListener('click',()=>reset());
$('terms').addEventListener('input',()=>{manual=true;reset();});$('restore-auto').addEventListener('click',()=>{manual=false;reset();});
$('shared-terms').addEventListener('input',()=>{if(!shared)return;const selected=limitChains(mode,{x:xCoefficients,y:yCoefficients,complex:coefficients},Number($('shared-terms').value));activeX=selected.x;activeY=selected.y;active=selected.complex;previewFormula();if(stage==='result')drawSharedPortrait();else{layout();ink.clearRect(0,0,900,900);drawn=0;drawTrail(Math.floor(time*7200));}});
$('download').addEventListener('click',()=>{if(sketchPending)return;const output=document.createElement('canvas');output.width=output.height=900;const out=output.getContext('2d');out.fillStyle=colors().background;out.fillRect(0,0,900,900);composition(out,1,true);download(output,t('我的傅里叶画像.png','my-fourier-portrait.png'));});
$('open-card').addEventListener('click',()=>{$('card-dialog').showModal();createCard();});$('close-card').addEventListener('click',()=>$('card-dialog').close());
for(const id of ['card-name','card-format','card-guess'])$(id).addEventListener('change',createCard);
$('include-full').addEventListener('change',()=>{if(!$('include-full').checked&&!fullShare){fullUploadController?.abort();fullUpload=null;}createCard();});
$('save-card').addEventListener('click',()=>{if(cardSurface)download(cardSurface,t(`我的傅里叶公式-${$('card-format').value}.png`,`my-fourier-formula-${$('card-format').value}.png`));});
async function copyLink(){if(!cardPayload)return;try{await navigator.clipboard.writeText(cardPayload.url);cardStatus=()=>t('分享链接已复制。','Share link copied.');}catch{$('share-url').focus();$('share-url').select();cardStatus=()=>t('请手动复制选中的链接。','Please copy the selected link.');}$('card-status').textContent=cardStatus();}
$('copy-link').addEventListener('click',copyLink);
$('system-share').addEventListener('click',async()=>{if(!cardSurface)return;const blob=await new Promise(resolve=>cardSurface.toBlob(resolve,'image/png')),file=new File([blob],'fourier-formula.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:t('我的傅里叶公式','My Fourier Formula')});}catch(error){if(error.name!=='AbortError')await copyLink();}}else await copyLink();});
$('download-formula').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([latexDocument(mode,chains(),lang)],{type:'application/x-tex;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=t('我的傅里叶公式.tex','my-fourier-formula.tex');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('copy-formula').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(formulaBody(mode,chains(),Infinity,lang));formulaStatus=()=>t('公式已复制。','Formula copied.');}catch{formulaStatus=()=>t('无法访问剪贴板，请保存 LaTeX 文件。','Clipboard unavailable. Please save the LaTeX file.');}$('formula-status').textContent=formulaStatus();});
async function loadFullSketch(reference){
  fullState='loading';updateUI();
  try{
    const blob=await fetchSketch(reference),image=await createImageBitmap(blob);
    if(image.width>1024||image.height>1024){image.close();throw new Error('Sketch too large');}
    sharedFull=tintSketch(image,palette);image.close();fullArrived=performance.now();fullState='ready';
  }catch{fullState='fallback';}
  updateUI();
}
function loadShared(){
  try{const data=decodePortrait(location.hash);shared=true;demo=false;sharedName=data.name;sharedGuess=data.guess;applyPalette(data.palette);document.body.classList.add('shared');({path,dimensions,mode,toneMap}=data);sharedReference=data.encryptedSketch;toneSurface=toneLayer();
    coefficients=mode==='complex'?data.chains.complex:dft(path);xCoefficients=mode==='xy'?data.chains.x:realDft(path.map(p=>p.x));yCoefficients=mode==='xy'?data.chains.y:realDft(path.map(p=>p.y));automatic={complex:{count:coefficients.length},x:{count:xCoefficients.length},y:{count:yCoefficients.length}};bounds=null;
    const total=mode==='xy'?xCoefficients.length+yCoefficients.length:coefficients.length;$('shared-terms').max=String(Math.max(1,total));$('shared-terms').disabled=total<2;status=()=>sharedFull?t('公式 + 本地解密的完整素描 · 无原始照片','Formula + locally decrypted full sketch · No original photo'):toneMap?t('公式 + 低分辨率素描明暗 · 无原始照片','Formula + coarse sketch tones · No original photo'):t('仅由数学系数重建 · 没有原始照片','Reconstructed only from coefficients · No original photo');reset();resizeShared();
    if(sharedReference)loadFullSketch(sharedReference);
  }catch{errorText=()=>t('分享链接无效或不完整，请重新复制。','This share link is invalid or incomplete. Please copy it again.');updateUI();}
}
window.addEventListener('hashchange',()=>{try{if(shouldReloadForHash(location.hash)){history.scrollRestoration='manual';scrollTo({top:0,left:0,behavior:'instant'});location.reload();}}catch{errorText=()=>t('分享链接无效，当前作品已保留。','Invalid share link. Your current portrait is preserved.');updateUI();}});
window.addEventListener('load',()=>{if(path.length&&!demo)previewFormula();});
updateUI();if(location.hash.startsWith('#p=')||location.hash.startsWith('#n'))loadShared();else loadImage('samples/fourier.jpg','Fourier',true,'fourier');requestAnimationFrame(frame);
