import {evaluate} from './fourier.mjs';
import {deflateSync,inflateSync} from './vendor/fflate/fflate.mjs';

export const cleanName = value => Array.from(String(value).normalize('NFC').replace(/[\p{C}<>]/gu,'').trim()).slice(0,16).join('');
export const SHARE_BASE = 'https://omygpt.github.io/fourier-portrait/';

const decimalWidths=[0,3,5,8,10,13];

export function bytesToDecimal(bytes){
  if(!(bytes instanceof Uint8Array))throw new TypeError('Expected bytes');
  if(bytes.length>4096)throw new RangeError('Payload too large');
  let digits=String(bytes.length%5);
  for(let i=0;i<bytes.length;i+=5){const count=Math.min(5,bytes.length-i);let value=0;for(let j=0;j<count;j++)value=value*256+bytes[i+j];digits+=String(value).padStart(decimalWidths[count],'0');}
  return digits;
}

export function decimalToBytes(digits){
  if(typeof digits!=='string'||digits.length>10651||!/^([0-4])\d*$/.test(digits))throw new RangeError('Invalid decimal payload');
  const tail=Number(digits[0]),whole=digits.length-1-decimalWidths[tail];
  if(whole<0||whole%13)throw new RangeError('Invalid decimal padding');
  const length=whole/13*5+tail;if(length>4096)throw new RangeError('Payload too large');
  const bytes=new Uint8Array(length);let p=1;
  for(let i=0;i<length;i+=5){const count=Math.min(5,length-i);let value=Number(digits.slice(p,p+decimalWidths[count]));p+=decimalWidths[count];if(value>=2**(8*count))throw new RangeError('Decimal overflow');for(let j=count-1;j>=0;j--){bytes[i+j]=value%256;value=Math.floor(value/256);}}
  return bytes;
}

export function shareQrSegments(url){
  const marker=url.indexOf('#n');
  return marker>=0&&/^\d+$/.test(url.slice(marker+2))?[{data:url.slice(0,marker+2),mode:'Byte'},{data:url.slice(marker+2),mode:'Numeric'}]:[{data:url,mode:'Byte'}];
}

export function shareQrBits(url){
  return shareQrSegments(url).reduce((bits,{data,mode})=>bits+(mode==='Byte'?20+new TextEncoder().encode(data).length*8:16+Math.floor(data.length/3)*10+[0,4,7][data.length%3]),0);
}

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

export function encodePortrait({mode,chains,path,dimensions,name='',guess=false}, base=SHARE_BASE, bitBudget=5760) {
  const samples=path.length;
  if(samples<2||samples>4096)throw Error('无可分享的画像');
  const title=new TextEncoder().encode(cleanName(name)),real=mode==='xy';
  const groups=real?[compact(chains.x,true,samples),compact(chains.y,true,samples)]:[compact(chains.complex,false,samples),[]];
  const maskSize=Math.ceil(samples/8),header=25+title.length+maskSize;
  const prefix=base.split('#')[0]+'#n';
  const candidates=groups.flatMap((g,chain)=>g.map(c=>({...c,chain}))).sort((a,b)=>b.weight-a.weight);
  function pack(count){
  const chosen=candidates.slice(0,count),selected=groups.map((_,chain)=>chosen.filter(c=>c.chain===chain).sort((a,b)=>a.k-b.k));
  const total=candidates.reduce((s,c)=>s+c.weight,0),energy=total?chosen.reduce((s,c)=>s+c.weight,0)/total:1;
  const bytes=new Uint8Array(header+chosen.length*6),view=new DataView(bytes.buffer);let p=0;
  const u8=v=>view.setUint8(p++,v),u16=v=>{view.setUint16(p,v,true);p+=2;},f32=v=>{view.setFloat32(p,v,true);p+=4;};
  u8(70);u8(2);u8(real?0:1);u16(samples);u16(dimensions.width);u16(dimensions.height);
  u16(selected[0].length);u16(selected[1].length);
  const maxima=selected.map(g=>Math.max(...g.map(c=>c.amplitude),1e-9));maxima.forEach(f32);
  u16(Math.round(energy*65535));u8(title.length);u8(guess?1:0);
  bytes.set(title,p);p+=title.length;
  for(let i=0;i<samples;i++)if(path[i].draw)bytes[p+(i>>3)]|=1<<(i%8);p+=maskSize;
  const variable=value=>{while(value>=128){u8((value&127)|128);value>>>=7;}u8(value);};
  for(let group=0;group<2;group++){let previous=0;for(const [i,c] of selected[group].entries()){
    variable(i?c.k-previous:c.k<0?-2*c.k-1:2*c.k);previous=c.k;
    u8(Math.round(255*Math.sqrt(c.amplitude/maxima[group])));
    u8(Math.round(((c.phase/(2*Math.PI))%1+1)%1*256)%256);
  }}
  const compressed=deflateSync(bytes.subarray(0,p),{level:9}),wire=new Uint8Array(compressed.length+2);wire.set([70,2]);wire.set(compressed,2);
  const url=prefix+bytesToDecimal(wire);
  return {url,energy,terms:selected.map(g=>g.reduce((n,c)=>n+(real&&c.k>0?2:1),0)),bytes:wire.length,qrBits:shareQrBits(url)};
  }
  let low=Math.min(16,candidates.length),high=Math.min(700,candidates.length),best=pack(low);
  if(best.qrBits>bitBudget)throw Error('分享地址过长，请使用较短的网址。');
  while(low<=high){const count=Math.floor((low+high)/2),result=pack(count);if(result.qrBits<=bitBudget){best=result;low=count+1;}else high=count-1;}
  return best;
}

