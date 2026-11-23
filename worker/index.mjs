export const MAX_BYTES=1024*1024,RETENTION_MS=30*24*60*60*1000;
const validId=id=>/^[A-Za-z0-9_-]{22}$/.test(id);
const validSecret=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
// Production site (same origin via the fourier.jupyter.pro/api/* route), the legacy GitHub Pages site and local development.
const allowed=origin=>origin==='https://fourier.jupyter.pro'||origin==='https://omygpt.github.io'||/^http:\/\/localhost(?::\d+)?$/.test(origin);
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const randomId=()=>base64url(crypto.getRandomValues(new Uint8Array(16)));
export const hashDeleteToken=async token=>base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
function sameSecret(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    // Same-origin GETs carry no Origin header; reading ciphertext by an unguessable id needs no origin check.
    // Writes (POST/DELETE) always carry Origin in browsers and must come from the site.
    const read=request.method==='GET'&&!origin;
    if(!read&&!allowed(origin))return new Response(null,{status:403,headers});
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    const reply=(status,data=null)=>new Response(data===null?null:JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Delete-Hash, X-Delete-Token','Access-Control-Max-Age':'86400'}});
    const path=new URL(request.url).pathname.replace(/^\/api(?=\/)/,'');
    try{
      if(path==='/s'&&request.method==='POST'){
        const raw=request.headers.get('Content-Length'),deleteHash=request.headers.get('X-Delete-Hash');
        if(raw===null)return reply(411);
        if(!/^[1-9]\d*$/.test(raw)||deleteHash!==null&&!validSecret(deleteHash))return reply(400);
        const length=Number(raw);
        if(!Number.isSafeInteger(length)||length>MAX_BYTES)return reply(413);
        if(!request.body)return reply(400);
        const reader=request.body.getReader(),chunks=[];let size=0;
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>length||size>MAX_BYTES){await reader.cancel();return reply(413);}chunks.push(value);}
        if(size!==length)return reply(400);
        const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
        const id=randomId();await env.SKETCHES.put(id,bytes,{httpMetadata:{contentType:'application/octet-stream'},...(deleteHash?{customMetadata:{d:deleteHash}}:{})});
        return reply(201,{id});
      }
      if(path.startsWith('/s/')&&request.method==='GET'){
        const id=path.slice(3);if(!validId(id))return reply(400);
        const object=await env.SKETCHES.get(id);
        if(!object)return reply(204);
        if(Date.now()-object.uploaded.getTime()>=RETENTION_MS){await object.body.cancel();return reply(204);}
        return new Response(object.body,{headers:{...headers,'Content-Type':'application/octet-stream'}});
      }
      if(path.startsWith('/s/')&&request.method==='DELETE'){
        const id=path.slice(3),token=request.headers.get('X-Delete-Token');
        if(!validId(id)||!validSecret(token))return reply(400);
        const object=await env.SKETCHES.head(id);
        if(!object)return reply(204);
        if(!sameSecret(object.customMetadata?.d,await hashDeleteToken(token)))return reply(403);
        await env.SKETCHES.delete(id);
        return reply(204);
      }
      return reply(404);
    }catch{return reply(503);}
  }
};
