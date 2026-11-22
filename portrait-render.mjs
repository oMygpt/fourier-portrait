import {evaluate} from './fourier.mjs';
import {getPalette} from './palettes.mjs';

export const portraitInk=palette=>{const p=getPalette(palette);return {color:p.line,width:2.2,glow:p.glow,shadow:p.shadow};};
export const PORTRAIT_INK=portraitInk('ink');

export function samplePortrait(mode,chains,path,count=7200){
  if(!Number.isInteger(count)||count<1)throw new RangeError('Invalid sample count');
  if(!path.length)return [];
  return Array.from({length:count+1},(_,i)=>{
    const t=i/count,p=mode==='xy'?{x:evaluate(chains.x,t).x,y:evaluate(chains.y,t).x}:evaluate(chains.complex,t);
    return {...p,draw:Boolean(path[Math.min(path.length-1,Math.floor(t*path.length))].draw)};
  });
}

export function closeStrokeSeams(points,maxGap){
  if(!Number.isFinite(maxGap)||maxGap<0)throw new RangeError('Invalid seam distance');
  const output=points.map(p=>({...p}));
  const aligned=(ax,ay,bx,by)=>{const length=Math.hypot(ax,ay)*Math.hypot(bx,by);return length>1e-8&&ax*bx+ay*by>=.8*length;};
  for(let start=0;start<points.length;start++){
    if(points[start].draw)continue;
    let end=start;while(end+1<points.length&&!points[end+1].draw)end++;
    if(start>1&&end+2<points.length){
      const a=points[start-1],b=points[end],before=points[start-2],after=points[end+1],next=points[end+2],dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);
      let length=0;for(let i=start;i<=end;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
      if(distance>1e-6&&distance<=maxGap&&length<=maxGap*1.25&&aligned(a.x-before.x,a.y-before.y,dx,dy)&&aligned(next.x-after.x,next.y-after.y,dx,dy))for(let i=start;i<=end;i++)output[i].draw=true;
    }
    start=end;
  }
  return output;
}

export function visitorInk(cssWidth,ratio,palette='ink'){
  if(!Number.isFinite(cssWidth)||cssWidth<=0||!Number.isFinite(ratio)||ratio<=0)throw new RangeError('Invalid canvas size');
  const scale=700/(690*.96);
  const ink=portraitInk(palette);
  return {width:Math.max(ink.width*scale,1.1*900/cssWidth),glow:ink.glow*scale*ratio};
}
