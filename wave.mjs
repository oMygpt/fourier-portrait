// Tones as a 2D Fourier series (the "A" layer): the sketch is split into plane waves
//   d(x, y) = Σ F(kx, ky) e^{2πi(kx·x + ky·y)/N}
// and rebuilt from low to high spatial frequency. Lines are 1D Fourier (circles); tones are 2D Fourier (waves).
// The sketch itself comes from the U²-Net network; with every frequency added the rebuild equals it exactly.

export const DEVELOP_SECONDS=4.5,MAX_SIDE=512;

export function fft1(re,im,inverse=false){
  const n=re.length;if(n&(n-1))throw new RangeError('FFT length must be a power of two');
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
  for(let len=2;len<=n;len<<=1){
    const angle=(inverse?2:-2)*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle),half=len>>1;
    for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<half;j++){const a=i+j,b=a+half,vr=re[b]*cr-im[b]*ci,vi=re[b]*ci+im[b]*cr;re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}
  }
  if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}

export function fft2(re,im,N,inverse=false){
  const r=new Float64Array(N),i=new Float64Array(N);
  for(let y=0;y<N;y++){r.set(re.subarray(y*N,y*N+N));i.set(im.subarray(y*N,y*N+N));fft1(r,i,inverse);re.set(r,y*N);im.set(i,y*N);}
  for(let x=0;x<N;x++){for(let y=0;y<N;y++){r[y]=re[y*N+x];i[y]=im[y*N+x];}fft1(r,i,inverse);for(let y=0;y<N;y++){re[y*N+x]=r[y];im[y*N+x]=i[y];}}
}

// Frequency radii, doubling like the circle ladder, ending with every frequency.
export function waveRadii(N){
  const radii=[];for(let r=2;r<N/2;r*=2)radii.push(r);radii.push(Math.ceil(Math.SQRT2*N/2)+1);
  return radii;
}

const signed=(k,N)=>k<N/2?k:k-N;
// One real plane wave = one conjugate pair; count each pair once (half plane).
const halfPlane=(kx,ky)=>ky>0||(ky===0&&kx>=0);

// Step-wise so callers can yield between inverse transforms (each ~10–40 ms at 512²).
export function* waveSteps(darkness,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE||darkness.length!==width*height)throw new RangeError('Invalid tone image');
  let N=1;while(N<Math.max(width,height))N*=2;
  const ox=(N-width)>>1,oy=(N-height)>>1,re=new Float64Array(N*N),im=new Float64Array(N*N);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)re[(y+oy)*N+x+ox]=darkness[y*width+x];
  fft2(re,im,N);yield null;
  const radius=new Float32Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++)radius[y*N+x]=Math.hypot(signed(x,N),signed(y,N));
  let previous=-1;
  for(const R of waveRadii(N)){
    const r2=new Float64Array(N*N),i2=new Float64Array(N*N);let waves=0,best=null;
    for(let k=0;k<N*N;k++){
      if(radius[k]>R)continue;r2[k]=re[k];i2[k]=im[k];
      const kx=signed(k%N,N),ky=signed(Math.floor(k/N),N);if(!halfPlane(kx,ky))continue;waves++;
      if(radius[k]>previous&&(kx||ky)){const m=Math.hypot(re[k],im[k]);if(!best||m>best.m)best={m,kx,ky,phase:Math.atan2(im[k],re[k])};}
    }
    fft2(r2,i2,N,true);
    const image=new Float32Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)image[y*width+x]=r2[(y+oy)*N+x+ox];
    previous=R;
    yield {radius:R,waves,image,wave:best&&{kx:best.kx,ky:best.ky,phase:best.phase,N}};
  }
}

export function prepareWaves(darkness,width,height){
  const levels=[];for(const level of waveSteps(darkness,width,height))if(level)levels.push(level);
  return {width,height,levels};
}

