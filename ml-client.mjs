// Stall timeout, not a total budget: slow networks may need minutes to fetch ~68 MB of models,
// so the clock restarts on every progress message and only fires after this long without any.
export const STALL_MS=90000;
let worker=null,sequence=0;
function arm(request){clearTimeout(request.timer);request.timer=setTimeout(cancelLineArt,STALL_MS);}
const pending=new Map();

export function cancelLineArt(onlyPending=false){
  if(onlyPending&&!pending.size)return;
  worker?.terminate();worker=null;
  for(const request of pending.values()){clearTimeout(request.timer);if(request.resolved)request.onSketch({sketchFallback:true});else request.reject(Error('已切换经典算法'));}pending.clear();
}

export async function modelLineArt(image,style,onProgress,onSketch=()=>{}){
  if(!globalThis.Worker||!globalThis.createImageBitmap)throw Error('当前设备不支持模型描线');
  const bitmap=await createImageBitmap(image),id=++sequence;
  if(!worker){
    worker=new Worker(new URL('./ml-worker.js',import.meta.url));
    worker.onmessage=({data})=>{
      const request=pending.get(data.id);if(!request)return;
      if(data.sketch||data.sketchFallback){clearTimeout(request.timer);pending.delete(data.id);request.onSketch(data);}
      else if(data.gray){request.resolved=true;request.resolve(data);if(!data.sketchPending){clearTimeout(request.timer);pending.delete(data.id);}else arm(request);}
      else if(data.error){clearTimeout(request.timer);pending.delete(data.id);if(request.resolved)request.onSketch({sketchFallback:true});else request.reject(Error(data.error));}
      else{arm(request);request.onProgress({...data,sketchProgress:request.resolved});}
    };
    worker.onerror=event=>{event.preventDefault();cancelLineArt();};
  }
  return new Promise((resolve,reject)=>{
    const request={resolve,reject,onProgress,onSketch,timer:null,resolved:false};arm(request);
    pending.set(id,request);worker.postMessage({id,bitmap,style},[bitmap]);
  });
}
