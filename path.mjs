import {vectorize,joinStrokes,resampleClosed} from './lineart.mjs';
import {dft,realDft,axisEnvelope} from './fourier.mjs';
import {selectTerms} from './portrait.mjs';
import {consolidatePortrait} from './strokes.mjs';

export function analyzeSketch(binary,width,height,minLength,portrait=false,face=null,landmarks=[]){
  if(width<1||height<1||binary.length!==width*height)throw new RangeError('Invalid sketch dimensions');
  const strokes=portrait&&face?consolidatePortrait(binary,width,height,minLength,face,landmarks):vectorize(binary,width,height,portrait?Math.min(3,minLength):minLength).filter(stroke=>{
    if(!portrait)return true;
    const center=stroke.reduce((p,q)=>({x:p.x+q.x/stroke.length,y:p.y+q.y/stroke.length}),{x:0,y:0});
    const central=((center.x/width-.5)/.28)**2+((center.y/height-.3)/.25)**2<1;
    const length=stroke.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-stroke[i].x,p.y-stroke[i].y),0);
    return length>=minLength*(central?.35:1.35);
  }),ordered=joinStrokes(strokes),sampled=resampleClosed(ordered,1800);
  if(strokes.length<2||sampled.length<8)throw Error('未找到足够线条。请换一张对比清晰的照片，或提高轮廓细节。');
  const path=sampled.map(p=>({...p,x:p.x-width/2,y:p.y-height/2})),coefficients=dft(path),x=realDft(path.map(p=>p.x)),y=realDft(path.map(p=>p.y)),scale=590/Math.max(width,height);
  const automatic={complex:selectTerms(coefficients,path,scale),x:selectTerms(x,path,scale,'x'),y:selectTerms(y,path,scale,'y')};
  const bounds={x:axisEnvelope(x.slice(0,automatic.x.count)),y:axisEnvelope(y.slice(0,automatic.y.count))};
  return {strokes,path,coefficients,x,y,automatic,bounds};
}
