let worker=null,sequence=0;
const pending=new Map();

export function cancelLineArt(){
  worker?.terminate();worker=null;
  for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('已切换经典算法'));}pending.clear();
}

export async function modelLineArt(image,style,onProgress){
  if(!globalThis.Worker||!globalThis.createImageBitmap)throw Error('当前设备不支持模型描线');
  const bitmap=await createImageBitmap(image),id=++sequence;
  if(!worker){
    worker=new Worker(new URL('./ml-worker.js',import.meta.url));
    worker.onmessage=({data})=>{
      const request=pending.get(data.id);if(!request)return;
      if(data.gray||data.error){clearTimeout(request.timer);pending.delete(data.id);data.error?request.reject(Error(data.error)):request.resolve(data);}
      else request.onProgress(data);
    };
    worker.onerror=event=>{event.preventDefault();cancelLineArt();};
  }
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(cancelLineArt,30000);
    pending.set(id,{resolve,reject,onProgress,timer});worker.postMessage({id,bitmap,style},[bitmap]);
  });
}
