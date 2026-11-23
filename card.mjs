import {drawInk,inkProfile} from './ink.mjs';
import {drawSketch} from './sketch.mjs';
import {renderTonePixels} from './tone.mjs';
import {samplePortrait,closeStrokeSeams} from './portrait-render.mjs';
import {limitChains} from './portrait.mjs';
import {scoreCopy} from './riddle.mjs';
import {axisTerms,expression,expressionParts,canonicalFormula,formulaLines} from './formula.mjs';
import {shareQrSegments} from './share.mjs';
import {getPalette} from './palettes.mjs';
import {persona} from './persona.mjs';
import {fourierPortrait} from './samples/fourier-formula.mjs';

export const CARD_GOLD=getPalette('ink').line,CARD_NIGHT=getPalette('ink').background;

export function drawCardQr(ctx,qr,x,y,unit=4,palette='ink'){
  const modules=qr.getModuleCount();
  if(!Number.isInteger(unit)||unit<4||!Number.isInteger(x)||!Number.isInteger(y))throw new RangeError('QR modules require integer pixels');
  if(modules<21||modules>105||(modules-17)%4)throw new RangeError('QR is too dense');
  const extent=(modules+8)*unit,colors=getPalette(palette);
  ctx.save();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle=colors.background;ctx.fillRect(x,y,extent,extent);ctx.fillStyle=colors.line;
  for(let row=0;row<modules;row++)for(let col=0;col<modules;col++)if(qr.isDark(row,col))ctx.fillRect(x+(col+4)*unit,y+(row+4)*unit,unit,unit);
  ctx.restore();return extent;
}

export function numericExcerpt(values,real=true){
  return expression(axisTerms(values,real),{real,limit:2});
}

const fourierCaption=zh=>zh?'傅里叶的公式 → 傅里叶':'Fourier’s formula → Fourier';

export function cardCopy({mode,chains,name='',guess=false,hint='',lang='en',toneMap=null,encryptedSketch=null}){
  const zh=lang==='zh',formula=canonicalFormula(mode,chains),total=formula.circles,who=!guess&&name?name:(zh?'我':'Me');
  return {
    title:zh?'我的傅里叶公式':'My Fourier Formula',
    headline:zh?`${who} = ${total} 个旋转的圆`:`${who} = ${total} rotating circles`,
    teaser:guess?(zh?'猜猜我是谁？':'Guess who?')+(hint?(zh?`  提示：${hint}`:`  Hint: ${hint}`):''):(zh?'每一笔，都是圆的回声。':'Every line is an echo of circles.'),
    spectrum:zh?'频谱指纹 · 这串频率只属于这张脸':'Spectral fingerprint · these frequencies belong to one face',
    cta:zh?[guess?'扫码揭晓，看它画出我。':'扫码，看它画出我。']:guess?['Scan to find out','as it draws me.']:['Scan to watch','it draw me.'],
    privacy:zh?['原始照片不上传',encryptedSketch?'素描与公式端到端加密 · 30 天':toneMap?'分享公式与素描明暗':'只分享公式']:['Original photo stays local.',encryptedSketch?'Sketch encrypted · 30 days.':toneMap?'Formula + sketch tones.':'Only the formula is shared.'],
    example:fourierCaption(zh),
    mystery:zh?'我的公式 → ?':'My formula → ?',
    nickname:!guess?name:'',
    equations:formulaLines(formula,2).map(({axis,text,parts,more,terms})=>({axis,text,lines:[`= ${parts[0]??'0'}`,...(parts.length>1?[parts.slice(1).join(' ')+(more?' + ⋯':'')]:[])],terms:zh?`… 共 ${terms} 项`:`… ${terms} ${terms===1?'term':'terms'}`}))
  };
}

// The hero never shows the face in guessing mode: only an 8-circle silhouette. At 8 circles every sample is a
// distinct, flowing closed curve (at 5 some collapse to a line) and nobody is recognisable yet.
export const cardHero=({guess=false,sketch=null})=>guess?'silhouette':sketch?'portrait':'lines';
export const SILHOUETTE_CIRCLES=8;

