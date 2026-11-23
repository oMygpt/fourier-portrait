// Hand-drawn ink for every Fourier line in the app: each stroke (a run between pen lifts) tapers at both ends
// and breathes gently in width along its length. Only the rendering changes — points and formula are untouched.
// Deterministic: the same formula always produces the same ink.

const TAPER=.18,MIN_END=.22;

function hash(n){let h=Math.imul(n^0x9e3779b9,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h>>>0)/4294967296;}
const smooth=t=>t*t*(3-2*t);

// Width factor for a position `s` (0..1) along a stroke of `length` px, stroke number `index`.
export function inkWidth(s,length,index=0){
  if(!(s>=0&&s<=1))throw new RangeError('Invalid stroke position');
  const taper=Math.min(.5,TAPER*Math.max(1,60/Math.max(1,length))),end=Math.min(s,1-s),body=end>=taper?1:MIN_END+(1-MIN_END)*smooth(end/taper);
  const breath=.86+.24*(.5+.5*Math.sin(2*Math.PI*(s*(1.2+hash(index)*1.6)+hash(index+7))));
  const pressure=.88+.24*hash(index+13);
  return body*breath*pressure;
}

// Per-point width factors for a polyline with pen-lift flags (point i draws the segment i-1 → i).
export function inkProfile(points){
  const profile=new Float32Array(points.length);let start=-1,index=0;
  const close=end=>{
    if(start<0)return;
    let total=0;const lengths=[0];
    for(let i=start+1;i<=end;i++){total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);lengths.push(total);}
    for(let i=start;i<=end;i++)profile[i]=inkWidth(total?lengths[i-start]/total:.5,total,index);
    index++;start=-1;
  };
  for(let i=1;i<points.length;i++){
    if(points[i].draw){if(start<0)start=i-1;}
    else close(i-1);
  }
  close(points.length-1);
  return profile;
}

// Stroke points [from, to) with tapered widths. `map` converts formula coordinates to canvas pixels.
export function drawInk(ctx,points,profile,map,{width=2.4,from=1,to=points.length}={}){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  let previous=from>0?map(points[from-1]):null;
  for(let i=Math.max(1,from);i<to;i++){
    const q=map(points[i]);
    if(points[i].draw&&previous){ctx.lineWidth=Math.max(.35,width*(profile[i-1]+profile[i])/2);ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    previous=q;
  }
  ctx.restore();
}
