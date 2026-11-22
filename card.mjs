import {drawSketch,tintSketch} from './sketch.mjs';
import {shareQrSegments} from './share.mjs';
import {getPalette} from './palettes.mjs';
import {fourierExample} from './samples/fourier-formula.mjs';

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

function numericTerms(values,real){
  const grouped=new Map();
  for(const c of values){
    if(![c.k,c.amplitude,c.phase].every(Number.isFinite)||c.amplitude<0)throw new RangeError('Invalid coefficient');
    const k=real?Math.abs(c.k):c.k,phase=real&&c.k<0?-c.phase:c.phase,p=grouped.get(k)||{k,re:0,im:0};
    p.re+=c.amplitude*Math.cos(phase);p.im+=c.amplitude*Math.sin(phase);grouped.set(k,p);
  }
  const terms=[...grouped.values()].map(c=>({...c,amplitude:Math.hypot(c.re,c.im),phase:Math.atan2(c.im,c.re)})).sort((a,b)=>b.amplitude-a.amplitude);
  const n=v=>String(Number(v.toPrecision(3))),sign=v=>v<0?'−':'+';
  return terms.map(c=>real?(c.k?`${n(c.amplitude)} cos(${c.k===1?'2':2*c.k}πt ${sign(c.phase)} ${n(Math.abs(c.phase))})`:n(c.re)):`(${n(c.re)} ${sign(c.im)} ${n(Math.abs(c.im))}i) e⁽²πⁱ·${c.k}ᵗ⁾`);
}

export function numericExcerpt(values,real=true){
  const terms=numericTerms(values,real);
  return (terms.slice(0,2).join(' + ')||'0').replaceAll('+ −','− ')+(terms.length>2?' + ⋯':'');
}

export function cardCopy({mode,chains,name='',guess=false,lang='en',toneMap=null}){
  const zh=lang==='zh',groups=mode==='xy'?[['x',chains.x],['y',chains.y]]:[['z',chains.complex]];
  return {
    title:zh?'我的傅里叶公式':'My Fourier Formula',
    cta:zh?['扫码，看它画出我。']:['Scan to watch','it draw me.'],
    privacy:zh?['照片不上传',toneMap?'分享公式与素描明暗':'只分享公式']:['No photo uploads.',toneMap?'Formula + sketch tones.':'Only the formula is shared.'],
    example:zh?'傅里叶的公式 → 傅里叶':'Fourier’s formula → Fourier',
    mystery:zh?'我的公式 → ?':'My formula → ?',
    nickname:!guess?name:'',
    equations:groups.map(([axis,values])=>{
      const terms=numericTerms(values,axis!=='z'),lines=[`= ${terms[0]||'0'}`];
      if(terms.length>1)lines.push(`+ ${terms[1]}${terms.length>2?' + ⋯':''}`.replace('+ −','− '));
      return {axis,text:numericExcerpt(values,axis!=='z'),lines,terms:zh?`… 共 ${values.length} 项`:`… ${values.length} ${values.length===1?'term':'terms'}`};
    })
  };
}

function mathLine(ctx,text,x,y,width,size){
  ctx.save();ctx.font=`italic ${size}px KaTeX_Math,KaTeX_Main,serif`;
  const metrics=ctx.measureText(text),left=Math.max(0,metrics.actualBoundingBoxLeft||0),right=Math.max(metrics.width,metrics.actualBoundingBoxRight||0),scale=Math.min(1,width/Math.max(1,left+right));
  ctx.translate(x+left*scale,y);ctx.scale(scale,scale);ctx.fillText(text,0,0);ctx.restore();
}