// Epicycle residue: the few largest circles of one chain at time t, linked tip to centre — real circles of this formula.
export const RESIDUE_T=.37;
export function residueLinks(values,count=4,t=RESIDUE_T,rotation=0){
  let x=0,y=0;
  return values.filter(c=>c.k&&c.amplitude>0).sort((a,b)=>b.amplitude-a.amplitude).slice(0,count).map(c=>{
    const a=c.phase+2*Math.PI*c.k*t+rotation,link={cx:x,cy:y,r:c.amplitude};x+=c.amplitude*Math.cos(a);y+=c.amplitude*Math.sin(a);return {...link,x,y};
  });
}

// |coefficient| per frequency k (conjugate pairs merged), per axis — a per-portrait "fingerprint".
export function spectrumBars(mode,chains,count=144){
  const axes=mode==='xy'?[chains.x,chains.y]:[chains.complex],bars=axes.map(()=>new Float64Array(count));
  axes.forEach((values,a)=>{for(const c of values){const k=Math.abs(c.k);if(k>=1&&k<=count&&Number.isFinite(c.amplitude))bars[a][k-1]+=c.amplitude;}});
  const max=Math.max(1e-12,...bars.flatMap(b=>[...b]));
  return bars.map(b=>Array.from(b,v=>Math.log1p(200*v/max)/Math.log1p(200)));
}

// Short, stable edition number derived from the formula itself.
export function editionNumber(mode,chains){
  let h=2166136261;
  for(const c of [...(mode==='xy'?[...chains.x,...chains.y]:chains.complex)].slice(0,64)){for(const v of [c.k,Math.round(c.amplitude*100),Math.round(c.phase*100)]){h^=v&0xffff;h=Math.imul(h,16777619);h^=v>>>16;h=Math.imul(h,16777619);}}
  return String((h>>>0)%100000).padStart(5,'0');
}

function mathLine(ctx,text,x,y,width,size){
  ctx.save();ctx.font=`italic ${size}px KaTeX_Math,KaTeX_Main,serif`;
  const metrics=ctx.measureText(text),left=Math.max(0,metrics.actualBoundingBoxLeft||0),right=Math.max(metrics.width,metrics.actualBoundingBoxRight||0),scale=Math.min(1,width/Math.max(1,left+right));
  ctx.translate(x+left*scale,y);ctx.scale(scale,scale);ctx.fillText(text,0,0);ctx.restore();
}

// Short pointers get stronger error correction and larger modules; long self-contained links stay at 4px modules.
function drawShareQr(ctx,url,right,bottom,size){
  const short=url.includes('#s'),qr=window.qrcode(0,short?'Q':'L');for(const segment of shareQrSegments(url))qr.addData(segment.data,segment.mode);qr.make();
  const modules=qr.getModuleCount(),unit=short?Math.max(4,Math.floor(size/(modules+8))):4,extent=(modules+8)*unit,top=bottom-extent;drawCardQr(ctx,qr,right-extent,top,unit);
  return {modules,top,extent};
}

function drawLens(ctx,cx,cy,R,colors){
  ctx.save();ctx.strokeStyle=colors.line+'40';ctx.lineWidth=1;
  for(const r of [R,R+16]){ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.stroke();}
  for(let i=0;i<120;i++){const a=i/120*2*Math.PI,long=i%10===0,r0=R+16,r1=R+16+(long?14:6);ctx.strokeStyle=long?colors.accent+'99':colors.line+'40';ctx.beginPath();ctx.moveTo(cx+r0*Math.cos(a),cy+r0*Math.sin(a));ctx.lineTo(cx+r1*Math.cos(a),cy+r1*Math.sin(a));ctx.stroke();}
  ctx.restore();
}