export async function prepareWavesAsync(darkness,width,height,{signal}={}){
  const levels=[];
  for(const level of waveSteps(darkness,width,height)){
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    if(level)levels.push(level);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {width,height,levels};
}

// Position along the ladder for progress 0..1: rung index and an eased blend toward the next rung.
export function waveState(progress,count){
  if(!Number.isInteger(count)||count<1)throw new RangeError('Invalid level count');
  const p=Math.max(0,Math.min(1,progress))*(count-1),index=Math.min(count-1,Math.floor(p)),f=index===count-1?0:p-index;
  return {index,f:f*f*(3-2*f)};
}

export function blendLevels(waves,progress,out=new Float32Array(waves.width*waves.height)){
  const {index,f}=waveState(progress,waves.levels.length),a=waves.levels[index].image,b=waves.levels[Math.min(waves.levels.length-1,index+1)].image;
  for(let i=0;i<out.length;i++)out[i]=a[i]+(b[i]-a[i])*f;
  return {image:out,level:waves.levels[f<.5?index:Math.min(waves.levels.length-1,index+1)]};
}

// The model-download wait: the photo itself (grayscale darkness) developed from waves, on a loop.
export const PHOTO_SIDE=192,PHOTO_DEVELOP=7,PHOTO_HOLD=2.5;

// RGBA photo → darkness 0..1 (1 − luminance), stretched between the 2nd and 98th percentiles so dull photos still read.
export function photoDarkness(rgba,width,height){
  const n=width*height;if(!n||rgba.length<n*4)throw new RangeError('Invalid photo');
  const dark=new Float32Array(n),histogram=new Uint32Array(256);
  for(let i=0;i<n;i++){const a=rgba[i*4+3]/255,l=(.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2])*a+255*(1-a),v=Math.round(255-l);dark[i]=v;histogram[v]++;}
  const at=q=>{let sum=0;for(let v=0;v<256;v++){sum+=histogram[v];if(sum>=q*n)return v;}return 255;},low=at(.02),high=Math.max(low+1,at(.98));
  for(let i=0;i<n;i++)dark[i]=Math.max(0,Math.min(1,(dark[i]-low)/(high-low)));
  return dark;
}

// Loop timing: develop over `develop` seconds, hold the finished photo for `hold`, start again. Reduced motion: always finished.
export function photoLoopProgress(seconds,{develop=PHOTO_DEVELOP,hold=PHOTO_HOLD,reduced=false}={}){
  if(reduced||!(seconds>0))return reduced?1:0;
  return Math.min(1,(seconds%(develop+hold))/develop);
}

// Live plane-wave count at a progress (eased between rungs, like the image).
export function waveCountAt(waves,progress){
  const {index,f}=waveState(progress,waves.levels.length),a=waves.levels[index].waves,b=waves.levels[Math.min(waves.levels.length-1,index+1)].waves;
  return Math.round(a+(b-a)*f);
}

// ---- browser helpers ----
export function darknessFromPhoto(image,side=PHOTO_SIDE){
  const w0=image.naturalWidth||image.width,h0=image.naturalHeight||image.height,scale=Math.min(1,side/Math.max(w0,h0)),width=Math.max(1,Math.round(w0*scale)),height=Math.max(1,Math.round(h0*scale));
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
  return {darkness:photoDarkness(ctx.getImageData(0,0,width,height).data,width,height),width,height};
}

export function darknessFromSurface(surface){
  const scale=Math.min(1,MAX_SIDE/Math.max(surface.width,surface.height)),width=Math.max(1,Math.round(surface.width*scale)),height=Math.max(1,Math.round(surface.height*scale));
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(surface,0,0,width,height);
  const data=ctx.getImageData(0,0,width,height).data;
  return {darkness:Float32Array.from({length:width*height},(_,i)=>data[i*4+3]/255),width,height};
}

// A tinted surface (ink colour, alpha = darkness) for the given progress; reuses its canvas.
export function waveFrame(waves,progress,rgb,cache={}){
  if(!cache.canvas){cache.canvas=document.createElement('canvas');cache.canvas.width=waves.width;cache.canvas.height=waves.height;cache.pixels=cache.canvas.getContext('2d').createImageData(waves.width,waves.height);cache.buffer=new Float32Array(waves.width*waves.height);}
  const {image,level}=blendLevels(waves,progress,cache.buffer),d=cache.pixels.data;
  for(let i=0;i<image.length;i++){d[i*4]=rgb[0];d[i*4+1]=rgb[1];d[i*4+2]=rgb[2];d[i*4+3]=Math.max(0,Math.min(255,Math.round(image[i]*255)));}
  cache.canvas.getContext('2d').putImageData(cache.pixels,0,0);
  return {surface:cache.canvas,level};
}

// Small inset: the strongest plane wave added in the current band (orientation exact, stripe density compressed).
export function drawWaveInset(ctx,wave,x,y,size,colors){
  if(!wave)return;
  const k=Math.hypot(wave.kx,wave.ky),stripes=Math.min(14,1.5+Math.log2(1+k)*1.6),ux=wave.kx/k*stripes/size,uy=wave.ky/k*stripes/size;
  const img=new ImageData(size,size),rgb=[1,3,5].map(i=>parseInt(colors.line.slice(i,i+2),16)),paper=[1,3,5].map(i=>parseInt(colors.background.slice(i,i+2),16));
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){const v=.5+.5*Math.cos(2*Math.PI*(ux*i+uy*j)+wave.phase),o=(j*size+i)*4;for(let c=0;c<3;c++)img.data[o+c]=Math.round(paper[c]+(rgb[c]-paper[c])*v*.85);img.data[o+3]=255;}
  const tile=document.createElement('canvas');tile.width=tile.height=size;tile.getContext('2d').putImageData(img,0,0);ctx.drawImage(tile,x,y,size,size);
}
