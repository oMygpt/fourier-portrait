import {evaluate} from './fourier.mjs';
import {shareQrSegments} from './share.mjs';

export const CARD_GOLD='#edc98a',CARD_NIGHT='#161512';

export function cardStats(mode,chains){
  const values=mode==='xy'?[...chains.x,...chains.y]:chains.complex;
  let dominant=null,largest=0;
  for(const c of values){
    if(!Number.isFinite(c.k)||!Number.isFinite(c.amplitude)||c.amplitude<0)throw new RangeError('Invalid coefficient');
    largest=Math.max(largest,c.amplitude);if(c.k&&(!dominant||c.amplitude>dominant.amplitude))dominant=c;
  }
  return {count:values.length,k:dominant?.k??0,radius:largest};
}

export function drawCardQr(ctx,qr,x,y,unit=4){
  const modules=qr.getModuleCount();
  if(!Number.isInteger(unit)||unit<4||!Number.isInteger(x)||!Number.isInteger(y))throw new RangeError('二维码必须使用整数像素');
  if(modules<21||modules>89||(modules-17)%4)throw new RangeError('二维码过密，请缩短分享地址。');
  const extent=(modules+8)*unit;
  ctx.save();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle=CARD_NIGHT;ctx.fillRect(x,y,extent,extent);ctx.fillStyle=CARD_GOLD;
  for(let row=0;row<modules;row++)for(let col=0;col<modules;col++)if(qr.isDark(row,col))ctx.fillRect(x+(col+4)*unit,y+(row+4)*unit,unit,unit);
  ctx.restore();return extent;
}

function tracked(ctx,text,x,y,spacing=2,align='left'){
  const letters=Array.from(text),widths=letters.map(c=>ctx.measureText(c).width),width=widths.reduce((a,b)=>a+b,0)+spacing*Math.max(0,letters.length-1);
  if(align==='right')x-=width;
  for(let i=0;i<letters.length;i++){ctx.fillText(letters[i],x,y);x+=widths[i]+spacing;}
}

export function numericExcerpt(values,real=true){
  const grouped=new Map();
  for(const c of values){
    if(![c.k,c.amplitude,c.phase].every(Number.isFinite))throw new RangeError('Invalid coefficient');
    const k=real?Math.abs(c.k):c.k,phase=real&&c.k<0?-c.phase:c.phase,p=grouped.get(k)||{k,re:0,im:0};
    p.re+=c.amplitude*Math.cos(phase);p.im+=c.amplitude*Math.sin(phase);grouped.set(k,p);
  }
  const terms=[...grouped.values()].map(c=>({...c,amplitude:Math.hypot(c.re,c.im),phase:Math.atan2(c.im,c.re)})).sort((a,b)=>b.amplitude-a.amplitude);
  const n=v=>String(Number(v.toPrecision(3))),sign=v=>v<0?'−':'+';
  return (terms.slice(0,2).map(c=>real?(c.k?`${n(c.amplitude)} cos(${c.k===1?'2':2*c.k}πt ${sign(c.phase)} ${n(Math.abs(c.phase))})`:n(c.re)):`(${n(c.re)} ${sign(c.im)} ${n(Math.abs(c.im))}i) e⁽²πⁱ·${c.k}ᵗ⁾`).join(' + ')||'0').replaceAll('+ −','− ')+(terms.length>2?' + ⋯':'');
}

function mathLine(ctx,parts,x,y,width,size=27){
  function font(part){ctx.font=`${part.italic?'italic ':''}${size*(part.scale||1)}px ${part.sum?'KaTeX_Size2':part.italic?'KaTeX_Math':'KaTeX_Main'},serif`;}
  let measured=0;for(const part of parts){font(part);measured+=ctx.measureText(part.text).width;}
  ctx.save();ctx.translate(x,y);ctx.scale(Math.min(1,width/Math.max(1,measured)),1);let offset=0;
  for(const part of parts){font(part);const w=ctx.measureText(part.text).width;ctx.fillText(part.text,offset,(part.dy||0)*size);if(part.sum){ctx.font=`italic ${size*.48}px KaTeX_Math,serif`;ctx.fillText('k',offset+w/2-4,size*.66);}offset+=w;}
  ctx.restore();
}