function drawHero(ctx,{cx,cy,R,mode,chains,path,dimensions,sketch,guess,colors,tone=null}){
  const hero=cardHero({guess,sketch}),scale=2*R*.84/Math.max(dimensions.width,dimensions.height),map=p=>({x:cx+p.x*scale,y:cy+p.y*scale});
  drawLens(ctx,cx,cy,R,colors);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R-3,0,2*Math.PI);ctx.clip();ctx.lineCap=ctx.lineJoin='round';
  if(hero==='portrait'){const w=dimensions.width*scale,h=dimensions.height*scale;drawSketch(ctx,sketch,cx-w/2,cy-h/2,w,h,'ink');}
  else if(hero==='lines'&&tone){
    // Coarse tones carried inside the QR itself, rendered with the same hatching as the visitor page.
    const w=Math.round(dimensions.width*scale),h=Math.round(dimensions.height*scale),layer=document.createElement('canvas');layer.width=w;layer.height=h;
    const lc=layer.getContext('2d'),pixels=lc.createImageData(w,h),ink=[1,3,5].map(i=>parseInt(colors.line.slice(i,i+2),16));
    pixels.data.set(renderTonePixels(tone,w,h,ink));lc.putImageData(pixels,0,0);ctx.globalAlpha=.85;ctx.drawImage(layer,cx-w/2,cy-h/2);ctx.globalAlpha=1;
  }
  const points=closeStrokeSeams(samplePortrait(mode,chains,path,Math.max(4000,path.length*2)),12);
  ctx.strokeStyle=colors.line;ctx.globalAlpha=hero==='portrait'?.42:tone?.8:1;
  drawInk(ctx,points,inkProfile(points),map,{width:2.6});
  ctx.globalAlpha=1;
  ctx.restore();
}

function drawSpectrum(ctx,bars,x,y,width,height,colors){
  const count=bars[0].length,step=width/count,half=bars.length>1?height/2:height,base=bars.length>1?y+half:y+height;
  ctx.save();ctx.fillStyle=colors.line;
  bars.forEach((values,axis)=>values.forEach((v,i)=>{const h=Math.max(1,v*(half-4));ctx.globalAlpha=.35+.65*v;ctx.fillRect(x+i*step,axis?base+2:base-h-2,Math.max(1,step*.62),h);}));
  ctx.globalAlpha=1;ctx.strokeStyle=colors.accent+'88';ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x+width,base);ctx.stroke();ctx.restore();
}

// A faint aside, never over the face: the largest circles of one axis, scaled so their radii add up to `size`,
// with a dashed guide from the tip in the direction that axis feeds the pen (x → down, y → right).
function drawResidue(ctx,links,ox,oy,size,colors,guide){
  const sum=links.reduce((s,l)=>s+l.r,0);if(!sum)return;
  // centre the chain's bounding box (circles included) on (ox, oy) so it never wanders off the card
  const k=size/sum,box=links.reduce((b,l)=>[Math.min(b[0],l.cx-l.r),Math.min(b[1],l.cy-l.r),Math.max(b[2],l.cx+l.r),Math.max(b[3],l.cy+l.r)],[Infinity,Infinity,-Infinity,-Infinity]);
  ox-=(box[0]+box[2])/2*k;oy-=(box[1]+box[3])/2*k;
  const p=(x,y)=>[ox+x*k,oy+y*k],tip=p(links.at(-1).x,links.at(-1).y);
  ctx.save();ctx.lineWidth=1;
  for(const l of links){
    ctx.strokeStyle=colors.line+'22';ctx.beginPath();ctx.arc(...p(l.cx,l.cy),l.r*k,0,2*Math.PI);ctx.stroke();
    ctx.strokeStyle=colors.line+'38';ctx.beginPath();ctx.moveTo(...p(l.cx,l.cy));ctx.lineTo(...p(l.x,l.y));ctx.stroke();
    ctx.fillStyle=colors.line+'38';ctx.beginPath();ctx.arc(...p(l.cx,l.cy),1.8,0,2*Math.PI);ctx.fill();
  }
  if(guide){ctx.strokeStyle=colors.accent+'40';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(...tip);ctx.lineTo(tip[0]+guide[0],tip[1]+guide[1]);ctx.stroke();ctx.setLineDash([]);}
  ctx.fillStyle=colors.accent+'80';ctx.beginPath();ctx.arc(...tip,3,0,2*Math.PI);ctx.fill();
  ctx.restore();
}

// x chain top-right (tip feeds the pen downward), y chain lower-left rotated a quarter turn (tip feeds rightward).
function drawResidues(ctx,mode,chains,colors,{x,y,complex}){
  if(mode==='xy'){
    drawResidue(ctx,residueLinks(chains.x),x[0],x[1],x[2],colors,[0,x[2]*.55]);
    drawResidue(ctx,residueLinks(chains.y,4,RESIDUE_T,Math.PI/2),y[0],y[1],y[2],colors,[y[2]*.55,0]);
  }else drawResidue(ctx,residueLinks(chains.complex,5),...complex,colors,null);
}

