// 9:16 drawing video that shows what a Fourier series *is*, not just the result:
//   A  draw   — XY epicycle chains trace the portrait (every line is a sum of circles)
//   B  ladder — the same curve rebuilt with 2 → 4 → … → N circles (low frequencies shape, high ones detail)
//   C  reveal — the sketch develops under the lines, then the name (skipped in guessing mode)
//   D  end    — short QR + call to action
import {xyLayout,axisEnvelope} from './fourier.mjs';
import {canonicalFormula,formulaLines,frequencyLadder} from './formula.mjs';
import {ladderRungs,portraitCurve,trimLadder} from './ladder.mjs';
import {getPalette} from './palettes.mjs';

export const VIDEO_SIZE={width:720,height:1280};
export const VIDEO_TIMELINE=[['draw',7.5],['ladder',4],['reveal',2],['end',2.5]];
export const videoDuration=()=>VIDEO_TIMELINE.reduce((s,[,d])=>s+d,0);

// Which act a time falls in and the local progress 0..1 inside it.
export function videoPhase(time){
  let start=0;
  for(const [name,duration] of VIDEO_TIMELINE){
    if(time<start+duration)return {name,progress:Math.max(0,(time-start)/duration)};
    start+=duration;
  }
  return {name:'end',progress:1};
}

const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
const clamp01=v=>Math.max(0,Math.min(1,v));

export const ladderLevels=frequencyLadder;
export {trimLadder};

// chains: the shared/active chains (amplitude-sorted); path: samples with pen-lift flags.
export function prepareVideo({mode,chains,path,dimensions,sketch=null,qr=null,name='',guess=false,hint='',lang='zh',palette='ink'}){
  const formula=canonicalFormula(mode,chains),total=formula.circles;
  if(!path.length||!total)throw new RangeError('Nothing to draw');
  const samples=Math.max(2400,path.length),trail=portraitCurve(mode,chains,path,samples),ladder=trimLadder(ladderRungs(mode,chains,path,samples));
  const layout=mode==='xy'?xyLayout(dimensions,axisEnvelope(chains.x),axisEnvelope(chains.y)):{plot:{x:450,y:450,scale:590/Math.max(dimensions.width,dimensions.height)}};
  // After the chains have drawn, the camera moves in: the portrait alone, centred and larger.
  const focus={x:450,y:430,scale:800/Math.max(dimensions.width,dimensions.height)};
  return {mode,chains,path,dimensions,sketch,qr,name,guess,hint,lang,colors:getPalette(palette),trail,samples,ladder,layout,focus,total,formula:formulaLines(formula,2)};
}

const t=(prep,zh,en)=>prep.lang==='zh'?zh:en;

function chain(ctx,values,origin,time,scale,rotation,colors){
  let {x,y}=origin;
  for(const c of values){
    const a=c.phase+2*Math.PI*c.k*time+rotation,r=c.amplitude*scale,nx=x+r*Math.cos(a),ny=y+r*Math.sin(a);
    if(r>.6){ctx.strokeStyle=r>8?colors.strong:colors.guide;ctx.lineWidth=r>8?1.6:1;ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.stroke();ctx.strokeStyle=colors.accent+'AA';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();}
    x=nx;y=ny;
  }
  return {x,y};
}

function stroke(ctx,points,map,upto=points.length,lifts=true){
  ctx.beginPath();
  for(let i=0;i<upto;i++){const p=map(points[i]);if(!i||(lifts&&!points[i].draw))ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
  ctx.stroke();
}

function text(ctx,value,x,y,size,color,align='left',font='"Noto Serif SC",serif'){
  ctx.font=`${size}px ${font}`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y);ctx.textAlign='left';
}

