export const SKETCH_API_BASE='https://fourier-portrait-share.colab2023.workers.dev';
export const MAX_SKETCH_BYTES=250*1024;
const aad=new TextEncoder().encode('fourier-portrait-sketch-v1');
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function binary(value,size){
  if(typeof value!=='string'||!/^[\w-]+$/.test(value))throw new RangeError('Invalid sketch reference');
  const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  if(bytes.length!==size||base64(bytes)!==value)throw new RangeError('Invalid sketch reference');return bytes;
}
export function packSketchReference(reference){
  if(reference==null)return new Uint8Array();
  return Uint8Array.from([69,1,48,0,...binary(reference.id,16),...binary(reference.key,32)]);
}
export function unpackSketchReference(bytes){
  if(bytes.length!==52||bytes[0]!==69||bytes[1]!==1||bytes[2]!==48||bytes[3]!==0)throw new RangeError('Invalid sketch section');
  return {id:base64(bytes.subarray(4,20)),key:base64(bytes.subarray(20))};
}
export async function encryptSketch(bytes,type){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_SKETCH_BYTES||!['image/webp','image/jpeg'].includes(type))throw new RangeError('Invalid sketch image');
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),plain=Uint8Array.from([type==='image/webp'?0:1,...bytes]);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,plain);
  return {ciphertext:Uint8Array.from([1,...iv,...new Uint8Array(cipher)]),key:base64(new Uint8Array(await crypto.subtle.exportKey('raw',key)))};
}
export async function decryptSketch(bytes,keyString){
  if(!(bytes instanceof Uint8Array)||bytes.length<31||bytes.length>MAX_SKETCH_BYTES+30||bytes[0]!==1)throw new RangeError('Invalid encrypted sketch');
  const key=await crypto.subtle.importKey('raw',binary(keyString,32),'AES-GCM',false,['decrypt']),plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(1,13),additionalData:aad,tagLength:128},key,bytes.subarray(13)));
  if(plain[0]>1||plain.length<2)throw new RangeError('Invalid decrypted sketch');
  return new Blob([plain.subarray(1)],{type:plain[0]===0?'image/webp':'image/jpeg'});
}
async function imageBlob(source){
  if(!source||!source.width||!source.height)throw new Error('Sketch unavailable');
  const c=document.createElement('canvas'),scale=Math.min(1,768/Math.max(source.width,source.height));c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);
  for(const quality of [.9,.8,.65]){let blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',quality));if(!blob||blob.type!=='image/webp')blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size&&blob.size<=MAX_SKETCH_BYTES)return blob;}
  throw new Error('Sketch image too large');
}
export async function publishSketch(source,{signal}={}){
  const blob=await imageBlob(source),encrypted=await encryptSketch(new Uint8Array(await blob.arrayBuffer()),blob.type);
  const response=await fetch(SKETCH_API_BASE+'/s',{method:'POST',body:new Blob([encrypted.ciphertext],{type:'application/octet-stream'}),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])])});
  if(response.status!==201)throw new Error('Sketch upload unavailable');
  const {id}=await response.json(),reference={id,key:encrypted.key};packSketchReference(reference);return reference;
}
export async function fetchSketch(reference,{signal}={}){
  packSketchReference(reference);
  const response=await fetch(SKETCH_API_BASE+'/s/'+reference.id,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])])});
  if(response.status!==200||Number(response.headers.get('Content-Length'))>MAX_SKETCH_BYTES+30)throw new Error('Sketch unavailable or expired');
  return decryptSketch(new Uint8Array(await response.arrayBuffer()),reference.key);
}
