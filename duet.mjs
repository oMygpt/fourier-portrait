// Phase duet (Oppenheim & Lim, 1981): swap the 2D Fourier amplitude and phase of two sketches.
//   A ⊕ B = F⁻¹( |F_A| · e^{i·arg F_B} )  — A's amplitude with B's phase looks like B.
// Amplitude says how much of each plane wave; phase says where its crests fall — that is where the face lives.
import {fft2} from './wave.mjs';
import {getPalette} from './palettes.mjs';
import {cleanName} from './share.mjs';
import {modelLineArt,warmModels} from './ml-client.mjs';

export const DUET_SIDE=512;
// Chosen by eye on the sample sketches (lab experiment): paper from the 55th percentile up, a slight gamma, a fixed oval fade.
export const DUET_TONES=Object.freeze({low:.55,high:.995,gamma:1.2,vignette:true});

// Fit a darkness image (0 = paper, 1 = ink) into an N×N square, aspect kept, centred, bilinear.
export function fitSquare(darkness,width,height,N=DUET_SIDE){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||darkness.length!==width*height)throw new RangeError('Invalid sketch');
  if(!Number.isInteger(N)||N<4||N&(N-1))throw new RangeError('Side must be a power of two');
  const scale=Math.min(N/width,N/height),w=width*scale,h=height*scale,ox=(N-w)/2,oy=(N-h)/2,out=new Float64Array(N*N);
  for(let y=0;y<N;y++){
    const sy=(y+.5-oy)/scale-.5;if(sy<-.5||sy>height-.5)continue;
    const y0=Math.max(0,Math.min(height-1,Math.floor(sy))),y1=Math.min(height-1,y0+1),fy=Math.max(0,Math.min(1,sy-y0));
    for(let x=0;x<N;x++){
      const sx=(x+.5-ox)/scale-.5;if(sx<-.5||sx>width-.5)continue;
      const x0=Math.max(0,Math.min(width-1,Math.floor(sx))),x1=Math.min(width-1,x0+1),fx=Math.max(0,Math.min(1,sx-x0));
      const top=darkness[y0*width+x0]*(1-fx)+darkness[y0*width+x1]*fx,bottom=darkness[y1*width+x0]*(1-fx)+darkness[y1*width+x1]*fx;
      out[y*N+x]=top*(1-fy)+bottom*fy;
    }
  }
  return out;
}

// Zero mean, unit energy: the two amplitudes then speak at the same volume.
export function standardize(values){
  let mean=0;for(const v of values)mean+=v;mean/=values.length;
  let energy=0;for(const v of values)energy+=(v-mean)**2;const std=Math.sqrt(energy/values.length)||1;
  return Float64Array.from(values,v=>(v-mean)/std);
}

export function spectrum(values,N){
  if(values.length!==N*N)throw new RangeError('Invalid square image');
  const re=Float64Array.from(values),im=new Float64Array(N*N);fft2(re,im,N);return {re,im};
}

// |amplitude.F| · e^{i·arg phase.F}, back to the image plane. Both spectra are Hermitian, so the result is real.
export function combine(amplitude,phase,N){
  const re=new Float64Array(N*N),im=new Float64Array(N*N);
  for(let k=0;k<N*N;k++){
    const m=Math.hypot(amplitude.re[k],amplitude.im[k]),p=Math.hypot(phase.re[k],phase.im[k]);
    if(p>1e-12){re[k]=m*phase.re[k]/p;im[k]=m*phase.im[k]/p;}else re[k]=m;
  }
  fft2(re,im,N,true);
  let leak=0;for(const v of im)leak=Math.max(leak,Math.abs(v));
  return {values:re,leak};
}

// Map values onto a reference tone distribution by rank (monotone: changes contrast, never structure).
export function matchTones(values,reference){
  const n=values.length,order=Array.from({length:n},(_,i)=>i).sort((a,b)=>values[a]-values[b]),sorted=Float64Array.from(reference).sort(),out=new Float32Array(n);
  for(let r=0;r<n;r++)out[order[r]]=sorted[Math.min(sorted.length-1,Math.floor((r+.5)*sorted.length/n))];
  return out;
}

