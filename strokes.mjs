import {vectorize,simplify} from './lineart.mjs';
import {featureRegions,touchesFeature} from './portrait-preprocess.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const length=stroke=>stroke.slice(1).reduce((sum,p,i)=>sum+distance(p,stroke[i]),0);
const subtract=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const dot=(a,b)=>{const divisor=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);return divisor?(a.x*b.x+a.y*b.y)/divisor:0;};

export function consolidatePortrait(binary,width,height,minLength,face,landmarks=[]){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||binary.length!==width*height||!Number.isFinite(minLength)||minLength<0)throw new RangeError('Invalid portrait strokes');
  if(!face||face.length!==4||face.some(v=>!Number.isFinite(v))||face[2]<=0||face[3]<=0)throw new RangeError('Invalid face region');
  const [fx,fy,fw,fh]=face,importance=s=>s.filter(p=>((p.x-fx-fw/2)/(fw*.7))**2+((p.y-fy-fh*.48)/(fh*.65))**2<1).length/s.length;
  const regions=featureRegions(landmarks,face),protectedStroke=s=>touchesFeature(s,regions);
  const head=s=>s.some(p=>p.x>fx-fw*.8&&p.x<fx+fw*1.8&&p.y>fy-fh*.7&&p.y<fy+fh*1.1),detail=Math.max(.5,minLength/10);
  const left=new Int32Array(height).fill(width),right=new Int32Array(height).fill(-1);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(binary[y*width+x]===0){left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);}
  const outline=s=>s.some(p=>p.x<=left[Math.round(p.y)]+2||p.x>=right[Math.round(p.y)]-2);
  let strokes=vectorize(binary,width,height,0).filter(s=>protectedStroke(s)||length(s)>=(importance(s)>.15?4.2:head(s)||outline(s)?6:14)*detail);
  for(;;){
    const grid=new Map(),candidates=[];
    for(let a=0;a<strokes.length;a++)for(const side of [0,1]){const s=strokes[a],p=s[side?s.length-1:0],key=`${Math.floor(p.x/8)},${Math.floor(p.y/8)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push({a,side,p});}
    const weights=strokes.map(importance),protectedStrokes=strokes.map(protectedStroke);
    for(const endpoints of grid.values())for(const {a,side,p} of endpoints){const A=strokes[a],ra=!side,prior=A[ra?1:A.length-2];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const other of grid.get(`${Math.floor(p.x/8)+dx},${Math.floor(p.y/8)+dy}`)||[]){
        const b=other.a;if(b<=a||protectedStrokes[a]||protectedStrokes[b])continue;const B=strokes[b],q=other.p,rb=Boolean(other.side),gap=distance(p,q),facial=weights[a]>.15||weights[b]>.15;if(gap>(facial?1:5))continue;
        const next=B[rb?B.length-2:1],u=subtract(p,prior),v=subtract(next,q),bridge=subtract(q,p),agreement=dot(u,v);
        if(agreement<(facial?.95:.8)||gap>1.5&&(dot(u,bridge)<.55||dot(bridge,v)<.55))continue;candidates.push({a,b,ra,rb,cost:gap+(1-agreement)*3});
      }
    }
    if(!candidates.length)break;const used=new Set(),merged=[];
    for(const {a,b,ra,rb} of candidates.sort((a,b)=>a.cost-b.cost)){if(used.has(a)||used.has(b))continue;used.add(a);used.add(b);const A=ra?[...strokes[a]].reverse():strokes[a],B=rb?[...strokes[b]].reverse():strokes[b];merged.push([...A,...B]);}
    strokes=[...strokes.filter((s,i)=>!used.has(i)),...merged];
  }
  const score=s=>length(s)*(1+4*importance(s)+(head(s)?1:0)+(outline(s)?2:0));
  const protectedStrokes=strokes.filter(protectedStroke);
  strokes=[...protectedStrokes,...strokes.filter(s=>!protectedStroke(s)&&length(s)>=(importance(s)>.15?4.2:head(s)||outline(s)?6:17)*detail).sort((a,b)=>score(b)-score(a)).slice(0,Math.max(0,120-protectedStrokes.length))];
  return strokes.map(s=>protectedStroke(s)||importance(s)>.15||head(s)||outline(s)?s:simplify(s.map((p,i)=>!i||i===s.length-1?p:{x:.12*s[i-1].x+.76*p.x+.12*s[i+1].x,y:.12*s[i-1].y+.76*p.y+.12*s[i+1].y}),.9));
}
