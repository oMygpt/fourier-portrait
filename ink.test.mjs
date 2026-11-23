import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inkWidth,inkProfile,drawInk} from './ink.mjs';

test('strokes taper at both ends and stay bounded and deterministic',()=>{
  for(const index of [0,1,7,42])for(const length of [8,60,400]){
    const ends=[inkWidth(0,length,index),inkWidth(1,length,index)],middle=inkWidth(.5,length,index);
    assert.ok(ends.every(w=>w<.32),`ends ${ends}`);assert.ok(middle>.7&&middle<1.4,`middle ${middle}`);
    for(let s=0;s<=1;s+=.05){const w=inkWidth(s,length,index);assert.ok(w>0&&w<1.4);assert.equal(w,inkWidth(s,length,index));}
  }
  assert.notEqual(inkWidth(.5,100,1),inkWidth(.5,100,2),'strokes differ in pressure');
  assert.throws(()=>inkWidth(1.5,10),RangeError);
});

test('profile is computed per stroke between pen lifts',()=>{
  const line=(x0,n,draw=true)=>Array.from({length:n},(_,i)=>({x:x0+i,y:0,draw}));
  const points=[{x:0,y:0,draw:false},...line(1,10),{x:20,y:0,draw:false},...line(21,30)],profile=inkProfile(points);
  assert.equal(profile.length,points.length);
  assert.ok(profile[0]<.32&&profile[10]<.32,'first stroke tapers at both ends');assert.ok(profile[5]>.6);
  assert.ok(profile[11]<.32&&profile[41]<.32,'second stroke starts again from a thin end');assert.ok(profile[26]>.6);
});

test('incremental drawing equals one full pass and skips pen travel',()=>{
  const points=Array.from({length:40},(_,i)=>({x:i,y:Math.sin(i),draw:i%13!==0})),profile=inkProfile(points),record=()=>{const segs=[];return {segs,ctx:{save(){},restore(){},beginPath(){},moveTo(x,y){this.a=[x,y];},lineTo(x,y){segs.push([...this.a,x,y,this.lineWidth]);},stroke(){}}};};
  const full=record();drawInk(full.ctx,points,profile,p=>p,{width:2});
  const parts=record();for(const [from,to] of [[1,9],[9,25],[25,40]])drawInk(parts.ctx,points,profile,p=>p,{width:2,from,to});
  assert.deepEqual(parts.segs,full.segs);assert.equal(full.segs.length,points.filter((p,i)=>i&&p.draw).length);
  assert.ok(full.segs.every(s=>s[4]>=.35&&s[4]<=2.8));
});