export function drawVideoFrame(ctx,prep,time){
  const {width,height}=VIDEO_SIZE,{colors,layout,mode,chains}=prep,phase=videoPhase(time);
  ctx.save();ctx.fillStyle=colors.background;ctx.fillRect(0,0,width,height);
  // header: seal, title, the formula being animated
  ctx.fillStyle=colors.accent;ctx.fillRect(48,52,40,56);text(ctx,'圆',68,76,20,colors.background,'center');text(ctx,'周',68,100,20,colors.background,'center');
  text(ctx,t(prep,'我的傅里叶画像','My Fourier portrait'),108,96,36,colors.text);
  // The real formula being drawn — the same text as the card and the page.
  prep.formula.forEach(({axis,text:line},i)=>{ctx.save();ctx.font='italic 20px KaTeX_Main,serif';const value=`${axis}(t) = ${line}`,w=ctx.measureText(value).width,scale=Math.min(1,(width-96)/w);ctx.translate(48,142+i*28);ctx.scale(scale,1);ctx.fillStyle=colors.muted;ctx.fillText(value,0,0);ctx.restore();});
  ctx.strokeStyle=colors.accent+'55';ctx.beginPath();ctx.moveTo(48,184);ctx.lineTo(width-48,184);ctx.stroke();
  // plotting area: the app's 900x900 instrument space mapped to 720x720
  const S=.8,OY=210;ctx.translate(0,OY);ctx.scale(S,S);
  const move=phase.name==='draw'?0:phase.name==='ladder'?ease(clamp01(phase.progress/.18)):1,mix=(a,b)=>a+(b-a)*move;
  const plot=phase.name==='draw'?layout.plot:{x:mix(layout.plot.x,prep.focus.x),y:mix(layout.plot.y,prep.focus.y),scale:mix(layout.plot.scale,prep.focus.scale)},map=p=>({x:plot.x+p.x*plot.scale,y:plot.y+p.y*plot.scale});
  ctx.lineCap=ctx.lineJoin='round';
  let caption='',detail='';
  if(phase.name==='draw'){
    const u=ease(phase.progress),upto=Math.max(1,Math.floor(u*prep.samples));
    ctx.strokeStyle=colors.line;ctx.lineWidth=2.4;stroke(ctx,prep.trail,map,upto);
    let tip;
    if(mode==='xy'){
      const X=chain(ctx,chains.x,layout.top,u,plot.scale,0,colors),Y=chain(ctx,chains.y,layout.left,u,plot.scale,Math.PI/2,colors);tip={x:X.x,y:Y.y};
      ctx.strokeStyle=colors.accent+'70';ctx.lineWidth=1.2;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(X.x,X.y);ctx.lineTo(tip.x,tip.y);ctx.lineTo(Y.x,Y.y);ctx.stroke();ctx.setLineDash([]);
    }else tip=chain(ctx,chains.complex,plot,u,plot.scale,0,colors);
    ctx.fillStyle=colors.accent;ctx.beginPath();ctx.arc(tip.x,tip.y,4,0,2*Math.PI);ctx.fill();
    caption=t(prep,'每一笔，都是圆的回声','Every line is an echo of circles');detail=`t = ${u.toFixed(2)}  ·  ${prep.total} ${t(prep,'个圆','circles')}`;
  }else if(phase.name==='ladder'){
    const levels=prep.ladder,position=phase.progress*(levels.length-1),i=Math.min(levels.length-2,Math.floor(position)),f=levels.length>1?ease(clamp01((position-i)/.55)):0;
    const a=levels[Math.max(0,i)],b=levels[Math.min(levels.length-1,i+1)],shown=f<.5?a:b,points=a.points.map((p,j)=>({x:p.x+(b.points[j].x-p.x)*f,y:p.y+(b.points[j].y-p.y)*f,draw:f<.5?p.draw:b.points[j].draw}));
    // One closed curve (faint, including pen travel) — the strokes are where the pen touches paper.
    ctx.strokeStyle=colors.guide;ctx.lineWidth=1;stroke(ctx,points,map,points.length,false);
    ctx.strokeStyle=colors.line;ctx.lineWidth=2.2;stroke(ctx,points,map);
    caption=t(prep,'低频定轮廓，高频添细节','Low frequencies shape. High ones add detail.');
    detail=t(prep,`${shown.n} 个圆 · 保留 ${(shown.energy*100).toFixed(1)}% 能量`,`${shown.n} circles · ${(shown.energy*100).toFixed(1)}% of the energy`);
  }else{
    const reveal=phase.name==='reveal'?ease(phase.progress):1;
    if(prep.sketch&&!prep.guess){
      const w=prep.dimensions.width*plot.scale,h=prep.dimensions.height*plot.scale;
      ctx.globalAlpha=reveal;ctx.globalCompositeOperation='multiply';ctx.drawImage(prep.sketch,plot.x-w/2,plot.y-h/2,w,h);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    }
    ctx.strokeStyle=colors.line;ctx.globalAlpha=prep.sketch&&!prep.guess?1-.65*reveal:1;ctx.lineWidth=2.2;stroke(ctx,prep.trail,map);ctx.globalAlpha=1;
    caption=prep.guess?t(prep,'猜猜我是谁？','Guess who?')+(prep.hint?t(prep,` 提示：${prep.hint}`,` Hint: ${prep.hint}`):''):prep.name?t(prep,`${prep.name}，原来圆周记得你`,`${prep.name} — the circles remember`):t(prep,'原来，圆周记得你','The circles remember you');
    detail=t(prep,`${prep.total} 个旋转的圆 · 一个公式`,`${prep.total} rotating circles · one formula`);
  }
  ctx.setTransform(1,0,0,1,0,0);
  // footer
  if(phase.name==='end'){
    const fade=ease(clamp01(phase.progress/.4));ctx.globalAlpha=fade;
    ctx.fillStyle=colors.background;ctx.fillRect(0,950,width,height-950);
    if(prep.qr){const size=220,x=width-48-size,y=height-60-size;ctx.imageSmoothingEnabled=false;ctx.drawImage(prep.qr,x,y,size,size);ctx.imageSmoothingEnabled=true;}
    text(ctx,prep.guess?t(prep,'猜到了吗？','Got it?'):t(prep,'扫码，看它画出我','Scan to watch it draw me'),48,height-200,40,colors.text);
    text(ctx,prep.guess?t(prep,'扫码揭晓答案','Scan to find out'):t(prep,'也生成你自己的公式','Then make your own formula'),48,height-150,26,colors.muted);
    text(ctx,'fourier.jupyter.pro',48,height-84,24,colors.accent,'left','"Noto Sans SC",sans-serif');
    ctx.globalAlpha=1;
  }else{
    text(ctx,caption,width/2,height-190,38,colors.text,'center');
    text(ctx,detail,width/2,height-136,24,colors.muted,'center','"Noto Sans SC",sans-serif');
    // act progress bar
    const done=VIDEO_TIMELINE.findIndex(([n])=>n===phase.name);
    VIDEO_TIMELINE.forEach(([n],i)=>{ctx.fillStyle=i<done||i===done?colors.accent:colors.guide;ctx.fillRect(48+i*((width-96)/4),height-70,(width-96)/4-10,i===done?4:2);});
  }
  ctx.restore();
}