// Linear alternative: clip the darkest/lightest percentiles, paper = the median.
export function stretchTones(values,{low=.5,high=.995,gamma=1}={}){
  const sorted=Float64Array.from(values).sort(),q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))],a=q(low),b=q(high);
  return Float32Array.from(values,v=>Math.max(0,Math.min(1,(v-a)/Math.max(1e-12,b-a)))**gamma);
}

// Fixed soft oval (same for every image, so it carries no structure): fades the ringing near the square's edges.
export function vignette(values,N,inner=.38,outer=.5){
  return Float32Array.from(values,(v,i)=>{const x=(i%N+.5)/N-.5,y=(Math.floor(i/N)+.5)/N-.5,r=Math.hypot(x/.86,y),t=Math.max(0,Math.min(1,(outer-r)/(outer-inner)));return v*t*t*(3-2*t);});
}

export function correlation(x,y){
  let mx=0,my=0;for(let i=0;i<x.length;i++){mx+=x[i];my+=y[i];}mx/=x.length;my/=y.length;
  let sxy=0,sxx=0,syy=0;for(let i=0;i<x.length;i++){const a=x[i]-mx,b=y[i]-my;sxy+=a*b;sxx+=a*a;syy+=b*b;}
  return sxy/Math.sqrt(sxx*syy||1);
}

// a, b: {darkness,width,height}. Returns N×N darkness images:
//   ab = A's amplitude + B's phase (looks like B), ba = B's amplitude + A's phase (looks like A).
// The tone curve is monotone and image-independent apart from percentiles, so no structure is added beyond the swap.
export function phaseDuet(a,b,{N=DUET_SIDE,tones=DUET_TONES}={}){
  const A=fitSquare(a.darkness,a.width,a.height,N),B=fitSquare(b.darkness,b.width,b.height,N);
  const FA=spectrum(standardize(A),N),FB=spectrum(standardize(B),N),ab=combine(FA,FB,N),ba=combine(FB,FA,N);
  const finish=(r,donor)=>{if(tones==='match')return matchTones(r.values,donor);if(tones==='raw')return Float32Array.from(r.values);const o=typeof tones==='object'?tones:{},d=stretchTones(r.values,o);return o.vignette?vignette(d,N):d;};
  return {N,a:Float32Array.from(A),b:Float32Array.from(B),ab:finish(ab,A),ba:finish(ba,B),leak:Math.max(ab.leak,ba.leak)};
}

// ---- card copy (pure) ----
// A = the sharer (left column), B = the visitor (right column). Each large result sits under the face it resembles.
export function duetCopy({sharer='',visitor='',lang='zh'}={}){
  const zh=lang==='zh',a=cleanName(sharer),b=cleanName(visitor);
  const A=a||(zh?'TA':'them'),B=b||(zh?'我':'me'),of=(name,fallback)=>zh?`${name||fallback}的`:name?`${name}’s`:fallback;
  return {
    title:zh?'圆周之间 · 相位合奏':'FOURIER PORTRAIT · PHASE DUET',
    names:[a||(zh?'TA':'Them'),b||(zh?'我':'Me')],
    left:zh?[`${of(b,'我')}幅度 + ${of(a,'TA')}相位`,`→ 像${A}`]:[`${of(b,'My')} amplitude + ${of(a,'their')} phase`,`→ looks like ${A}`],
    right:zh?[`${of(a,'TA')}幅度 + ${of(b,'我')}相位`,`→ 像${B}`]:[`${of(a,'Their')} amplitude + ${of(b,'my')} phase`,`→ looks like ${B}`],
    swap:zh?'交换幅度与相位':'swap amplitude & phase',
    headline:zh?'相位才是你。':'Phase is who you are.',
    explain:zh?['幅度说每个频率有多强，相位说它落在哪里。','一张脸，住在它的相位里。']:['Amplitude says how strong each frequency is; phase says where it lands.','A face lives in its phase.'],
    method:zh?'二维傅里叶变换 · 交换幅度与相位（Oppenheim & Lim, 1981）':'2D Fourier transform · amplitude/phase swap (Oppenheim & Lim, 1981)',
    privacy:zh?'本地合成 · 照片与合奏卡均未上传':'Made on-device · no photo or card uploaded'
  };
}

