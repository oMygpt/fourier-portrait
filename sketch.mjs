import {getPalette} from './palettes.mjs';

export function u2Input(rgba){
  if(!rgba.length||rgba.length%4)throw new RangeError('Invalid image pixels');
  const count=rgba.length/4,data=new Float32Array(count*3),mean=[.485,.456,.406],std=[.229,.224,.225];let maximum=0;
  for(let i=0;i<count;i++)for(let c=0;c<3;c++)maximum=Math.max(maximum,rgba[i*4+c]/255);
  for(let i=0;i<count;i++)for(let c=0;c<3;c++)data[c*count+i]=(rgba[i*4+c]/255/Math.max(maximum,1e-8)-mean[c])/std[c];
  return data;
}

export function u2Gray(values){
  if(!values.length)throw new RangeError('Empty sketch output');
  let lo=Infinity,hi=-Infinity;
  for(const value of values){if(!Number.isFinite(value))throw new RangeError('Invalid sketch output');lo=Math.min(lo,value);hi=Math.max(hi,value);}
  return Uint8Array.from(values,value=>hi-lo<1e-8?255:Math.round((hi-value)/(hi-lo)*255));
}

export function sketchReveal(progress){
  const t=Math.max(0,Math.min(1,(progress-.08)/.92));return t*t*(3-2*t);
}

export function tintSketch(source,palette='ink'){
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),hex=getPalette(palette).line.slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  for(let i=0;i<pixels.data.length;i+=4){const alpha=(255-pixels.data[i])*pixels.data[i+3]/255;pixels.data.set([...rgb,Math.round(alpha)],i);}
  ctx.putImageData(pixels,0,0);return canvas;
}