export function preferredVideoType(isSupported=type=>globalThis.MediaRecorder?.isTypeSupported?.(type)){
  return ['video/mp4;codecs=avc1.42E01F','video/mp4','video/webm;codecs=vp9','video/webm'].find(type=>isSupported(type))||'';
}

// Real-time capture (MediaRecorder); resolves to a Blob. The page must stay visible while recording.
export function recordVideo(prep,{onProgress=()=>{},signal}={}){
  const type=preferredVideoType();
  if(!type)return Promise.reject(new Error('Video recording unsupported'));
  const canvas=document.createElement('canvas');canvas.width=VIDEO_SIZE.width;canvas.height=VIDEO_SIZE.height;
  const ctx=canvas.getContext('2d'),stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:6e6}),chunks=[],duration=videoDuration();
  return new Promise((resolve,reject)=>{
    let start=0,stopped=false;
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());stopped?reject(new DOMException('Cancelled','AbortError')):resolve(new Blob(chunks,{type:type.split(';')[0]}));};
    signal?.addEventListener('abort',()=>{stopped=true;if(recorder.state!=='inactive')recorder.stop();});
    const frame=now=>{
      if(stopped)return;
      if(!start)start=now;
      const time=Math.min(duration,(now-start)/1000);drawVideoFrame(ctx,prep,time);onProgress(time/duration);
      if(time<duration)requestAnimationFrame(frame);else setTimeout(()=>recorder.state!=='inactive'&&recorder.stop(),120);
    };
    drawVideoFrame(ctx,prep,0);recorder.start(250);requestAnimationFrame(frame);
  });
}
