// Drawing pacing: the pen is not driven at constant speed. Wall-clock progress u ∈ [0,1] (DRAW_SECONDS long)
// maps to drawing progress p = drawWarp(u): a slow opening (~15%) so the X/Y chains' meeting point is seen drawing,
// a brisk middle, and a gentle ease-out. The warp is the normalised integral of a smooth speed profile.
export const DRAW_SECONDS=12,SLOW_UNTIL=.15;
const smooth=(a,b,u)=>{const x=Math.max(0,Math.min(1,(u-a)/(b-a)));return x*x*(3-2*x);};
export function drawSpeed(u){
  const slow=.25,fast=1.35,end=.35;
  return u<SLOW_UNTIL?slow:u<.75?slow+(fast-slow)*smooth(SLOW_UNTIL,.35,u):fast+(end-fast)*smooth(.75,1,u);
}
const STEPS=600,table=new Float64Array(STEPS+1);
for(let i=1;i<=STEPS;i++)table[i]=table[i-1]+(drawSpeed((i-1)/STEPS)+4*drawSpeed((i-.5)/STEPS)+drawSpeed(i/STEPS))/6/STEPS;
for(let i=1;i<=STEPS;i++)table[i]/=table[STEPS];
// Monotonic, drawWarp(0)=0, drawWarp(1)=1.
export function drawWarp(u){
  if(!(u>0))return 0;if(u>=1)return 1;
  const x=u*STEPS,i=Math.floor(x);return table[i]+(table[i+1]-table[i])*(x-i);
}
