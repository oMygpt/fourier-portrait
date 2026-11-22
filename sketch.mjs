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

export function paperSketch(gray,width,height,matte=null){
  if(width<2||height<2||gray.length!==width*height||matte&&matte.length!==gray.length)throw new RangeError('Invalid sketch dimensions');
  const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
  return Uint8Array.from(gray,(value,i)=>{
    const x=(i%width)/(width-1),y=Math.floor(i/width)/(height-1),bottom=1-.14*((x-.5)*2)**2,edge=smooth(Math.min(x/.09,(1-x)/.09,y/.055,(bottom-y)/.16)),subject=matte?smooth((matte[i]/255-.04)/.76):1;
    return Math.round(255-(255-value)*edge*subject);
  });
}

export function subjectMatte(matte,width,height){
  if(width<2||height<2||matte.length!==width*height)throw new RangeError('Invalid matte dimensions');
  const count=matte.length,seen=new Uint8Array(count),queue=new Int32Array(count);let largest=new Int32Array();
  for(let start=0;start<count;start++){
    if(seen[start]||matte[start]<128)continue;
    let head=0,tail=1;queue[0]=start;seen[start]=1;
    while(head<tail){const p=queue[head++];for(const next of [p-1,p+1,p-width,p+width])if(next>=0&&next<count&&!seen[next]&&matte[next]>=128&&Math.abs(next%width-p%width)<=1){seen[next]=1;queue[tail++]=next;}}
    if(tail>largest.length)largest=queue.slice(0,tail);
  }
  if(!largest.length)return matte.slice();
  const distance=new Uint16Array(count).fill(65535),radius=Math.max(2,Math.round(Math.min(width,height)*.015));for(const i of largest)distance[i]=0;
  for(let i=0;i<count;i++){if(i%width)distance[i]=Math.min(distance[i],distance[i-1]+1);if(i>=width)distance[i]=Math.min(distance[i],distance[i-width]+1);}
  for(let i=count-1;i>=0;i--){if(i%width<width-1)distance[i]=Math.min(distance[i],distance[i+1]+1);if(i<count-width)distance[i]=Math.min(distance[i],distance[i+width]+1);}
  return Uint8Array.from(matte,(value,i)=>Math.round(value*Math.max(0,1-distance[i]/radius)));
}

export function sketchBlend(palette){return palette==='ink'?'multiply':'screen';}

export function drawSketch(context,surface,x,y,width,height,palette){
  context.save();context.globalCompositeOperation=sketchBlend(palette);context.drawImage(surface,x,y,width,height);context.restore();
}

export function tintSketch(source,palette='ink'){
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),hex=getPalette(palette).line.slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  for(let i=0;i<pixels.data.length;i+=4){const alpha=(255-pixels.data[i])*pixels.data[i+3]/255;pixels.data.set([...rgb,Math.round(alpha)],i);}
  ctx.putImageData(pixels,0,0);return canvas;
}
