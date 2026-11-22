import {drawSketch,tintSketch} from './sketch.mjs';
import {shareQrSegments} from './share.mjs';
import {getPalette} from './palettes.mjs';

export const CARD_GOLD=getPalette('ink').line,CARD_NIGHT=getPalette('ink').background;

export function drawCardQr(ctx,qr,x,y,unit=4,palette='ink'){
  const modules=qr.getModuleCount();
  if(!Number.isInteger(unit)||unit<4||!Number.isInteger(x)||!Number.isInteger(y))throw new RangeError('QR modules require integer pixels');
  if(modules<21||modules>89||(modules-17)%4)throw new RangeError('QR is too dense');
  const extent=(modules+8)*unit,colors=getPalette(palette);
  ctx.save();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle=colors.background;ctx.fillRect(x,y,extent,extent);ctx.fillStyle=colors.line;
  for(let row=0;row<modules;row++)for(let col=0;col<modules;col++)if(qr.isDark(row,col))ctx.fillRect(x+(col+4)*unit,y+(row+4)*unit,unit,unit);
  ctx.restore();return extent;
}

export function numericExcerpt(values,real=true){
  const grouped=new Map();
  for(const c of values){
    if(![c.k,c.amplitude,c.phase].every(Number.isFinite)||c.amplitude<0)throw new RangeError('Invalid coefficient');
    const k=real?Math.abs(c.k):c.k,phase=real&&c.k<0?-c.phase:c.phase,p=grouped.get(k)||{k,re:0,im:0};
    p.re+=c.amplitude*Math.cos(phase);p.im+=c.amplitude*Math.sin(phase);grouped.set(k,p);
  }
  const terms=[...grouped.values()].map(c=>({...c,amplitude:Math.hypot(c.re,c.im),phase:Math.atan2(c.im,c.re)})).sort((a,b)=>b.amplitude-a.amplitude);
  const n=v=>String(Number(v.toPrecision(3))),sign=v=>v<0?'−':'+';
  return (terms.slice(0,2).map(c=>real?(c.k?`${n(c.amplitude)} cos(${c.k===1?'2':2*c.k}πt ${sign(c.phase)} ${n(Math.abs(c.phase))})`:n(c.re)):`(${n(c.re)} ${sign(c.im)} ${n(Math.abs(c.im))}i) e⁽²πⁱ·${c.k}ᵗ⁾`).join(' + ')||'0').replaceAll('+ −','− ')+(terms.length>2?' + ⋯':'');
}

export function cardCopy({mode,chains,name='',guess=false,lang='en'}){
  const zh=lang==='zh',groups=mode==='xy'?[['x',chains.x],['y',chains.y]]:[['z',chains.complex]];
  return {
    title:zh?'我的傅里叶公式':'My Fourier Formula',
    caption:zh?['公式 = 一张脸。','扫码，看它画出我']:['An equation is a face.','Scan to watch it draw me.'],
    cta:zh?'扫码，唤醒圆周':'Scan to awaken the circles',
    privacy:zh?'照片不上传 · 分享公式，不分享照片':'No photo uploads · Share the formula, not the photo',
    teaser:zh?'约瑟夫·傅里叶 / 示例':'Joseph Fourier / Example',
    nickname:!guess?name:'',
    equations:groups.map(([axis,values])=>({axis,text:numericExcerpt(values,axis!=='z'),terms:zh?`… 共 ${values.length} 项`:`… ${values.length} terms`}))
  };
}

function mathLine(ctx,text,x,y,width,size){
  ctx.save();ctx.font=`italic ${size}px KaTeX_Math,KaTeX_Main,serif`;const scale=Math.min(1,width/Math.max(1,ctx.measureText(text).width));ctx.translate(x,y);ctx.scale(scale,1);ctx.fillText(text,0,0);ctx.restore();
}

