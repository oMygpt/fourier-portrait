import {test} from 'node:test';
import assert from 'node:assert/strict';
import {riddleLevels,riddleState,recognisedAt,scoreText,scoreCopy,prepareRiddle,RIDDLE_STEP,RIDDLE_HOLD} from './riddle.mjs';
import {realDft} from './fourier.mjs';

test('riddle rungs double from 2 and end on the creator count',()=>{
  assert.deepEqual(riddleLevels(567),[2,4,8,16,32,64,128,256,512,567]);assert.deepEqual(riddleLevels(3),[2,3]);assert.throws(()=>riddleLevels(0),RangeError);
});
test('riddle state steps, morphs near the end of each rung, and finishes after a hold on the last',()=>{
  assert.deepEqual(riddleState(0,4),{index:0,morph:0,done:false});
  assert.equal(riddleState(RIDDLE_STEP*1.2,4).index,1);assert.equal(riddleState(RIDDLE_STEP*1.2,4).morph,0);assert.ok(riddleState(RIDDLE_STEP*1.9,4).morph>0);
  const end=3*RIDDLE_STEP;assert.equal(riddleState(end+.1,4).index,3);assert.equal(riddleState(end+.1,4).morph,0);assert.equal(riddleState(end+RIDDLE_HOLD,4).done,true);
  const rungs=[{n:2},{n:4},{n:8}];assert.equal(recognisedAt(rungs,{index:0,morph:.2}),2);assert.equal(recognisedAt(rungs,{index:0,morph:.8}),4);assert.equal(recognisedAt(rungs,{index:2,morph:0}),8);
});
test('score copy never names the person and handles giving up',()=>{
  assert.equal(scoreText(32,567),'你只用了 32 个圆（全部的 6%）就认出了 TA。');assert.match(scoreText(null,567,'en'),/all 567 circles/);
  const c=scoreCopy(32,567,'zh');assert.equal(c.title,'我用 32 个圆认出了 TA');assert.match(c.challenge,/扫码挑战/);assert.equal(scoreCopy(null,9).title,'这一题，我没猜出来');
});
test('prepared rungs share one sampling so they can morph point by point',()=>{
  const n=200,path=Array.from({length:n},(_,i)=>({x:50*Math.cos(2*Math.PI*i/n)+6*Math.cos(12*Math.PI*i/n),y:70*Math.sin(2*Math.PI*i/n),draw:i%25>1}));
  const r=prepareRiddle('xy',{x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:[]},path,800);
  assert.equal(r.total,400);assert.ok(r.rungs.every(g=>g.points.length===801));assert.equal(r.rungs.at(-1).n,400);
});
