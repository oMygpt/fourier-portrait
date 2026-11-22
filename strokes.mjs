import {thin,simplify} from './lineart.mjs';
import {featureRegions,touchesFeature} from './portrait-preprocess.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const length=stroke=>stroke.slice(1).reduce((sum,p,i)=>sum+distance(p,stroke[i]),0);
const inRegion=(p,regions)=>regions.some(r=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height);

function skeletonEdges(binary,width,height){
  const mask=thin(binary,width,height),adjacency=new Map();
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const index=y*width+x;if(!mask[index])continue;const neighbors=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if((!dx&&!dy)||!mask[index+dy*width+dx])continue;if(dx&&dy&&(mask[index+dx]||mask[index+dy*width]))continue;neighbors.push(index+dy*width+dx);}
    adjacency.set(index,neighbors);
  }
  const seen=new Set(),edges=[],key=(a,b)=>a<b?a*1e7+b:b*1e7+a;
  const trace=(start,next)=>{const indices=[start];let previous=start,current=next;seen.add(key(previous,current));
    for(;;){indices.push(current);const neighbors=adjacency.get(current)||[];if(neighbors.length!==2||current===start)break;const candidate=neighbors.find(n=>n!==previous);if(seen.has(key(current,candidate)))break;seen.add(key(current,candidate));previous=current;current=candidate;}
    edges.push(indices.map(i=>({x:i%width,y:Math.floor(i/width),i})));};
  for(const [start,neighbors] of adjacency)if(neighbors.length!==2)for(const next of neighbors)if(!seen.has(key(start,next)))trace(start,next);
  for(const [start,neighbors] of adjacency)for(const next of neighbors)if(!seen.has(key(start,next)))trace(start,next);
  return edges;
}

// Skeleton graph → long strokes: drop short spurs, continue straight through junctions, bridge small aligned gaps.
export function longStrokes(binary,width,height,regions=[]){
  let edges=skeletonEdges(binary,width,height);const degree=new Map(),bump=(i,d)=>degree.set(i,(degree.get(i)||0)+d);
  for(const e of edges){bump(e[0].i,1);bump(e.at(-1).i,1);}
  for(let pass=0;pass<2;pass++)edges=edges.filter(e=>{const a=degree.get(e[0].i),b=degree.get(e.at(-1).i);if((a===1&&b>=3||b===1&&a>=3)&&length(e)<4&&!e.some(p=>inRegion(p,regions))){bump(e[0].i,-1);bump(e.at(-1).i,-1);return false;}return true;});
  const direction=(e,end)=>{const a=end?e.at(-1):e[0],b=end?e[Math.max(0,e.length-6)]:e[Math.min(e.length-1,5)],d=Math.hypot(a.x-b.x,a.y-b.y)||1;return {x:(a.x-b.x)/d,y:(a.y-b.y)/d};};
  const ends=edges.flatMap((e,k)=>[0,1].map(end=>({k,end,p:end?e.at(-1):e[0],d:direction(e,end)}))),id=e=>e.k*2+e.end,link=new Map();
  const connect=(a,b)=>{if(link.has(id(a))||link.has(id(b)))return;link.set(id(a),b);link.set(id(b),a);};
  const nodes=new Map();for(const e of ends){if(!nodes.has(e.p.i))nodes.set(e.p.i,[]);nodes.get(e.p.i).push(e);}
  for(const list of nodes.values()){
    const pairs=[];for(let a=0;a<list.length;a++)for(let b=a+1;b<list.length;b++)if(list[a].k!==list[b].k)pairs.push([list[a].d.x*list[b].d.x+list[a].d.y*list[b].d.y,list[a],list[b]]);
    for(const [cos,a,b] of pairs.sort((a,b)=>a[0]-b[0]))if(cos<=-.35)connect(a,b);
  }
  const free=ends.filter(e=>!link.has(id(e))&&degree.get(e.p.i)===1&&!inRegion(e.p,regions)),bridges=[];
  for(let a=0;a<free.length;a++)for(let b=a+1;b<free.length;b++){
    const A=free[a],B=free[b],dx=B.p.x-A.p.x,dy=B.p.y-A.p.y,d=Math.hypot(dx,dy);if(d>5.5||d<1e-6||A.k===B.k&&length(edges[A.k])<16)continue;
    const ca=(A.d.x*dx+A.d.y*dy)/d,cb=-(B.d.x*dx+B.d.y*dy)/d;if(ca>.5&&cb>.5)bridges.push([d/(ca+cb),A,B]);
  }
  for(const [,a,b] of bridges.sort((a,b)=>a[0]-b[0]))connect(a,b);
  const used=new Uint8Array(edges.length),strokes=[];
  const walk=(k,end)=>{const out=[];let current={k,end};
    while(current&&!used[current.k]){used[current.k]=1;const e=edges[current.k],points=current.end?[...e].reverse():e;
      out.push(...(out.length&&distance(out.at(-1),points[0])<.5?points.slice(1):points));current=link.get(id({k:current.k,end:1-current.end}))||null;}
    return out;};
  for(const e of ends)if(!used[e.k]&&!link.has(id(e)))strokes.push(walk(e.k,e.end));
  for(let k=0;k<edges.length;k++)if(!used[k])strokes.push(walk(k,0));
  return strokes.map(s=>simplify(s.map(({x,y})=>({x,y})),.7));
}

function chaikin(stroke){let points=stroke;for(let pass=0;pass<2&&points.length>2;pass++){const next=[points[0]];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];next.push({x:.75*a.x+.25*b.x,y:.75*a.y+.25*b.y},{x:.25*a.x+.75*b.x,y:.25*a.y+.75*b.y});}next.push(points.at(-1));points=next;}return points;}

export function portraitStrokes(binary,width,height,minLength,face=null,landmarks=[]){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||binary.length!==width*height||!Number.isFinite(minLength)||minLength<0)throw new RangeError('Invalid portrait strokes');
  const regions=featureRegions(landmarks,face),protectedStroke=s=>touchesFeature(s,regions),margin=5;
  const center=s=>s.reduce((c,p)=>({x:c.x+p.x/s.length,y:c.y+p.y/s.length}),{x:0,y:0});
  const head=face?s=>{const [fx,fy,fw,fh]=face,c=center(s);return c.x>fx-fw*.6&&c.x<fx+fw*1.6&&c.y>fy-fh*.8&&c.y<fy+fh*1.25;}:s=>{const c=center(s);return ((c.x/width-.5)/.3)**2+((c.y/height-.36)/.28)**2<1;};
  const border=s=>s.filter(p=>p.x<margin||p.y<margin||p.x>width-1-margin||p.y>height-1-margin).length>s.length/2;
  const score=s=>length(s)*(protectedStroke(s)?4:head(s)?2.5:1);
  const strokes=longStrokes(binary,width,height,regions).filter(s=>protectedStroke(s)||!border(s)&&length(s)>=minLength*(head(s)?.55:2.3));
  const kept=strokes.filter(protectedStroke),rest=strokes.filter(s=>!protectedStroke(s)).sort((a,b)=>score(b)-score(a)).slice(0,Math.max(0,130-kept.length));
  return [...kept,...rest].map(s=>protectedStroke(s)?s:chaikin(s));
}

export function consolidatePortrait(binary,width,height,minLength,face,landmarks=[]){
  if(!face||face.length!==4||face.some(v=>!Number.isFinite(v))||face[2]<=0||face[3]<=0)throw new RangeError('Invalid face region');
  return portraitStrokes(binary,width,height,minLength,face,landmarks);
}
