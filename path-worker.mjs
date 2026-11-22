import {analyzeSketch} from './path.mjs';
self.onmessage=({data:{binary,width,height,minLength,portrait}})=>{
  try{self.postMessage({result:analyzeSketch(binary,width,height,minLength,portrait)});}
  catch(error){self.postMessage({error:error.message});}
};