// ---- browser helpers ----
export const darknessFromGray=({gray,width,height})=>({darkness:Float32Array.from(gray,v=>1-v/255),width,height});
// Shared sketches arrive tinted (alpha = darkness), whatever the palette.
export function darknessFromAlpha(surface){
  const c=document.createElement('canvas');c.width=surface.width;c.height=surface.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(surface,0,0);
  const d=x.getImageData(0,0,c.width,c.height).data;return {darkness:Float32Array.from({length:c.width*c.height},(_,i)=>d[i*4+3]/255),width:c.width,height:c.height};
}
function inkTile(darkness,N,rgb){
  const c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d'),im=x.createImageData(N,N);
  for(let i=0;i<N*N;i++){im.data[i*4]=rgb[0];im.data[i*4+1]=rgb[1];im.data[i*4+2]=rgb[2];im.data[i*4+3]=Math.max(0,Math.min(255,Math.round(darkness[i]*255)));}
  x.putImageData(im,0,0);return c;
}
// Square tile cropped to a w×h window (portraits are taller than wide), centred.
function drawCropped(ctx,tile,cx,top,w,h){const s=h/tile.height,sw=w/s;ctx.drawImage(tile,(tile.width-sw)/2,0,sw,tile.height,cx-w/2,top,w,h);}

export function renderDuetCard({duet,sharer='',visitor='',lang='zh',date=new Date()}){
  const card=document.createElement('canvas');card.width=1080;card.height=1440;
  const ctx=card.getContext('2d'),h=card.height,colors=getPalette('ink'),copy=duetCopy({sharer,visitor,lang}),rgb=[1,3,5].map(i=>parseInt(colors.line.slice(i,i+2),16)),N=duet.N;
  ctx.fillStyle=colors.background;ctx.fillRect(0,0,1080,h);
  for(let i=0;i<26000;i++){ctx.fillStyle=colors.line+'06';ctx.fillRect(i*173%1080,i*i*137%h,1,1);}
  ctx.strokeStyle=colors.accent+'44';ctx.lineWidth=1;ctx.strokeRect(36.5,36.5,1007,h-73);
  // header: seal · series · date
  ctx.fillStyle=colors.accent;ctx.fillRect(88,72,40,54);ctx.fillStyle=colors.background;ctx.textAlign='center';ctx.font='20px "Noto Serif SC",serif';ctx.fillText('圆',108,94);ctx.fillText('周',108,118);
  ctx.textAlign='left';ctx.fillStyle=colors.muted;ctx.font='20px "Noto Serif SC",serif';ctx.fillText(copy.title,148,96);
  ctx.textAlign='right';ctx.font='18px "Noto Sans SC",sans-serif';ctx.fillText(`${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`,992,96);
  // top: the two sketches, small
  const fit=(text,max)=>{while(ctx.measureText(text).width>max&&text.length>1)text=text.slice(0,-2)+'…';return text;};
  ctx.textAlign='center';
  [[duet.a,300],[duet.b,780]].forEach(([d,cx],i)=>{
    drawCropped(ctx,inkTile(d,N,rgb),cx,150,190,240);
    ctx.fillStyle=colors.text;ctx.font='26px "Noto Serif SC",serif';ctx.fillText(fit(copy.names[i],300),cx,422);
  });
  ctx.fillStyle=colors.accent;ctx.font='44px "Noto Serif SC",serif';ctx.fillText('⇄',540,282);ctx.fillStyle=colors.muted;ctx.font='18px "Noto Serif SC",serif';ctx.fillText(copy.swap,540,318);
  // arrows down into the results
  ctx.strokeStyle=colors.accent+'99';ctx.lineWidth=1.5;for(const cx of [300,780]){ctx.beginPath();ctx.moveTo(cx,440);ctx.lineTo(cx,466);ctx.moveTo(cx-6,459);ctx.lineTo(cx,466);ctx.lineTo(cx+6,459);ctx.stroke();}
  // the swapped results, large: under A the one that looks like A (B's amplitude + A's phase)
  [[duet.ba,300,copy.left],[duet.ab,780,copy.right]].forEach(([d,cx,[line,looks]])=>{
    drawCropped(ctx,inkTile(d,N,rgb),cx,478,440,540);
    ctx.fillStyle=colors.muted;ctx.font='21px "Noto Serif SC",serif';ctx.fillText(fit(line,460),cx,1058);
    ctx.fillStyle=colors.accent;ctx.font='30px "Noto Serif SC",serif';ctx.fillText(fit(looks,460),cx,1100);
  });
  ctx.strokeStyle=colors.line+'22';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(540,480);ctx.lineTo(540,1110);ctx.stroke();
  // headline + explanation
  ctx.fillStyle=colors.text;ctx.font='56px "Noto Serif SC",serif';ctx.fillText(copy.headline,540,1196);
  ctx.fillStyle=colors.muted;ctx.font='22px "Noto Serif SC",serif';copy.explain.forEach((line,i)=>ctx.fillText(fit(line,900),540,1244+i*34));
  // footer
  ctx.textAlign='left';ctx.fillStyle=colors.accent;ctx.font='22px "Noto Sans SC",sans-serif';ctx.fillText('fourier.jupyter.pro',88,h-92);
  ctx.textAlign='right';ctx.fillStyle=colors.muted;ctx.font='17px "Noto Serif SC",serif';ctx.fillText(copy.privacy,992,h-92);
  ctx.textAlign='left';ctx.font='15px "Noto Serif SC",serif';ctx.fillText(copy.method,88,h-60);
  return card;
}

