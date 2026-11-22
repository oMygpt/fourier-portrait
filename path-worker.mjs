import {analyzeSketch} from './path.mjs';
self.onmessage=({data:{binary,width,height,minLength,portrait,face,landmarks}})=>{
  try{self.postMessage({result:analyzeSketch(binary,width,height,minLength,portrait,face,landmarks)});}
  catch(error){self.postMessage({error:error.message});}
};
