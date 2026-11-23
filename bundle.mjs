// High-fidelity shares: the QR carries only a short pointer (#s…) to an end-to-end encrypted bundle.
// Bundle metadata = full-precision Fourier chains + pen lifts + dimensions (no photo, no quantization).
// Pointer = object id + AES key + per-card display options (counts, name, guess, palette).
import {deflateSync,inflateSync} from './vendor/fflate/fflate.mjs';
import {evaluate} from './fourier.mjs';
import {bytesToDecimal,decimalToBytes,cleanName,cleanHint,shareQrBits,SHARE_BASE} from './share.mjs';
import {packSketchReference,unpackSketchReference} from './encrypted-sketch.mjs';
import {PALETTE_IDS,normalizePalette} from './palettes.mjs';

const MAX_SAMPLES=4096,MAX_SIDE=1024;

function chainsFor(mode,chains){
  if(mode!=='xy'&&mode!=='complex')throw new RangeError('Invalid portrait mode');
  return mode==='xy'?[chains.x,chains.y]:[chains.complex,[]];
}

export function packPortraitMeta({mode,chains,path,dimensions}){
  const samples=path?.length,groups=chainsFor(mode,chains);
  if(!Number.isInteger(samples)||samples<2||samples>MAX_SAMPLES)throw new RangeError('Invalid portrait path');
  const {width,height}=dimensions||{};
  if(![width,height].every(v=>Number.isInteger(v)&&v>=4&&v<=MAX_SIDE))throw new RangeError('Invalid portrait dimensions');
  if(groups.some(g=>!Array.isArray(g)||g.length>MAX_SAMPLES))throw new RangeError('Invalid portrait chains');
  const mask=Math.ceil(samples/8),bytes=new Uint8Array(11+mask+10*(groups[0].length+groups[1].length)),view=new DataView(bytes.buffer);let p=0;
  view.setUint8(p++,mode==='xy'?0:1);for(const v of [samples,width,height,groups[0].length,groups[1].length]){view.setUint16(p,v,true);p+=2;}
  for(let i=0;i<samples;i++)if(path[i].draw)bytes[p+(i>>3)]|=1<<(i%8);p+=mask;
  for(const group of groups)for(const c of group){
    if(!Number.isInteger(c.k)||Math.abs(c.k)>samples/2||!Number.isFinite(c.re)||!Number.isFinite(c.im))throw new RangeError('Invalid coefficient');
    view.setInt16(p,c.k,true);view.setFloat32(p+2,c.re,true);view.setFloat32(p+6,c.im,true);p+=10;
  }
  return deflateSync(bytes,{level:9});
}

export function unpackPortraitMeta(compressed){
  if(!(compressed instanceof Uint8Array)||compressed.length>1<<20)throw new RangeError('Invalid portrait bundle');
  const bytes=inflateSync(compressed,{out:new Uint8Array(11+MAX_SAMPLES/8+20*MAX_SAMPLES+1)}),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<11)throw new RangeError('Invalid portrait bundle');
  const flag=view.getUint8(0),[samples,width,height,a,b]=[1,3,5,7,9].map(o=>view.getUint16(o,true)),mask=Math.ceil(samples/8);
  if(flag>1||samples<2||samples>MAX_SAMPLES||width<4||height<4||width>MAX_SIDE||height>MAX_SIDE||a>MAX_SAMPLES||b>MAX_SAMPLES||flag===1&&b||bytes.length!==11+mask+10*(a+b))throw new RangeError('Invalid portrait bundle');
  const mode=flag?'complex':'xy',lifts=Array.from({length:samples},(_,i)=>Boolean(bytes[11+(i>>3)]&(1<<(i%8))));let p=11+mask;
  const groups=[a,b].map(count=>Array.from({length:count},()=>{
    const k=view.getInt16(p,true),re=view.getFloat32(p+2,true),im=view.getFloat32(p+6,true);p+=10;
    if(Math.abs(k)>samples/2||!Number.isFinite(re)||!Number.isFinite(im))throw new RangeError('Invalid coefficient');
    return {k,re,im,amplitude:Math.hypot(re,im),phase:Math.atan2(im,re)};
  }).sort((x,y)=>y.amplitude-x.amplitude));
  const chains={x:mode==='xy'?groups[0]:[],y:mode==='xy'?groups[1]:[],complex:mode==='complex'?groups[0]:[]};
  const path=lifts.map((draw,i)=>{const t=i/samples,q=mode==='xy'?{x:evaluate(chains.x,t).x,y:evaluate(chains.y,t).x}:evaluate(chains.complex,t);return {...q,draw};});
  return {mode,chains,path,dimensions:{width,height}};
}

// Pointer v2: 83 'S', 2, options (bit0 guess, bits1-2 palette), u16 count A, u16 count B,
// name length, name, hint length, hint, id(16), key(32). v1 (no hint field) is still decoded.
export function encodePointer({reference,counts=[0,0],name='',guess=false,hint='',palette='ink'},base=SHARE_BASE){
  const title=new TextEncoder().encode(cleanName(name)),clue=guess?new TextEncoder().encode(cleanHint(hint)):new Uint8Array(),ref=packSketchReference(reference).subarray(4);
  if(ref.length!==48)throw new RangeError('Missing bundle reference');
  if(counts.length!==2||counts.some(c=>!Number.isInteger(c)||c<0||c>MAX_SAMPLES))throw new RangeError('Invalid circle counts');
  const bytes=Uint8Array.from([83,2,(guess?1:0)|(PALETTE_IDS.indexOf(normalizePalette(palette))<<1),counts[0]&255,counts[0]>>8,counts[1]&255,counts[1]>>8,title.length,...title,clue.length,...clue,...ref]);
  const url=base.split('#')[0]+'#s'+bytesToDecimal(bytes);
  return {url,bytes:bytes.length,qrBits:shareQrBits(url)};
}

export function decodePointer(fragment){
  const hash=fragment.includes('#')?fragment.slice(fragment.indexOf('#')):fragment;
  if(!hash.startsWith('#s'))throw new RangeError('Not a bundle pointer');
  const bytes=decimalToBytes(hash.slice(2)),version=bytes[1];
  if(bytes.length<56||bytes[0]!==83||(version!==1&&version!==2)||bytes[2]>5)throw new RangeError('Invalid bundle pointer');
  const nameEnd=8+bytes[7],hintLength=version===2?bytes[nameEnd]:0,refStart=nameEnd+(version===2?1+hintLength:0);
  if(refStart>=bytes.length||bytes.length!==refStart+48)throw new RangeError('Invalid bundle pointer');
  const counts=[bytes[3]+256*bytes[4],bytes[5]+256*bytes[6]];
  if(counts.some(c=>c>MAX_SAMPLES))throw new RangeError('Invalid bundle pointer');
  const decode=part=>new TextDecoder().decode(part),name=cleanName(decode(bytes.subarray(8,nameEnd))),guess=Boolean(bytes[2]&1);
  const hint=guess&&hintLength?cleanHint(decode(bytes.subarray(nameEnd+1,nameEnd+1+hintLength))):'';
  const reference=unpackSketchReference(Uint8Array.from([69,1,48,0,...bytes.subarray(refStart)]));
  return {reference,counts,name,guess,hint,palette:PALETTE_IDS[bytes[2]>>1]??'ink'};
}
