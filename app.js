import {dft, evaluate} from './fourier.mjs';
import {xdog, styleParameters, vectorize, joinStrokes, resampleClosed} from './lineart.mjs';

const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const trail = document.createElement('canvas'); trail.width = trail.height = 900;
const ink = trail.getContext('2d'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
const samples = [
  ['fourier','傅里叶','Fourier2.jpg'],['einstein','爱因斯坦','Albert_Einstein_Head.jpg'],
  ['newton','牛顿','GodfreyKneller-IsaacNewton-1689.jpg'],['curie','居里夫人','Marie_Curie_c1920.jpg'],
  ['euler','欧拉','Leonhard_Euler.jpg'],['gauss','高斯','Carl_Friedrich_Gauss_1840_by_Jensen.jpg'],
];
let coefficients = [], active = [], path = [], picture = null, sketch = null;
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
  for (const [id, on] of [['step-sketch',next==='sketch'],['step-draw',next==='reveal'||next==='drawing'],['step-result',next==='result']]) $(id).classList.toggle('active',on);
  const content = {
    sketch:['01 / THE IMAGE BECOMES INK','褪去明暗，<br><em>留下你的线条。</em>','先让照片成为一幅黑白线条画。<br>光与影之间，藏着轮廓的起点。','照片 → XDoG 线条画'],
    reveal:['02 / THE ORBITS AWAKEN','每一条线，<br><em>都有回响。</em>','笔画化作复数，圆周渐渐苏醒。<br>下一刻，它们将为你重新相遇。','沿笔画采样 · 圆周即将苏醒'],
    drawing:['02 / THE ORBITS AWAKEN','让时间，<br><em>慢慢画出你。</em>','大圆勾勒轮廓，小圆拾起细节。<br>沿着光点，看简单如何叠加成复杂。','旋转的尽头，是你的轮廓'],
    result:['03 / A MOMENT, PRESERVED','此刻，<br><em>留在圆周之间。</em>','无数个圆，终于相遇成一个你。<br>把这一刻带走，或再看星轨走过一遍。','每一笔，都是圆的回声'],
  }[next];
  if (content) { $('chapter').textContent=content[0];$('heading').innerHTML=content[1];$('story').innerHTML=content[2];$('lens-note').textContent=content[3]; }
  if(next==='sketch') setView('sketch');
  if(next==='reveal'||next==='drawing'||next==='result') setView('fourier');
  $('play').textContent = playing ? 'Ⅱ 暂停绘制' : '▷ 继续绘制';
}

function reset(reveal = false) {
  active = coefficients.slice(0,Number($('terms').value)); time=0;drawn=0;playing=true;
  ink.clearRect(0,0,900,900);$('terms-value').value=String(active.length);
  if(!isDemo) setStage(reveal ? 'sketch' : 'drawing');
}

function install(result, image, name, demo) {
  cropping=false;cropStart=cropEnd=null;canvas.classList.remove('cropping');
  ({path,sketch,dimensions,strokeCount}=result); picture=image;sourceName=name;isDemo=demo;
  coefficients=dft(path);$('terms').max=String(coefficients.length);
  scale=590/Math.max(dimensions.width,dimensions.height);
  reset(!demo);$('source-label').textContent=name;
  $('status').textContent=demo ? '示例 / 傅里叶 · 由他的圆，画出他本人' : `${strokeCount} 条笔画 · ${path.length} 个等距采样点 · 全程本地`;
  $('coefficients').replaceChildren(...coefficients.slice(0,4).map(c=>{
    const span=document.createElement('span');span.textContent=`r = ${c.amplitude.toFixed(2)}`;
    const small=document.createElement('small');small.textContent=`k = ${c.k>=0?'+':''}${c.k} · φ ${c.phase.toFixed(2)}`;span.append(small);return span;
  }));
}

