import {test} from 'node:test';
import assert from 'node:assert/strict';
import {videoPhase,videoDuration,ladderLevels,trimLadder,preferredVideoType,prepareVideo,drawVideoFrame,VIDEO_TIMELINE} from './video.mjs';
import {realDft} from './fourier.mjs';

test('video timeline: four acts in order, clamped at both ends',()=>{
  assert.equal(videoDuration(),18);assert.deepEqual(VIDEO_TIMELINE.map(([n])=>n),['draw','ladder','reveal','end']);
  assert.deepEqual(videoPhase(0),{name:'draw',progress:0});assert.equal(videoPhase(7.6).name,'ladder');assert.equal(videoPhase(12).name,'reveal');
  assert.deepEqual(videoPhase(99),{name:'end',progress:1});assert.equal(videoPhase(-1).progress,0);
});
test('frequency ladder doubles from 2 circles and always ends on the full count',()=>{
  assert.deepEqual(ladderLevels(567),[2,4,8,16,32,64,128,256,512,567]);assert.deepEqual(ladderLevels(1),[1]);assert.deepEqual(ladderLevels(2),[2]);
  assert.throws(()=>ladderLevels(0),RangeError);
  assert.deepEqual(trimLadder([{n:2,energy:.3},{n:4,energy:.9995},{n:8,energy:1}]).map(r=>r.n),[2,8]);
});
test('prepared ladder energy is monotone and reaches 100%; MP4 is preferred over WebM',()=>{
  const n=240,path=Array.from({length:n},(_,i)=>({x:80*Math.cos(2*Math.PI*i/n)+9*Math.sin(10*Math.PI*i/n),y:110*Math.sin(2*Math.PI*i/n),draw:i%30>2}));
  const prep=prepareVideo({mode:'xy',chains:{x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:[]},path,dimensions:{width:200,height:260}});
  const energy=prep.ladder.map(r=>r.energy);assert.ok(energy.every((e,i)=>!i||e>=energy[i-1]-1e-12));assert.ok(Math.abs(energy.at(-1)-1)<1e-9);
  assert.equal(preferredVideoType(t=>t.startsWith('video/mp4')),'video/mp4;codecs=avc1.42E01F');assert.equal(preferredVideoType(t=>t==='video/webm'),'video/webm');assert.equal(preferredVideoType(()=>false),'');
  assert.throws(()=>prepareVideo({mode:'xy',chains:{x:[],y:[],complex:[]},path:[],dimensions:{width:1,height:1}}),RangeError);
});

// A recording 2D context: every frame of every act must render without throwing.
function mockContext(){
  const calls={text:[]},noop=()=>{};
  return {calls,ctx:new Proxy({measureText:t=>({width:String(t).length*10}),fillText:t=>calls.text.push(String(t))},{get:(o,k)=>k in o?o[k]:noop,set:()=>true})};
}
test('every act of the video renders, shows the real formula, and hides the name in guessing mode',()=>{
  const n=240,path=Array.from({length:n},(_,i)=>({x:80*Math.cos(2*Math.PI*i/n)+9*Math.sin(10*Math.PI*i/n),y:110*Math.sin(2*Math.PI*i/n),draw:i%30>2}));
  const chains={x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:[]};
  for(const guess of [false,true]){
    const {ctx,calls}=mockContext(),prep=prepareVideo({mode:'xy',chains,path,dimensions:{width:200,height:260},name:'阿尔伯特',guess,hint:'物理学家'});
    for(let time=0;time<=videoDuration();time+=.25)drawVideoFrame(ctx,prep,time);
    const text=calls.text.join('\n');
    assert.match(text,/x\(t\) = 80 cos\(2πt\)/);assert.match(text,/保留/);
    assert.equal(text.includes('阿尔伯特'),!guess);if(guess)assert.match(text,/提示：物理学家/);
  }
});
