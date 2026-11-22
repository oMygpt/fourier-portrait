import {evaluate} from './fourier.mjs';

export function renderSocialCard({mode,chains,path,dimensions,name,energy,shareURL}, format='34') {
  const card=document.createElement('canvas');card.width=1080;card.height=format==='916'?1920:1440;
  const ctx=card.getContext('2d'),h=card.height;
  ctx.fillStyle='#161512';ctx.fillRect(0,0,1080,h);
  const glow=ctx.createRadialGradient(570,500,0,570,500,850);glow.addColorStop(0,'#75512625');glow.addColorStop(1,'#16151200');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<700;i++){ctx.fillStyle=`rgba(224,190,127,${.025+i%4*.009})`;ctx.fillRect(i*173%1080,i*i*137%h,1.5,1.5);}
  ctx.strokeStyle='#ad8b4b55';ctx.lineWidth=1;ctx.strokeRect(30,30,1020,h-60);
  ctx.fillStyle='#d9ad69';ctx.font='30px "Noto Serif SC",serif';ctx.fillText('◎  圆周之间',65,85);
  ctx.textAlign='right';ctx.font='14px sans-serif';ctx.fillStyle='#a59b86';ctx.fillText('A PORTRAIT WRITTEN IN ORBITS',1015,80);
  ctx.textAlign='center';ctx.fillStyle='#eee1c8';ctx.font='42px "Noto Serif SC",serif';ctx.fillText(name?`${name}的傅里叶公式`:'我的傅里叶公式',540,151);
  const box={x:90,y:185,w:900,h:format==='916'?850:470};
  const scale=Math.min(box.w/dimensions.width,box.h/dimensions.height)*.94,cx=box.x+box.w/2,cy=box.y+box.h/2;
  const steps=7200;
  ctx.beginPath();
  for(let i=0;i<=steps;i++){
    const t=i/steps,p=mode==='xy'?{x:evaluate(chains.x,t).x,y:evaluate(chains.y,t).x}:evaluate(chains.complex,t);
    const x=cx+p.x*scale,y=cy+p.y*scale,draw=path[Math.min(path.length-1,Math.floor(t*path.length))]?.draw;
    if(!i||!draw)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.strokeStyle='#edc98a';ctx.lineWidth=2.1;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=7;ctx.shadowColor='#d7a25370';ctx.stroke();ctx.shadowBlur=0;
  const qr=window.qrcode(0,'L');qr.addData(shareURL,'Byte');qr.make();
  const modules=qr.getModuleCount(),unit=4,size=(modules+8)*unit,qx=1080-size-54,qy=h-size-84;
  ctx.fillStyle='#f6edda';ctx.fillRect(qx,qy,size,size);ctx.fillStyle='#181713';
  for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x))ctx.fillRect(qx+(x+4)*unit,qy+(y+4)*unit,unit,unit);
  ctx.textAlign='left';const left=65,ty=qy+100;
  ctx.fillStyle='#d9ad69';ctx.font='14px sans-serif';ctx.fillText('THE MATHEMATICS OF YOU',left,ty);
  ctx.fillStyle='#ece1c9';ctx.font='32px "Noto Serif SC",serif';ctx.fillText('无数个圆，',left,ty+58);ctx.fillText('恰好是你。',left,ty+108);
  ctx.font='italic 22px serif';ctx.fillStyle='#d9ad69';
  const groups=mode==='xy'?[['x',chains.x],['y',chains.y]]:[['z',chains.complex]];
  groups.forEach(([axis,values],i)=>{
    ctx.fillText(`${axis}(t) = Σ ${axis==='z'?'cₖ eⁱ²πᵏᵗ':'Aₖ cos(2πkt + φₖ)'}`,left,ty+175+i*66);
    const c=values[0];ctx.font='16px monospace';if(c)ctx.fillText(`A₀ ${c.amplitude.toPrecision(3)} · k ${c.k}`,left,ty+200+i*66);ctx.font='italic 22px serif';
  });
  ctx.font='17px sans-serif';ctx.fillStyle='#b9aa8e';ctx.fillText(groups.map(([axis,c])=>`${axis.toUpperCase()} ${c.length} 项`).join(' / '),left,ty+330);
  ctx.fillText(`分享保留 ${(energy*100).toFixed(1)}% 能量`,left,ty+360);
  ctx.font='20px "Noto Serif SC",serif';ctx.textAlign='center';ctx.fillStyle='#e6c38b';ctx.fillText('扫码，看圆把我画出来',qx+size/2,h-48);
  ctx.font='13px sans-serif';ctx.textAlign='left';ctx.fillStyle='#948872';ctx.fillText('照片不上传 · 链接仅含数学系数与笔画',65,h-17);
  return {canvas:card,qrVersion:(modules-17)/4};
}