function prepare(image) {
  const work=document.createElement('canvas'), ratio=Math.min(1,400/Math.max(image.naturalWidth,image.naturalHeight));
  work.width=Math.max(4,Math.round(image.naturalWidth*ratio));work.height=Math.max(4,Math.round(image.naturalHeight*ratio));
  const wc=work.getContext('2d',{willReadFrequently:true});wc.fillStyle='#fff';wc.fillRect(0,0,work.width,work.height);wc.drawImage(image,0,0,work.width,work.height);
  const binary=xdog(wc.getImageData(0,0,work.width,work.height).data,work.width,work.height,styleParameters(Number($('style').value),Number($('detail').value)));
  const strokes=vectorize(binary,work.width,work.height,8-Number($('detail').value)*.08);
  const ordered=joinStrokes(strokes), sampled=resampleClosed(ordered,1800);
  if(strokes.length<2||sampled.length<8) throw Error('未找到足够线条。请换一张对比清晰的照片，或提高轮廓细节。');
  wc.fillStyle='#fff';wc.fillRect(0,0,work.width,work.height);wc.strokeStyle='#161512';wc.lineWidth=1.15;wc.lineJoin='round';wc.lineCap='round';
  for(const stroke of strokes){wc.beginPath();wc.moveTo(stroke[0].x,stroke[0].y);for(const p of stroke.slice(1))wc.lineTo(p.x,p.y);wc.stroke();}
  return {path:sampled.map(p=>({...p,x:p.x-work.width/2,y:p.y-work.height/2})),sketch:work,dimensions:{width:work.width,height:work.height},strokeCount:strokes.length};
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
    const result=prepare(image);if(token!==generation)return;
    install(result,image,name,demo);
    for(const button of document.querySelectorAll('[data-sample]'))button.setAttribute('aria-pressed',String(button.dataset.sample===sampleId));
    if(!demo)await focusStage(token);
  } catch(error) {
    if(token===generation){showError(error.message.startsWith('未找到')?error.message:'无法读取图片。请选择有效的 JPG / PNG，或尝试较小的照片。');$('status').textContent=picture?'上一幅作品仍为你保留。':'请选择照片，或试试下方名人肖像。';}
  } finally {if(token===generation)busy=false;}
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
  $(id).addEventListener('change',()=>{if(picture)loadImage(picture,sourceName);});
}
$('terms').addEventListener('input',()=>{if(coefficients.length){isDemo=false;reset();}});
$('speed').addEventListener('input',()=>{$('speed-value').value=`${Number($('speed').value).toFixed(1)}×`;});
$('play').addEventListener('click',()=>{playing=!playing;$('play').textContent=playing?'Ⅱ 暂停绘制':'▷ 继续绘制';});
$('replay').addEventListener('click',()=>{isDemo=false;reset();});
$('skip').addEventListener('click',()=>{time=1;drawTrail(resolution);setStage('result');});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>setView(button.dataset.view));
$('formula-link').addEventListener('click',()=>{$('formula-details').open=true;});
$('credits-link').addEventListener('click',()=>{$('sample-credits').open=true;});
$('crop').addEventListener('click',()=>{
  if(!picture||busy)return;
  cropping=!cropping;cropStart=cropEnd=null;canvas.classList.toggle('cropping',cropping);
  if(cropping){setView('photo');playing=false;$('play').textContent='▷ 继续绘制';$('status').textContent='在原图上拖选要保留的肖像区域；再次点击调整取景可取消。';canvas.scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'});}
});
function cropPoint(event){
  const rect=canvas.getBoundingClientRect(),w=dimensions.width*scale,h=dimensions.height*scale;
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
  const factor=picture.naturalWidth/(dimensions.width*scale),cropCanvas=document.createElement('canvas');
  cropCanvas.width=Math.round(w*factor);cropCanvas.height=Math.round(h*factor);
  cropCanvas.getContext('2d').drawImage(picture,(x-450+dimensions.width*scale/2)*factor,(y-450+dimensions.height*scale/2)*factor,w*factor,h*factor,0,0,cropCanvas.width,cropCanvas.height);
  await loadImage(cropCanvas.toDataURL('image/png'),`${sourceName.replace(/ · 已取景$/,'')} · 已取景`);
});
function download(surface,name) {const a=document.createElement('a');a.download=name;a.href=surface.toDataURL('image/png');a.click();}
$('download-sketch').addEventListener('click',()=>{if(sketch)download(sketch,'fourier-lineart.png');});
$('download').addEventListener('click',()=>{
  const output=document.createElement('canvas');output.width=output.height=900;const out=output.getContext('2d');out.fillStyle='#161512';out.fillRect(0,0,900,900);out.drawImage(trail,0,0);download(output,'fourier-portrait.png');
});

