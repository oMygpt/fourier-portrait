import test from 'node:test';
import assert from 'node:assert/strict';
import {drawWarp,drawSpeed,DRAW_SECONDS,SLOW_UNTIL} from './pacing.mjs';

test('warp spans 0..1 and is monotonic',()=>{
  assert.equal(drawWarp(0),0);assert.equal(drawWarp(1),1);assert.equal(drawWarp(-1),0);assert.equal(drawWarp(2),1);assert.equal(drawWarp(NaN),0);
  let prev=0;for(let i=1;i<=1000;i++){const p=drawWarp(i/1000);assert.ok(p>prev,`strictly increasing at ${i}`);prev=p;}
});
test('slow opening, brisk middle, eased ending',()=>{
  const opening=drawWarp(SLOW_UNTIL);
  assert.ok(opening<.06&&opening>.02,`opening draws only a little (${opening})`);
  const mid=(drawWarp(.55)-drawWarp(.45))/.1,start=drawWarp(.05)/.05,end=(1-drawWarp(.98))/.02;
  assert.ok(mid>3*start,'middle is much faster than the opening');assert.ok(end<mid/2,'ending eases out');
  assert.ok(drawSpeed(.5)>drawSpeed(.1)&&drawSpeed(.99)<drawSpeed(.5));
});
test('total duration is about 12 seconds',()=>{assert.ok(DRAW_SECONDS>=10&&DRAW_SECONDS<=14);});
