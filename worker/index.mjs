export const MAX_BYTES=1024*1024,RETENTION_MS=30*24*60*60*1000;
const validId=id=>/^[A-Za-z0-9_-]{22}$/.test(id);
const allowed=origin=>origin==='https://omygpt.github.io'||/^http:\/\/localhost(?::\d+)?$/.test(origin);
const randomId=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(!allowed(origin))return new Response(null,{status:403,headers});
    headers['Access-Control-Allow-Origin']=origin;
    const reply=(status,data=null)=>new Response(data===null?null:JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'}});
    const path=new URL(request.url).pathname;
    try{
      if(path==='/s'&&request.method==='POST'){
        const raw=request.headers.get('Content-Length');
        if(raw===null)return reply(411);
        if(!/^[1-9]\d*$/.test(raw))return reply(400);
        const length=Number(raw);
        if(!Number.isSafeInteger(length)||length>MAX_BYTES)return reply(413);
        if(!request.body)return reply(400);
        const reader=request.body.getReader(),chunks=[];let size=0;
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>length||size>MAX_BYTES){await reader.cancel();return reply(413);}chunks.push(value);}
        if(size!==length)return reply(400);
        const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
        const id=randomId();await env.SKETCHES.put(id,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
        return reply(201,{id});
      }
      if(path.startsWith('/s/')&&request.method==='GET'){
        const id=path.slice(3);if(!validId(id))return reply(400);
        const object=await env.SKETCHES.get(id);
        if(!object)return reply(204);
        if(Date.now()-object.uploaded.getTime()>=RETENTION_MS){await object.body.cancel();return reply(204);}
        return new Response(object.body,{headers:{...headers,'Content-Type':'application/octet-stream'}});
      }
      return reply(404);
    }catch{return reply(503);}
  }
};