export function decodePortrait(fragment) {
  try{
    const hash=fragment.includes('#')?fragment.slice(fragment.indexOf('#')):fragment;
    let wire;
    if(hash.startsWith('#n'))wire=decimalToBytes(hash.slice(2));
    else{
      const encoded=hash.replace(/^#p=/,'');if(encoded.length>4000||!/^[\w-]+$/.test(encoded))throw Error();
      const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));wire=Uint8Array.from(binary,c=>c.charCodeAt(0));
    }
    const bytes=wire[0]===70&&wire[1]===2?inflateSync(wire.subarray(2),{out:new Uint8Array(8192)}):wire;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=0;
    const u8=()=>view.getUint8(p++),u16=()=>{const v=view.getUint16(p,true);p+=2;return v;},f32=()=>{const v=view.getFloat32(p,true);p+=4;return v;};
    if(u8()!==70)throw Error();const version=u8();if(version!==1&&version!==2)throw Error();const flag=u8();if(flag>1)throw Error();
    const mode=flag?'complex':'xy',samples=u16(),width=u16(),height=u16(),counts=[u16(),u16()],maxima=[f32(),f32()],energy=u16()/65535,nameSize=u8(),options=u8();
    if(options>1||version===1&&options)throw Error();
    if(samples<2||samples>4096||width<4||height<4||width>400||height>400||counts[0]+counts[1]>700||nameSize>64||maxima.some(n=>!Number.isFinite(n)||n<=0||n>1e5))throw Error();
    const size=Math.ceil(samples/8);if(version===1&&bytes.length!==25+nameSize+size+4*(counts[0]+counts[1]))throw Error();
    const name=cleanName(new TextDecoder().decode(bytes.slice(p,p+nameSize)));p+=nameSize;
    const lifts=Array.from({length:samples},(_,i)=>Boolean(bytes[p+(i>>3)]&(1<<(i%8))));p+=size;
    const groups=counts.map((count,g)=>{
      const values=[];let previous=0;
      for(let i=0;i<count;i++){
        let k;
        if(version===1){k=view.getInt16(p,true);p+=2;}else{let value=0,shift=0,byte;do{byte=u8();value|=(byte&127)<<shift;shift+=7;if(shift>21)throw Error();}while(byte&128);k=i?previous+value:value&1?-(value+1)/2:value/2;if(i&&k<=previous)throw Error();previous=k;}
        if(Math.abs(k)>samples/2)throw Error();
        const amplitude=maxima[g]*(version===1?Math.exp(-u8()/24):(u8()/255)**2),phase=u8()/256*2*Math.PI,re=amplitude*Math.cos(phase),im=amplitude*Math.sin(phase);
        values.push({k,amplitude,phase,re,im});
        if(mode==='xy'&&k>0)values.push({k:-k,amplitude,phase:-phase,re,im:-im});
      }
      return values.sort((a,b)=>b.amplitude-a.amplitude);
    });
    if(p!==bytes.length)throw Error();
    const chains={x:mode==='xy'?groups[0]:[],y:mode==='xy'?groups[1]:[],complex:mode==='complex'?groups[0]:[]};
    const path=lifts.map((draw,i)=>{
      const t=i/samples,p=mode==='xy'?{x:evaluate(chains.x,t).x,y:evaluate(chains.y,t).x}:evaluate(chains.complex,t);
      return {...p,draw};
    });
    return {mode,chains,path,dimensions:{width,height},name,energy,guess:Boolean(options&1)};
  }catch{throw Error('分享链接无效或版本不受支持，请生成自己的画像。');}
}