function equation(ctx,axis,values,x,y,width){
  const real=axis!=='z',parts=[{text:`${axis}(t)`,italic:true},{text:' = '},{text:'∑',sum:true,scale:1.35},{text:real?' A':' c',italic:true},{text:'k',italic:true,scale:.62,dy:.25}];
  parts.push(...(real?[{text:' cos('},{text:'2πkt + φ',italic:true},{text:'k',italic:true,scale:.62,dy:.25},{text:')'}]:[{text:' e',italic:true},{text:'2πikt',italic:true,scale:.65,dy:-.65}]));
  mathLine(ctx,parts,x,y,width);
  const text=`${axis}(t) = ${numericExcerpt(values,real)}`,numeric=text.split(/(cos)/).filter(Boolean).map(text=>({text,italic:text!=='cos'}));
  mathLine(ctx,numeric,x,y+43,width,21);
}

export function renderSocialCard({mode,chains,path,name,guess=false,energy,shareURL},format='34'){
  const card=document.createElement('canvas');card.width=1080;card.height=format==='916'?1920:1440;
  const ctx=card.getContext('2d'),h=card.height,story=format==='916',band=h-444;
  const box={x:130,y:244,w:820,h:story?1090:690},cy=box.y+box.h/2;
  ctx.fillStyle=CARD_NIGHT;ctx.fillRect(0,0,1080,h);
  const glow=ctx.createRadialGradient(540,cy,0,540,cy,650);glow.addColorStop(0,'#80562724');glow.addColorStop(1,'#16151200');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<360;i++){const y=i*i*137%h;if(y>band-44)continue;ctx.fillStyle=`rgba(224,190,127,${.025+i%4*.009})`;ctx.fillRect(i*173%1080,y,1,1);}
  ctx.strokeStyle='#ad8b4b40';ctx.lineWidth=1;ctx.strokeRect(36.5,36.5,1007,h-73);
  ctx.strokeStyle='#d7b06c88';
  for(const [x,y,sx,sy] of [[36,36,1,1],[1044,36,-1,1],[36,h-36,1,-1],[1044,h-36,-1,-1]]){ctx.beginPath();ctx.moveTo(x+sx*26,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*26);ctx.moveTo(x+sx*8,y+sy*8);ctx.lineTo(x+sx*17,y+sy*8);ctx.moveTo(x+sx*8,y+sy*8);ctx.lineTo(x+sx*8,y+sy*17);ctx.stroke();}
  ctx.save();ctx.beginPath();ctx.rect(60,236,960,box.h+28);ctx.clip();
  const radius=story?410:326,vertical=box.h*.47;
  ctx.strokeStyle='#d7b06c16';
  for(const padding of [0,34]){ctx.beginPath();ctx.ellipse(540,cy,radius+padding,vertical+padding,0,0,Math.PI*2);ctx.stroke();}
  for(let i=0;i<48;i++){const a=i*Math.PI/24,len=i%4===0?9:4;ctx.beginPath();ctx.moveTo(540+Math.cos(a)*(radius+34),cy+Math.sin(a)*(vertical+34));ctx.lineTo(540+Math.cos(a)*(radius+34+len),cy+Math.sin(a)*(vertical+34+len));ctx.stroke();}
  ctx.restore();
  ctx.strokeStyle=CARD_GOLD;ctx.lineWidth=1.3;
  for(const r of [15,10]){ctx.beginPath();ctx.arc(88,83,r,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle=CARD_GOLD;ctx.font='25px "Noto Serif SC",serif';ctx.fillText('圆周之间',118,87);
  ctx.fillStyle='#a38c64';ctx.font='9px sans-serif';tracked(ctx,'PORTRAITS IN ORBIT',119,106,2);
  ctx.font='11px sans-serif';tracked(ctx,guess?'GUESS WHO / 01':'A STUDY OF YOU / 01',1008,84,2,'right');
  const stats=cardStats(mode,chains),title=`我由 ${stats.count} 个圆组成`;ctx.font='48px "Noto Serif SC",serif';const titleSize=Math.min(48,48*936/Math.max(1,ctx.measureText(title).width));
  ctx.font=`${titleSize}px "Noto Serif SC",serif`;ctx.fillStyle='#eee1c8';ctx.fillText(title,72,179);
  ctx.fillStyle='#b4a184';ctx.font='16px "Noto Serif SC",serif';ctx.fillText(`${!guess&&name?`${name} · `:''}主频率 k=${stats.k} · 最大的圆 r=${Number(stats.radius.toPrecision(3))}`,74,216);
  ctx.save();ctx.translate(1006,cy);ctx.rotate(-Math.PI/2);ctx.fillStyle='#a38c6477';ctx.font='10px sans-serif';tracked(ctx,'EVERY LINE, AN ORBIT',-100,0,2);ctx.restore();
  const points=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<=7200;i++){
    const t=i/7200,p=mode==='xy'?{x:evaluate(chains.x,t).x,y:evaluate(chains.y,t).x}:evaluate(chains.complex,t);
    points.push({...p,draw:path[Math.min(path.length-1,Math.floor(t*path.length))]?.draw});minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
  }
  const scale=Math.min(box.w/Math.max(1,maxX-minX),box.h/Math.max(1,maxY-minY))*.96,cx=540-(minX+maxX)*scale/2,centerY=cy-(minY+maxY)*scale/2;
  ctx.save();ctx.beginPath();points.forEach((p,i)=>{const x=cx+p.x*scale,y=centerY+p.y*scale;if(!i||!p.draw)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
  ctx.strokeStyle=CARD_GOLD;ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=8;ctx.shadowColor='#d7a25370';ctx.stroke();ctx.restore();
  if(story){ctx.fillStyle='#d3b780';ctx.font='27px "Noto Serif SC",serif';ctx.fillText(guess?'圆周知道答案。你猜呢？':'无数个圆，恰好是你。',72,1400);}
  const qr=window.qrcode(0,'L');for(const segment of shareQrSegments(shareURL))qr.addData(segment.data,segment.mode);qr.make();
  const modules=qr.getModuleCount(),extent=(modules+8)*4;drawCardQr(ctx,qr,1008-extent,band+Math.floor((388-extent)/2));
  ctx.strokeStyle='#ad8b4b55';ctx.beginPath();ctx.moveTo(72,band-28);ctx.lineTo(1008,band-28);ctx.stroke();
  ctx.fillStyle='#a38c64';ctx.font='11px sans-serif';tracked(ctx,'THE EQUATION /',72,band+23,2);
  const groups=mode==='xy'?[['x',chains.x],['y',chains.y]]:[['z',chains.complex]];
  ctx.fillStyle=CARD_GOLD;groups.forEach(([axis,c],i)=>equation(ctx,axis,c,72,band+80+i*104,480));
  ctx.fillStyle='#eee1c8';ctx.font='27px "Noto Serif SC",serif';ctx.fillText(guess?'扫码，看圆画出我是谁':'扫码，看圆把我画出来',72,band+302);
  ctx.fillStyle='#bca98a';ctx.font='17px sans-serif';ctx.fillText(groups.map(([axis,c])=>`${axis.toUpperCase()} ${c.length} 项`).join(' / ')+` · 扫码保留 ${(energy*100).toFixed(1)}% 能量`,72,band+344);
  ctx.fillStyle='#a6977d';ctx.font='13px sans-serif';ctx.fillText('照片不上传 · 链接仅含数学系数与笔画',72,h-58);
  return {canvas:card,qrVersion:(modules-17)/4};
}
