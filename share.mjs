import {evaluate} from './fourier.mjs';

export const cleanName = value => Array.from(String(value).normalize('NFC').replace(/[\p{C}<>]/gu,'').trim()).slice(0,16).join('');

function compact(values, real, samples) {
  if(!real)return values.map(c=>({...c,weight:c.amplitude**2}));
  const pairs=new Map(),single=[];
  for(const c of values){
    if(!c.k||c.k===-samples/2){single.push({...c,weight:c.amplitude**2});continue;}
    const k=Math.abs(c.k),p=pairs.get(k)||{k,re:0,im:0};
    p.re+=c.re/2;p.im+=(c.k>0?c.im:-c.im)/2;pairs.set(k,p);
  }
  return [...single,...[...pairs.values()].map(c=>({...c,amplitude:Math.hypot(c.re,c.im),phase:Math.atan2(c.im,c.re),weight:2*(c.re*c.re+c.im*c.im)}))].sort((a,b)=>b.weight-a.weight);
}

export function encodePortrait({mode,chains,path,dimensions,name=''}, base, budget=2000) {
  const samples=path.length;
  if(samples<2||samples>4096)throw Error('无可分享的画像');
  const title=new TextEncoder().encode(cleanName(name)),real=mode==='xy';
  const groups=real?[compact(chains.x,true,samples),compact(chains.y,true,samples)]:[compact(chains.complex,false,samples),[]];
  const maskSize=Math.ceil(samples/8),header=25+title.length+maskSize;
  const prefix=base.split('#')[0]+'#p=',capacity=Math.floor((budget-prefix.length)*3/4);
  const slots=Math.floor((capacity-header)/4);
  if(slots<16)throw Error('分享地址过长，请使用较短的网址。');
  const candidates=groups.flatMap((g,chain)=>g.map(c=>({...c,chain}))).sort((a,b)=>b.weight-a.weight);
  const chosen=candidates.slice(0,slots),selected=groups.map((_,chain)=>chosen.filter(c=>c.chain===chain).sort((a,b)=>b.amplitude-a.amplitude));
  const total=candidates.reduce((s,c)=>s+c.weight,0),energy=total?chosen.reduce((s,c)=>s+c.weight,0)/total:1;
  const bytes=new Uint8Array(header+chosen.length*4),view=new DataView(bytes.buffer);let p=0;
  const u8=v=>view.setUint8(p++,v),u16=v=>{view.setUint16(p,v,true);p+=2;},f32=v=>{view.setFloat32(p,v,true);p+=4;};
  u8(70);u8(1);u8(real?0:1);u16(samples);u16(dimensions.width);u16(dimensions.height);
  u16(selected[0].length);u16(selected[1].length);
  const maxima=selected.map(g=>Math.max(...g.map(c=>c.amplitude),1e-9));maxima.forEach(f32);
  u16(Math.round(energy*65535));u8(title.length);u8(0);
  bytes.set(title,p);p+=title.length;
  for(let i=0;i<samples;i++)if(path[i].draw)bytes[p+(i>>3)]|=1<<(i%8);p+=maskSize;
  for(let group=0;group<2;group++)for(const c of selected[group]){
    view.setInt16(p,c.k,true);p+=2;
    u8(Math.min(255,Math.max(0,Math.round(-24*Math.log(Math.max(1e-12,c.amplitude/maxima[group]))))));
    u8(Math.round(((c.phase/(2*Math.PI))%1+1)%1*256)%256);
  }
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const url=prefix+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(url.length>budget)throw Error('分享地址超出容量');
  return {url,energy,terms:selected.map((g,i)=>g.reduce((n,c)=>n+(real&&c.k>0?2:1),0)),bytes:bytes.length};
}

export function decodePortrait(fragment) {
  try{
    const encoded=fragment.replace(/^.*#p=/,'');
    if(encoded.length>4000||!/^[\w-]+$/.test(encoded))throw Error();
    const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);let p=0;
    const u8=()=>view.getUint8(p++),u16=()=>{const v=view.getUint16(p,true);p+=2;return v;},f32=()=>{const v=view.getFloat32(p,true);p+=4;return v;};
    if(u8()!==70||u8()!==1)throw Error();const flag=u8();if(flag>1)throw Error();
    const mode=flag?'complex':'xy',samples=u16(),width=u16(),height=u16(),counts=[u16(),u16()],maxima=[f32(),f32()],energy=u16()/65535,nameSize=u8();u8();
    if(samples<2||samples>4096||width<4||height<4||width>400||height>400||counts[0]+counts[1]>700||nameSize>64||maxima.some(n=>!Number.isFinite(n)||n<=0||n>1e5))throw Error();
    const size=Math.ceil(samples/8);if(bytes.length!==25+nameSize+size+4*(counts[0]+counts[1]))throw Error();
    const name=cleanName(new TextDecoder().decode(bytes.slice(p,p+nameSize)));p+=nameSize;
    const lifts=Array.from({length:samples},(_,i)=>Boolean(bytes[p+(i>>3)]&(1<<(i%8))));p+=size;
    const groups=counts.map((count,g)=>{
      const values=[];
      for(let i=0;i<count;i++){
        const k=view.getInt16(p,true);p+=2;if(Math.abs(k)>samples/2)throw Error();
        const amplitude=maxima[g]*Math.exp(-u8()/24),phase=u8()/256*2*Math.PI,re=amplitude*Math.cos(phase),im=amplitude*Math.sin(phase);
        values.push({k,amplitude,phase,re,im});
        if(mode==='xy'&&k>0)values.push({k:-k,amplitude,phase:-phase,re,im:-im});
      }
      return values.sort((a,b)=>b.amplitude-a.amplitude);
    });
    const chains={x:mode==='xy'?groups[0]:[],y:mode==='xy'?groups[1]:[],complex:mode==='complex'?groups[0]:[]};
    const path=lifts.map((draw,i)=>{
      const t=i/samples,p=mode==='xy'?{x:evaluate(chains.x,t).x,y:evaluate(chains.y,t).x}:evaluate(chains.complex,t);
      return {...p,draw};
    });
    return {mode,chains,path,dimensions:{width,height},name,energy};
  }catch{throw Error('分享链接无效或版本不受支持，请生成自己的画像。');}
}
