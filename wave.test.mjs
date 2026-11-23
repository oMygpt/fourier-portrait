import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fft1,fft2,waveRadii,prepareWaves,prepareWavesAsync,waveState,blendLevels} from './wave.mjs';

const image=(w,h)=>Float32Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w);return Math.max(0,Math.min(1,.5+.4*Math.sin(x*.3)*Math.cos(y*.17)+((x*7+y*13)%11)/40-(x>w/2?.2:0)));});

test('FFT round-trips in 1D and 2D and rejects non-power-of-two lengths',()=>{
  const re=Float64Array.from({length:16},(_,i)=>Math.sin(i)+i/7),im=new Float64Array(16),copy=re.slice();
  fft1(re,im);fft1(re,im,true);assert.ok(re.every((v,i)=>Math.abs(v-copy[i])<1e-12));
  const N=8,r2=Float64Array.from({length:N*N},(_,i)=>(i*37%11)/11),i2=new Float64Array(N*N),c2=r2.slice();
  fft2(r2,i2,N);assert.ok(Math.abs(r2[0]-c2.reduce((a,v)=>a+v,0))<1e-9,'DC term is the sum');fft2(r2,i2,N,true);assert.ok(r2.every((v,i)=>Math.abs(v-c2[i])<1e-12));
  assert.throws(()=>fft1(new Float64Array(6),new Float64Array(6)),RangeError);
});

test('every frequency added rebuilds the sketch exactly; the ladder grows monotonically',()=>{
  for(const [w,h] of [[48,64],[30,17],[64,64]]){
    const d=image(w,h),waves=prepareWaves(d,w,h),last=waves.levels.at(-1);
    assert.ok(last.image.every((v,i)=>Math.abs(v-d[i])<1e-9),'exact at full spectrum');
    let N=1;while(N<Math.max(w,h))N*=2;assert.deepEqual(waves.levels.map(l=>l.radius),waveRadii(N));
    const counts=waves.levels.map(l=>l.waves);assert.ok(counts.every((c,i)=>!i||c>counts[i-1]));
    const err=l=>Math.sqrt(l.image.reduce((a,v,i)=>a+(v-d[i])**2,0)/d.length),errors=waves.levels.map(err);
    assert.ok(errors.every((e,i)=>!i||e<=errors[i-1]+1e-12),'error never grows as frequencies are added');
    assert.ok(waves.levels.slice(0,-1).every(l=>l.wave&&(l.wave.kx||l.wave.ky)),'each band names its strongest wave');
  }
  assert.throws(()=>prepareWaves(new Float32Array(3),2,2),RangeError);assert.throws(()=>prepareWaves(new Float32Array(600*600),600,600),RangeError);
});

test('state and blending: 0 is the lowest band, 1 is exactly the sketch; async yields the same result',async()=>{
  assert.deepEqual(waveState(0,5),{index:0,f:0});assert.deepEqual(waveState(1,5),{index:4,f:0});assert.equal(waveState(.5,5).index,2);assert.deepEqual(waveState(2,1),{index:0,f:0});
  const d=image(32,32),waves=prepareWaves(d,32,32),full=blendLevels(waves,1);
  assert.ok(full.image.every((v,i)=>Math.abs(v-d[i])<1e-9));assert.equal(full.level,waves.levels.at(-1));
  const mid=blendLevels(waves,.37).image;assert.ok(mid.some((v,i)=>Math.abs(v-d[i])>1e-3));
  const again=await prepareWavesAsync(d,32,32);assert.deepEqual(again.levels.map(l=>l.waves),waves.levels.map(l=>l.waves));
  const controller=new AbortController();controller.abort();await assert.rejects(prepareWavesAsync(d,32,32,{signal:controller.signal}),/Cancelled/);
});