export function renderSocialCard({mode,chains,teaser=null,name='',guess=false,shareURL,lang='en'},format='34'){
  const card=document.createElement('canvas');card.width=1080;card.height=format==='916'?1920:1440;
  const ctx=card.getContext('2d'),h=card.height,tall=format==='916',band=h-444,colors=getPalette('ink'),copy=cardCopy({mode,chains,name,guess,lang});
  ctx.fillStyle=colors.background;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<22000;i++){const y=i*i*137%h;if(y>band-28)continue;ctx.fillStyle=colors.line+'06';ctx.fillRect(i*173%1080,y,1,1);}
  ctx.strokeStyle=colors.accent+'55';ctx.lineWidth=1;ctx.strokeRect(36.5,36.5,1007,h-73);
  ctx.fillStyle=colors.accent;ctx.fillRect(72,66,42,55);ctx.fillStyle=colors.background;ctx.textAlign='center';ctx.font='20px "Noto Serif SC",serif';ctx.fillText('圆',93,89);ctx.fillText('周',93,113);ctx.textAlign='left';
  ctx.fillStyle=colors.muted;ctx.font='14px sans-serif';ctx.fillText(lang==='zh'?'圆周之间 / 001':'FOURIER PORTRAIT / 001',138,99);ctx.textAlign='right';ctx.fillText(lang==='zh'?'以公式，描绘你':'AN EQUATION OF YOU',1008,99);ctx.textAlign='left';
  ctx.fillStyle=colors.text;ctx.font='56px "Noto Serif SC",serif';ctx.fillText(copy.title,72,228);
  ctx.fillStyle=colors.muted;ctx.font='22px "Noto Serif SC",serif';ctx.fillText(copy.nickname,75,279);
  ctx.strokeStyle=colors.accent+'55';ctx.beginPath();ctx.moveTo(72,320);ctx.lineTo(1008,320);ctx.stroke();
  const first=tall?485:420,gap=tall?245:166;
  copy.equations.forEach(({axis,text,terms},i)=>{
    ctx.fillStyle=colors.line;mathLine(ctx,`${axis}(t) = ${text}`,72,first+i*gap,936,52);
    ctx.fillStyle=colors.accent;ctx.font='22px "Noto Serif SC",serif';ctx.fillText(terms,76,first+i*gap+55);
  });
  const captionY=tall?1020:740;
  ctx.fillStyle=colors.text;ctx.font='31px "Noto Serif SC",serif';copy.caption.forEach((line,i)=>ctx.fillText(line,72,captionY+i*48));
  if(teaser){const surface=tintSketch(teaser,'ink'),scale=Math.min(180/surface.width,170/surface.height);drawSketch(ctx,surface,75,band-198,surface.width*scale,surface.height*scale,'ink');}
  ctx.fillStyle=colors.muted;ctx.font='18px "Noto Serif SC",serif';ctx.fillText(copy.teaser,284,band-105);
  ctx.font='13px sans-serif';ctx.fillText(lang==='zh'?'一个例子；你的脸藏在上面的公式里。':'Just an example. Your face is in the formula above.',284,band-71);
  ctx.strokeStyle=colors.accent+'55';ctx.beginPath();ctx.moveTo(72,band-28);ctx.lineTo(1008,band-28);ctx.stroke();
  const qr=window.qrcode(0,'L');for(const segment of shareQrSegments(shareURL))qr.addData(segment.data,segment.mode);qr.make();
  const modules=qr.getModuleCount(),extent=(modules+8)*4;drawCardQr(ctx,qr,1008-extent,band+Math.floor((388-extent)/2),4);
  ctx.fillStyle=colors.accent;ctx.font='11px sans-serif';ctx.fillText(lang==='zh'?'一张脸，写在公式里':'THE FORMULA BECOMES A FACE',72,band+56);
  ctx.fillStyle=colors.text;ctx.font='26px "Noto Serif SC",serif';ctx.fillText(copy.cta,72,band+118);
  ctx.fillStyle=colors.muted;ctx.font='19px "Noto Serif SC",serif';ctx.fillText(lang==='zh'?'看旋转的圆，慢慢画出我。':'Watch circles slowly draw me.',72,band+164);
  mathLine(ctx,lang==='zh'?'x(t), y(t) → 你':'x(t), y(t) → you',72,band+269,470,44);
  ctx.fillStyle=colors.muted;ctx.font='15px "Noto Serif SC",serif';ctx.fillText(copy.privacy,72,h-57);
  return {canvas:card,qrVersion:(modules-17)/4};
}