// The persona line ("圆周判词"): a small vermilion label, then the verdict; shrunk to fit the measure if needed.
function drawVerdict(ctx,text,{x,y,width,size,lang,colors,center=false}){
  const label=lang==='zh'?'圆周判词':'Verdict',labelFont=`${Math.round(size*.72)}px "Noto Sans SC",sans-serif`,textFont=`${size}px "Noto Serif SC",serif`,gap=size*.7;
  ctx.save();ctx.font=labelFont;const lw=ctx.measureText(label).width;ctx.font=textFont;const tw=ctx.measureText(text).width,total=lw+gap+tw,k=Math.min(1,width/total);
  ctx.translate(center?x-total*k/2:x,y);ctx.scale(k,k);ctx.textAlign='left';
  ctx.fillStyle=colors.accent;ctx.font=labelFont;ctx.fillText(label,0,-1);
  ctx.fillStyle=colors.text;ctx.font=textFont;ctx.fillText(text,lw+gap,0);ctx.restore();
}

// A formula as one curve inside a box, at the same scale its full portrait would use.
function drawFormulaCurve(ctx,{mode,chains,path,dimensions},box,colors,{continuous=false,width=2.4}={}){
  const scale=Math.min(box.w*.88/dimensions.width,box.h*.9/dimensions.height),cx=box.x+box.w/2,cy=box.y+box.h/2,map=p=>({x:cx+p.x*scale,y:cy+p.y*scale});
  const points=closeStrokeSeams(samplePortrait(mode,chains,path,Math.max(4000,path.length*2)),12);
  ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();ctx.strokeStyle=colors.line;ctx.lineCap=ctx.lineJoin='round';
  // The silhouette is one continuous curve (no pen lifts); portraits use tapered hand-drawn ink.
  if(continuous){ctx.lineWidth=width;ctx.beginPath();points.forEach((p,i)=>{const q=map(p);if(!i)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.stroke();}
  else drawInk(ctx,points,inkProfile(points),map,{width});
  ctx.restore();
}

function drawMark(ctx,x,y,size,colors){
  ctx.fillStyle=colors.accent;ctx.fillRect(x,y,size,size);ctx.fillStyle=colors.background;ctx.font=`${Math.round(size*.72)}px "Noto Serif SC",serif`;ctx.textAlign='center';ctx.fillText('?',x+size/2,y+size*.76);ctx.textAlign='left';
}

// Guessing mode: "Fourier's formula → Fourier" beside "My formula → ?". Fourier's own portrait is drawn from his
// full formula; mine shows only its 8 largest circles — enough to be a shape, not enough to be a face.
const CONTRAST_W=432,CONTRAST_MAX=Math.round(CONTRAST_W*1.3)+96;
function drawContrast(ctx,{top,height,mode,chains,path,dimensions,colors,lang,mystery}){
  const zh=lang==='zh',caption=height>520?96:84,boxH=height-caption,gap=40,w=(904-gap)/2,boxes=[{x:88,y:top,w,h:boxH},{x:88+w+gap,y:top,w,h:boxH}];
  const fourier=fourierPortrait,fourierCircles=fourier.chains.x.length+fourier.chains.y.length,total=canonicalFormula(mode,chains).circles,shown=Math.min(SILHOUETTE_CIRCLES,total);
  // corner marks instead of boxes; a hairline between the two
  ctx.save();ctx.strokeStyle=colors.line+'55';ctx.lineWidth=1.2;
  for(const b of boxes)for(const [sx,sy] of [[0,0],[1,0],[0,1],[1,1]]){const x=Math.round(b.x+sx*b.w)+.5,y=Math.round(b.y+sy*b.h)+.5,dx=sx?-22:22,dy=sy?-22:22;ctx.beginPath();ctx.moveTo(x+dx,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy);ctx.stroke();}
  ctx.strokeStyle=colors.accent+'44';ctx.beginPath();ctx.moveTo(540.5,top+boxH*.2);ctx.lineTo(540.5,top+boxH*.8);ctx.stroke();ctx.restore();
  drawFormulaCurve(ctx,fourier,boxes[0],colors,{width:2.2});
  ctx.save();ctx.globalAlpha=.92;drawFormulaCurve(ctx,{mode,chains:limitChains(mode,chains,SILHOUETTE_CIRCLES),path,dimensions},boxes[1],colors,{continuous:true,width:3});ctx.restore();
  drawMark(ctx,Math.round(boxes[1].x+boxes[1].w-74),Math.round(top+18),56,colors);
  const big=height>520?34:30,small=height>520?20:18;
  boxes.forEach((b,i)=>{
    const cx=b.x+b.w/2,y=top+boxH+big+18;ctx.textAlign='center';
    ctx.fillStyle=i?colors.accent:colors.text;ctx.font=`${big}px "Noto Serif SC",serif`;fitCentered(ctx,i?mystery:fourierCaption(zh),cx,y,b.w-8);
    ctx.fillStyle=colors.muted;ctx.font=`${small}px "Noto Sans SC",sans-serif`;
    fitCentered(ctx,i?(zh?`只画最大的 ${shown} 个圆 · 共 ${total} 个`:`only the ${shown} largest of ${total} circles`):(zh?`全部 ${fourierCircles} 个圆`:`all ${fourierCircles} circles`),cx,y+small+14,b.w-8);
    ctx.textAlign='left';
  });
}

// CTA, site and privacy left of the QR: anchored to the QR's top when it is tall, to the card's foot otherwise.
function drawFooter(ctx,{qr,h,colors,cta,privacy,size=38}){
  const step=size+10,first=Math.min(qr.top+size+26,h-112-50-56-(cta.length-1)*step);
  ctx.fillStyle=colors.text;ctx.font=`${size}px "Noto Serif SC",serif`;cta.forEach((line,i)=>ctx.fillText(line,88,first+i*step));
  ctx.fillStyle=colors.accent;ctx.font='24px "Noto Sans SC",sans-serif';ctx.fillText('fourier.jupyter.pro',88,first+(cta.length-1)*step+56);
  ctx.fillStyle=colors.muted;ctx.font='20px "Noto Serif SC",serif';privacy.forEach((line,i)=>ctx.fillText(line,88,h-112+i*30));
}

function fitCentered(ctx,text,cx,y,width){
  const k=Math.min(1,width/Math.max(1,ctx.measureText(text).width));
  ctx.save();ctx.translate(cx,y);ctx.scale(k,k);ctx.textAlign='center';ctx.fillText(text,0,0);ctx.restore();
}

function drawHeader(ctx,colors,title,edition){
  ctx.fillStyle=colors.accent;ctx.fillRect(88,72,48,64);ctx.fillStyle=colors.background;ctx.textAlign='center';ctx.font='24px "Noto Serif SC",serif';ctx.fillText('圆',112,98);ctx.fillText('周',112,126);ctx.textAlign='left';
  ctx.fillStyle=colors.muted;ctx.font='22px "Noto Serif SC",serif';ctx.fillText(title,160,edition?100:112);
  if(edition){ctx.font='20px "Noto Sans SC",sans-serif';ctx.fillText(edition,160,128);}
}

function paper(ctx,h,colors){
  ctx.fillStyle=colors.background;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<26000;i++){ctx.fillStyle=colors.line+'06';ctx.fillRect(i*173%1080,i*i*137%h,1,1);}
  ctx.strokeStyle=colors.accent+'55';ctx.lineWidth=1;ctx.strokeRect(36.5,36.5,1007,h-73);
}

const dateText=date=>`${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;

export function renderSocialCard({mode,chains,path,dimensions,sketch=null,name='',guess=false,hint='',shareURL,lang='en',toneMap=null,encryptedSketch=null,date=new Date()},format='34'){
  const card=document.createElement('canvas');card.width=1080;card.height=format==='916'?1920:1440;
  const ctx=card.getContext('2d'),h=card.height,tall=format==='916',colors=getPalette('ink'),copy=cardCopy({mode,chains,name,guess,hint,lang,toneMap,encryptedSketch}),zh=lang==='zh';
  paper(ctx,h,colors);
  drawHeader(ctx,colors,zh?'圆周之间 · 傅里叶画像':'FOURIER PORTRAIT',`N° ${editionNumber(mode,chains)}  ·  ${dateText(date)}`);
  // The QR goes first: everything full-width must end above it (a self-contained QR is ≈450 px tall).
  const qr=drawShareQr(ctx,shareURL,1008,h-56,tall?270:230),bottom=qr.top-(tall?48:36);
  const verdict=guess?'':persona(mode,chains,lang),eqGap=40,verdictH=verdict?(tall?70:60):0;
  // Vertical budget below the hero: headline, teaser, formula lines, persona; the spectrum only when there is room.
  const after=tall?110:80,toFormula=tall?144:108,text=after+toFormula+(copy.equations.length-1)*eqGap+verdictH;
  const spectrum=(tall?40:16)+(tall?140:96),heroTop=tall?168:150,room=bottom-heroTop-text,minHero=guess?(tall?560:470):(tall?620:500);
  const withSpectrum=room-spectrum>=minHero,heroH=Math.min(guess?CONTRAST_MAX:(tall?860:620),room-(withSpectrum?spectrum:0));
  // Spare height (tall cards) is shared out between the blocks instead of pooling above the QR.
  const spare=Math.max(0,room-(withSpectrum?spectrum:0)-heroH),top=heroTop+spare*.3;
  if(guess)drawContrast(ctx,{top:top+12,height:heroH-12,mode,chains,path,dimensions,colors,lang,mystery:copy.mystery});
  else{
    const R=Math.round((heroH-34)/2),cy=top+heroH/2+4;
    const size=tall?150:124;drawResidues(ctx,mode,chains,colors,{x:[900,cy-R*.7,size],y:[180,cy+R*.62,size],complex:[900,cy+R*.62,size]});
    drawHero(ctx,{cx:540,cy,R,mode,chains,path,dimensions,sketch,guess,colors});
  }
  // headline + teaser + formula + persona
  let y=top+heroH+after+spare*.2;
  ctx.fillStyle=colors.text;ctx.textAlign='center';ctx.font=`${tall?62:54}px "Noto Serif SC",serif`;ctx.fillText(copy.headline,540,y);
  ctx.fillStyle=colors.accent;ctx.font='28px "Noto Serif SC",serif';ctx.fillText(copy.teaser,540,y+(tall?62:50));ctx.textAlign='left';
  y+=toFormula;ctx.fillStyle=colors.muted;
  copy.equations.forEach(({axis,text},i)=>mathLine(ctx,`${axis}(t) = ${text}`,88,y+i*eqGap,904,26));
  y+=(copy.equations.length-1)*eqGap;
  if(verdict)drawVerdict(ctx,verdict,{x:88,y:y+(tall?56:48),width:904,size:tall?25:23,lang,colors});
  y+=verdictH;
  // spectral fingerprint
  if(withSpectrum){
    y+=(tall?40:16)+spare*.2;drawSpectrum(ctx,spectrumBars(mode,chains),88,y,904,tall?110:70,colors);
    ctx.fillStyle=colors.muted;ctx.font='18px "Noto Serif SC",serif';ctx.fillText(copy.spectrum,88,y+(tall?140:96));
  }
  drawFooter(ctx,{qr,h,colors,cta:copy.cta,privacy:copy.privacy});
  return {canvas:card,qrVersion:(qr.modules-17)/4};
}

// Riddle score card: Fourier's formula beside the 8-circle silhouette, the score and a QR back to the same riddle. No name, no face.
export function renderScoreCard({mode,chains,path,dimensions,n,total,hint='',shareURL,lang='zh'}){
  const card=document.createElement('canvas');card.width=1080;card.height=1440;
  const ctx=card.getContext('2d'),h=card.height,colors=getPalette('ink'),copy=scoreCopy(n,total,lang),zh=lang==='zh';
  paper(ctx,h,colors);
  drawHeader(ctx,colors,zh?'圆周之间 · 猜猜我是谁':'FOURIER PORTRAIT · GUESS WHO');
  const {top}=drawShareQr(ctx,shareURL,1008,h-56,300),bottom=Math.min(top-36,1100);
  // contrast panels fill what the title and the QR leave
  const height=Math.min(CONTRAST_MAX,bottom-170-150);
  drawContrast(ctx,{top:170,height,mode,chains,path,dimensions,colors,lang,mystery:zh?'TA 的公式 → ?':'Their formula → ?'});
  const y=170+height+100;
  ctx.textAlign='center';ctx.fillStyle=colors.text;ctx.font='56px "Noto Serif SC",serif';ctx.fillText(copy.title,540,y);
  ctx.fillStyle=colors.muted;ctx.font='28px "Noto Serif SC",serif';ctx.fillText(copy.subtitle+(hint?(zh?` · 提示：${hint}`:` · Hint: ${hint}`):''),540,y+54);ctx.textAlign='left';
  ctx.fillStyle=colors.text;ctx.font='40px "Noto Serif SC",serif';ctx.fillText(copy.challenge,88,top+80);
  ctx.fillStyle=colors.accent;ctx.font='24px "Noto Sans SC",sans-serif';ctx.fillText('fourier.jupyter.pro',88,top+136);
  ctx.fillStyle=colors.muted;ctx.font='20px "Noto Serif SC",serif';ctx.fillText(zh?'成绩卡不含答案，放心转发':'No spoilers on this card',88,h-112);
  return card;
}

// Formula card: "This is my formula. It can bring back how I look."
// One hero (the portrait the formula draws), one short formula excerpt, one small QR.
// The printed terms are the same formula the QR opens (full precision in the HD bundle, or the
// self-contained payload when nothing was uploaded), so card, QR and page agree.
export function formulaCardCopy({formula,name='',lang='zh',selfContained=false}){
  const zh=lang==='zh',parts=formula.axes.map(a=>`${a.axis} ${a.terms.length}`).join(' / ');
  return {
    title:name?(zh?`${name}的公式。`:`${name}'s formula.`):(zh?'这是我的公式。':'This is my formula.'),
    subtitle:zh?'它能复原我的样子。':'It can bring back how I look.',
    summary:zh?`${formula.circles} 个旋转的圆 · ${parts} 项`:`${formula.circles} rotating circles · ${parts} terms`,
    cta:zh?'扫码，看这串公式画出我':'Scan to watch this formula draw me',
    note:selfContained?(zh?'二维码里就是这串公式 · 不经服务器':'The QR holds this formula · no server'):(zh?'原始照片不上传 · 端到端加密':'Original photo stays local · end-to-end encrypted')
  };
}

