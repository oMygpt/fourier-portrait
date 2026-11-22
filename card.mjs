import {evaluate} from './fourier.mjs';
import {shareQrSegments} from './share.mjs';

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

export function renderSocialCard({mode,chains,path,dimensions,name,energy,shareURL},format='34'){
  const card=document.createElement('canvas');card.width=1080;card.height=format==='916'?1920:1440;
  const ctx=card.getContext('2d'),h=card.height;
  ctx.fillStyle='#161512';ctx.fillRect(0,0,1080,h);
  const glow=ctx.createRadialGradient(540,h*.36,0,540,h*.36,740);glow.addColorStop(0,'#8056272a');glow.addColorStop(1,'#16151200');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<700;i++){ctx.fillStyle=`rgba(224,190,127,${.025+i%4*.009})`;ctx.fillRect(i*173%1080,i*i*137%h,1.5,1.5);}
  ctx.strokeStyle='#ad8b4b55';ctx.strokeRect(30,30,1020,h-60);
  ctx.fillStyle='#d9ad69';ctx.font='27px "Noto Serif SC",serif';ctx.fillText('◎  圆周之间',66,76);
  ctx.textAlign='right';ctx.font='13px sans-serif';ctx.fillStyle='#a59b86';ctx.fillText('A PORTRAIT WRITTEN IN ORBITS',1014,72);
  ctx.textAlign='center';ctx.fillStyle='#eee1c8';ctx.font='36px "Noto Serif SC",serif';ctx.fillText(name?`${name}的傅里叶公式`:'我的傅里叶公式',540,134);
  const box={x:90,y:156,w:900,h:format==='916'?1180:810};
  const scale=Math.min(box.w/dimensions.width,box.h/dimensions.height)*.97,cx=540,cy=box.y+box.h/2;
  ctx.beginPath();
  for(let i=0;i<=7200;i++){
    const t=i/7200,p=mode==='xy'?{x:evaluate(chains.x,t).x,y:evaluate(chains.y,t).x}:evaluate(chains.complex,t),x=cx+p.x*scale,y=cy+p.y*scale;
    const draw=path[Math.min(path.length-1,Math.floor(t*path.length))]?.draw;
    if(!i||!draw)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.strokeStyle='#edc98a';ctx.lineWidth=2.3;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=9;ctx.shadowColor='#d7a25380';ctx.stroke();ctx.shadowBlur=0;
  const qr=window.qrcode(0,'L');for(const segment of shareQrSegments(shareURL))qr.addData(segment.data,segment.mode);qr.make();
  const modules=qr.getModuleCount();if(modules>89)throw Error('二维码过密，请缩短分享地址。');
  const size=388,unit=4,qx=624,qy=h-456,matrix=document.createElement('canvas');matrix.width=matrix.height=modules+8;
  const qc=matrix.getContext('2d');qc.fillStyle='#fff';qc.fillRect(0,0,matrix.width,matrix.height);qc.fillStyle='#000';
  for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x))qc.fillRect(x+4,y+4,1,1);
  const extent=matrix.width*unit,inset=Math.floor((size-extent)/2);
  ctx.fillStyle='#fff';ctx.fillRect(qx,qy,size,size);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(matrix,qx+inset,qy+inset,extent,extent);ctx.restore();
  const groups=mode==='xy'?[['x',chains.x],['y',chains.y]]:[['z',chains.complex]];
  ctx.fillStyle='#bca98a';ctx.font='16px sans-serif';ctx.textAlign='left';ctx.fillText(groups.map(([axis,c])=>`${axis.toUpperCase()} ${c.length} 项`).join(' / ')+` · 扫码版保留 ${(energy*100).toFixed(1)}% 能量`,66,qy+20);
  if(format==='916'){ctx.textAlign='center';ctx.fillStyle='#e1c18a';ctx.font='30px "Noto Serif SC",serif';ctx.fillText('无数个圆，恰好是你。',540,1420);}
  ctx.strokeStyle='#ad8b4b44';ctx.beginPath();ctx.moveTo(66,qy-15);ctx.lineTo(1014,qy-15);ctx.stroke();
  ctx.textAlign='left';ctx.fillStyle='#a99a7e';ctx.font='12px sans-serif';ctx.fillText('THE MATHEMATICS OF YOU',66,qy+52);
  ctx.fillStyle='#e2bf83';groups.forEach(([axis,c],i)=>equation(ctx,axis,c,66,qy+108+i*112,500));
  ctx.textAlign='center';ctx.font='18px "Noto Serif SC",serif';ctx.fillStyle='#e6c38b';ctx.fillText('扫码，看圆把我画出来',qx+size/2,qy+size+24);
  ctx.textAlign='left';ctx.font='13px sans-serif';ctx.fillStyle='#948872';ctx.fillText('照片不上传 · 链接仅含数学系数与笔画',66,h-43);
  return {canvas:card,qrVersion:(modules-17)/4};
}