function drawTrail(target) {
  ink.strokeStyle='#e7bf7d';ink.lineWidth=1.65;ink.lineJoin='round';ink.lineCap='round';ink.beginPath();
  const start=evaluate(active,drawn/resolution);ink.moveTo(450+start.x*scale,450+start.y*scale);
  for(let i=drawn+1;i<=target;i++) {
    const p=evaluate(active,i/resolution),x=450+p.x*scale,y=450+p.y*scale;
    if(path[Math.min(path.length-1,Math.floor(i/resolution*path.length))]?.draw)ink.lineTo(x,y);else ink.moveTo(x,y);
  }
  ink.stroke();drawn=target;
}

function drawSurface(surface,alpha=1) {
  ctx.globalAlpha=alpha;
  const w=dimensions.width*scale,h=dimensions.height*scale;
  ctx.drawImage(surface,450-w/2,450-h/2,w,h);ctx.globalAlpha=1;
}

function render() {
  ctx.clearRect(0,0,900,900);
  ctx.fillStyle='#b99a62';
  for(let i=0;i<55;i++) {const x=(i*173.71+51)%900,y=(i*i*113.17+47)%900;ctx.globalAlpha=.08+(i%4)*.035;ctx.beginPath();ctx.arc(x,y,i%7===0?1.3:.6,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  if(view==='photo'&&picture){
    drawSurface(picture);
    if(cropping){ctx.strokeStyle='#ffe0a0';ctx.lineWidth=2;ctx.setLineDash([8,5]);const a=cropStart||{x:450-dimensions.width*scale/2,y:450-dimensions.height*scale/2},b=cropEnd||{x:450+dimensions.width*scale/2,y:450+dimensions.height*scale/2};ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([]);}
    return;
  }
  if(view==='sketch'&&sketch){drawSurface(sketch);if(stage==='sketch'&&stageTime<1.6&&!reduced.matches)drawSurface(picture,Math.max(0,1-stageTime/1.6));return;}
  if(stage==='reveal'){
    ctx.fillStyle='#e6c38a';const count=Math.floor(path.length*Math.min(1,stageTime/1.3));
    for(let i=0;i<count;i+=2){const p=path[i];if(!p.draw)continue;ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(450+p.x*scale,450+p.y*scale,1.25,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;return;
  }
  if($('original').checked&&picture)drawSurface(picture,.13);
  if(isDemo){
    ctx.globalAlpha=.15;ctx.strokeStyle='#d7b477';ctx.lineWidth=1;ctx.beginPath();
    for(let i=0;i<path.length;i++){const p=path[i],x=450+p.x*scale,y=450+p.y*scale;if(!i||!p.draw)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.shadowBlur=reduced.matches?0:6;ctx.shadowColor='#daa65a55';ctx.drawImage(trail,0,0);ctx.shadowBlur=0;
  if(stage==='result')ctx.globalAlpha=.25;
  let x=450,y=450;
  if($('circles').checked)for(const c of active){
    const a=c.phase+2*Math.PI*c.k*time,nx=x+c.amplitude*Math.cos(a)*scale,ny=y+c.amplitude*Math.sin(a)*scale;
    if(c.amplitude*scale>1){ctx.strokeStyle='#d6b77830';ctx.lineWidth=.75;ctx.beginPath();ctx.arc(x,y,c.amplitude*scale,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#e7b86c55';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();}x=nx;y=ny;
  }else{const p=evaluate(active,time);x+=p.x*scale;y+=p.y*scale;}
  ctx.globalAlpha=1;
  if(stage==='result')return;
  ctx.fillStyle='#ffe1a0';ctx.shadowColor='#ffd17f';ctx.shadowBlur=reduced.matches?0:14;ctx.beginPath();ctx.arc(x,y,2.6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
}

function frame(timestamp) {
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
  render();requestAnimationFrame(frame);
}

function formulas(){if(window.katex)for(const element of document.querySelectorAll('[data-tex]'))window.katex.render(element.dataset.tex,element,{throwOnError:false});}
window.addEventListener('load',formulas);
loadImage('samples/fourier.jpg','示例 / 傅里叶',true,'fourier');requestAnimationFrame(frame);