function drawFormulaPortrait(ctx,{cx,cy,width,height,mode,chains,path,dimensions,tone,sketch,colors}){
  const scale=Math.min(width/dimensions.width,height/dimensions.height),w=Math.round(dimensions.width*scale),h=Math.round(dimensions.height*scale);
  // Under the ink: the sketch from the HD bundle the QR opens, or the coarse tones inside a self-contained QR.
  if(sketch){ctx.globalAlpha=.38;drawSketch(ctx,sketch,cx-w/2,cy-h/2,w,h,'ink');ctx.globalAlpha=1;}
  else if(tone){
    const layer=document.createElement('canvas');layer.width=w;layer.height=h;
    const lc=layer.getContext('2d'),pixels=lc.createImageData(w,h),ink=[1,3,5].map(i=>parseInt(colors.line.slice(i,i+2),16));
    pixels.data.set(renderTonePixels(tone,w,h,ink));lc.putImageData(pixels,0,0);ctx.globalAlpha=.55;ctx.drawImage(layer,cx-w/2,cy-h/2);ctx.globalAlpha=1;
  }
  const points=closeStrokeSeams(samplePortrait(mode,chains,path,Math.max(6000,path.length*3)),12);
  ctx.strokeStyle=colors.line;drawInk(ctx,points,inkProfile(points),p=>({x:cx+p.x*scale,y:cy+p.y*scale}),{width:3.2});
}