export function renderSocialCard({mode,chains,teaser=null,name='',guess=false,shareURL,lang='en',toneMap=null},format='34'){
  const card=document.createElement('canvas');card.width=1080;card.height=format==='916'?1920:1440;
  const ctx=card.getContext('2d'),h=card.height,tall=format==='916',band=h-444,colors=getPalette('ink'),copy=cardCopy({mode,chains,name,guess,lang,toneMap});
  ctx.fillStyle=colors.background;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<22000;i++){const y=i*i*137%h;if(y>band-28)continue;ctx.fillStyle=colors.line+'06';ctx.fillRect(i*173%1080,y,1,1);}
  ctx.strokeStyle=colors.accent+'55';ctx.lineWidth=1;ctx.strokeRect(36.5,36.5,1007,h-73);
  ctx.fillStyle=colors.accent;ctx.fillRect(88,66,48,64);ctx.fillStyle=colors.background;ctx.textAlign='center';ctx.font='24px "Noto Serif SC",serif';ctx.fillText('圆',112,92);ctx.fillText('周',112,120);ctx.textAlign='left';
  ctx.fillStyle=colors.muted;ctx.font='22px sans-serif';ctx.fillText(lang==='zh'?'圆周之间 / 001':'FOURIER PORTRAIT / 001',160,106);
  ctx.fillStyle=colors.text;ctx.font='60px "Noto Serif SC",serif';ctx.fillText(copy.title,88,tall?228:210);
  ctx.fillStyle=colors.muted;ctx.font='26px "Noto Serif SC",serif';ctx.fillText(copy.nickname,90,tall?278:256);
  ctx.strokeStyle=colors.accent+'55';ctx.beginPath();ctx.moveTo(88,tall?320:280);ctx.lineTo(992,tall?320:280);ctx.stroke();
  const first=tall?440:340,gap=tall?245:180;
  copy.equations.forEach(({axis,lines,terms},i)=>{
    const y=first+i*gap;
    ctx.fillStyle=colors.line;mathLine(ctx,`${axis}(t)`,88,y,180,70);
    lines.forEach((line,j)=>mathLine(ctx,line,304,y+j*62,688,52));
    ctx.fillStyle=colors.accent;ctx.font='24px "Noto Serif SC",serif';ctx.fillText(terms,308,y+106);
  });
  const exampleTop=tall?950:660,exampleHeight=tall?410:254;
  ctx.strokeStyle=colors.line+'33';ctx.strokeRect(88.5,exampleTop+.5,903,exampleHeight);
  ctx.fillStyle=colors.muted;ctx.font='26px "Noto Serif SC",serif';ctx.fillText(copy.example,112,exampleTop+48);
  ctx.fillStyle=colors.line;
  for(const [i,axis] of ['x','y'].entries())mathLine(ctx,`${axis}(t) = ${numericExcerpt([fourierExample[axis]])} + ⋯`,112,exampleTop+(tall?130:112)+i*48,540,28);
  ctx.fillStyle=colors.accent;ctx.font='38px "Noto Serif SC",serif';ctx.fillText(copy.mystery,112,exampleTop+exampleHeight-34);
  if(teaser){const surface=tintSketch(teaser,'ink'),scale=Math.min(300/surface.width,(exampleHeight-24)/surface.height),w=surface.width*scale,h=surface.height*scale;drawSketch(ctx,surface,978-w,exampleTop+(exampleHeight-h)/2,w,h,'ink');}
  ctx.strokeStyle=colors.accent+'55';ctx.beginPath();ctx.moveTo(72,band-28);ctx.lineTo(1008,band-28);ctx.stroke();
  const qr=window.qrcode(0,'L');for(const segment of shareQrSegments(shareURL))qr.addData(segment.data,segment.mode);qr.make();
  const modules=qr.getModuleCount(),extent=(modules+8)*4;drawCardQr(ctx,qr,1008-extent,h-56-extent,4);
  ctx.fillStyle=colors.text;ctx.font='38px "Noto Serif SC",serif';copy.cta.forEach((line,i)=>ctx.fillText(line,88,band+118+i*52));
  ctx.fillStyle=colors.muted;ctx.font='24px "Noto Serif SC",serif';copy.privacy.forEach((line,i)=>ctx.fillText(line,88,band+294+i*36));
  return {canvas:card,qrVersion:(modules-17)/4};
}