// ---- UI: visitor picks a photo, it becomes a sketch on this device, then the duet card ----
// sharer(): {surface, name} of the decrypted shared sketch, or null.
export function setupDuet({$,t,lang,sharer}){
  let duet=null,card=null,busy=false,status=()=>'';
  const say=f=>{status=f;$('duet-status').textContent=f();};
  const render=()=>{
    if(!duet)return;const s=sharer();
    card=renderDuetCard({duet,sharer:s?.name||'',visitor:$('duet-name').value,lang:lang()});
    $('duet-preview').src=card.toDataURL('image/png');$('duet-preview').hidden=false;$('duet-placeholder').hidden=true;$('duet-save').disabled=false;
  };
  const sketchOf=file=>new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),image=new Image();image.src=url;
    image.decode().then(()=>modelLineArt(image,'contour',data=>{
      const step=data.received!==undefined&&!data.cached?t(`正在下载模型 ${data.progress||0}%`,`Downloading models ${data.progress||0}%`):data.phase==='matting'?t('正在分离人物与背景…','Separating you from the background…'):t('光影正在落纸…','Bringing your sketch to paper…');
      say(()=>step);
    },data=>data.sketch?resolve(darknessFromGray(data.sketch)):reject(Error('sketch')))).then(result=>{if(!result.sketchPending)reject(Error('sketch'));},reject).finally(()=>URL.revokeObjectURL(url));
  });
  async function run(file){
    if(!file||busy)return;
    if(!['image/jpeg','image/png'].includes(file.type)){say(()=>t('请选择 JPG 或 PNG 格式的图片。','Please choose a JPG or PNG image.'));return;}
    const s=sharer();if(!s?.surface){say(()=>t('需要高清分享的完整素描。','This needs the full sketch from an HD share.'));return;}
    busy=true;$('duet-choose').disabled=true;say(()=>t('正在本地生成你的素描…','Making your sketch on this device…'));
    try{
      const mine=await sketchOf(file);say(()=>t('正在做二维傅里叶变换，交换幅度与相位…','2D Fourier transform: swapping amplitude and phase…'));
      await new Promise(r=>setTimeout(r,30));
      duet=phaseDuet(darknessFromAlpha(s.surface),mine);render();
      say(()=>t('合奏完成 · 全程本地，未上传','Duet ready · Entirely on this device, nothing uploaded'));
    }catch{say(()=>t('没能生成你的素描。请换一张五官清晰的正面照片。','Could not sketch your photo. Try a clear, front-facing photo.'));}
    finally{busy=false;$('duet-choose').disabled=false;}
  }
  $('duet-start').addEventListener('click',()=>{warmModels();$('duet-dialog').showModal();});
  $('close-duet').addEventListener('click',()=>$('duet-dialog').close());
  $('duet-choose').addEventListener('click',()=>{warmModels();$('duet-upload').click();});
  $('duet-upload').addEventListener('change',e=>{run(e.target.files[0]);e.target.value='';});
  $('duet-name').addEventListener('input',render);
  $('duet-save').addEventListener('click',()=>{if(!card)return;const a=document.createElement('a');a.download=t('相位合奏.png','phase-duet.png');a.href=card.toDataURL('image/png');a.click();});
  for(const button of document.querySelectorAll('[data-lang]'))button.addEventListener('click',()=>{render();$('duet-status').textContent=status();});
  return {render};
}