export function renderFormulaCard({mode,chains,path,dimensions,toneMap=null,sketch=null,name='',shareURL,lang='zh',date=new Date()},format='34'){
  const card=document.createElement('canvas');card.width=1080;card.height=format==='916'?1920:1440;
  const ctx=card.getContext('2d'),h=card.height,tall=format==='916',colors=getPalette('ink'),zh=lang==='zh';
  const formula=canonicalFormula(mode,chains),selfContained=!shareURL.includes('#s'),copy=formulaCardCopy({formula,name,lang,selfContained});
  ctx.fillStyle=colors.background;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<26000;i++){ctx.fillStyle=colors.line+'06';ctx.fillRect(i*173%1080,i*i*137%h,1,1);}
  ctx.strokeStyle=colors.accent+'44';ctx.lineWidth=1;ctx.strokeRect(36.5,36.5,1007,h-73);
  // header
  ctx.fillStyle=colors.accent;ctx.fillRect(88,72,40,54);ctx.fillStyle=colors.background;ctx.textAlign='center';ctx.font='20px "Noto Serif SC",serif';ctx.fillText('圆',108,94);ctx.fillText('周',108,118);
  ctx.textAlign='left';ctx.fillStyle=colors.muted;ctx.font='20px "Noto Serif SC",serif';ctx.fillText(zh?'圆周之间 · 傅里叶公式':'FOURIER PORTRAIT · FORMULA',148,96);
  ctx.textAlign='right';ctx.font='18px "Noto Sans SC",sans-serif';ctx.fillText(`N° ${editionNumber(mode,chains)} · ${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`,992,96);ctx.textAlign='left';
  // hero: the portrait this formula draws
  // A self-contained QR is much larger (≈v22), so the hero gives up room for it.
  const heroTop=tall?190:160,heroHeight=selfContained?(tall?690:400):(tall?880:610);
  const size=tall?140:118;drawResidues(ctx,mode,chains,colors,{x:[880,heroTop+(tall?150:120),size],y:[200,heroTop+heroHeight-(tall?160:120),size],complex:[880,heroTop+heroHeight-(tall?160:120),size]});
  drawFormulaPortrait(ctx,{cx:540,cy:heroTop+heroHeight/2,width:820,height:heroHeight,mode,chains,path,dimensions,tone:toneMap,sketch,colors});
  // title
  let y=heroTop+heroHeight+(tall?110:86);
  ctx.textAlign='center';ctx.fillStyle=colors.text;ctx.font=`${tall?60:52}px "Noto Serif SC",serif`;ctx.fillText(copy.title,540,y);
  ctx.fillStyle=colors.accent;ctx.font=`${tall?32:28}px "Noto Serif SC",serif`;ctx.fillText(copy.subtitle,540,y+(tall?58:48));
  // formula excerpt: upright numerals, the leading terms of each axis
  y+=tall?130:104;ctx.fillStyle=colors.line;
  for(const {axis,terms} of formula.axes){
    const parts=expressionParts(terms,{real:mode==='xy',limit:3}),line=`${axis}(t) = ${parts.join(' ')}${terms.length>3?' + ⋯':''}`;
    ctx.font=`${tall?27:24}px KaTeX_Main,"Noto Serif SC",serif`;const k=Math.min(1,880/ctx.measureText(line).width);
    ctx.save();ctx.translate(540,y);ctx.scale(k,1);ctx.fillText(line,0,0);ctx.restore();y+=tall?44:38;
  }
  ctx.fillStyle=colors.muted;ctx.font='19px "Noto Sans SC",sans-serif';ctx.fillText(copy.summary,540,y+6);
  drawVerdict(ctx,persona(mode,chains,lang),{x:540,y:y+(tall?62:50),width:880,size:tall?25:22,lang,colors,center:true});ctx.textAlign='left';
  // footer: CTA left, small QR right
  const qr=drawShareQr(ctx,shareURL,992,h-72,tall?250:200);
  ctx.fillStyle=colors.text;ctx.font='30px "Noto Serif SC",serif';{const k=Math.min(1,(992-qr.extent-120)/ctx.measureText(copy.cta).width);ctx.save();ctx.translate(88,qr.top+56);ctx.scale(k,k);ctx.fillText(copy.cta,0,0);ctx.restore();}
  ctx.fillStyle=colors.accent;ctx.font='22px "Noto Sans SC",sans-serif';ctx.fillText('fourier.jupyter.pro',88,qr.top+100);
  ctx.fillStyle=colors.muted;ctx.font='18px "Noto Serif SC",serif';ctx.fillText(copy.note,88,h-96);
  return {canvas:card,qrVersion:(qr.modules-17)/4};
}
