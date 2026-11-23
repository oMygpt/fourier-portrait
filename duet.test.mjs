import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSquare,standardize,spectrum,combine,matchTones,stretchTones,vignette,correlation,phaseDuet,duetCopy} from './duet.mjs';

const N=32;
// Two unrelated synthetic "sketches": a ring with a bar, and a cross with a corner block.
const ring=Float32Array.from({length:N*N},(_,i)=>{const x=i%N-12,y=Math.floor(i/N)-14,r=Math.hypot(x,y);return (r>6&&r<9)||(x>-3&&x<3&&y>12&&y<16)?1:0;});
const cross=Float32Array.from({length:N*N},(_,i)=>{const x=i%N,y=Math.floor(i/N);return (x>=18&&x<=21&&y>=4&&y<28)||(y>=9&&y<=11&&x>=8&&x<30)||(x<6&&y<6)?1:0;});

test('swapping a sketch with itself is the identity (after standardising)',()=>{
  const z=standardize(ring),F=spectrum(z,N),{values,leak}=combine(F,F,N);
  assert.ok(leak<1e-9);for(let i=0;i<z.length;i++)assert.ok(Math.abs(values[i]-z[i])<1e-9);
});

test('the swap is real-valued: Hermitian amplitude × Hermitian phase',()=>{
  const A=spectrum(standardize(ring),N),B=spectrum(standardize(cross),N);
  assert.ok(combine(A,B,N).leak<1e-9);assert.ok(combine(B,A,N).leak<1e-9);
  const r=phaseDuet({darkness:ring,width:N,height:N},{darkness:cross,width:N,height:N},{N,tones:'raw'});
  assert.ok(r.leak<1e-9);assert.ok(r.ab.every(Number.isFinite));
});

test('the result resembles the phase donor, not the amplitude donor',()=>{
  const r=phaseDuet({darkness:ring,width:N,height:N},{darkness:cross,width:N,height:N},{N,tones:'raw'});
  assert.ok(correlation(r.ab,r.b)>correlation(r.ab,r.a)+.2,'|A|+arg B looks like B');
  assert.ok(correlation(r.ba,r.a)>correlation(r.ba,r.b)+.2,'|B|+arg A looks like A');
  // ...and keeps the amplitude donor's spectrum magnitude exactly.
  const A=spectrum(standardize(ring),N),B=spectrum(standardize(cross),N),AB=spectrum(combine(A,B,N).values,N);
  for(let k=0;k<N*N;k++)assert.ok(Math.abs(Math.hypot(AB.re[k],AB.im[k])-Math.hypot(A.re[k],A.im[k]))<1e-8);
});

test('default tones read as a sketch: darkness in [0, 1], mostly paper',()=>{
  const r=phaseDuet({darkness:ring,width:N,height:N},{darkness:cross,width:N,height:N},{N});
  for(const v of [r.ab,r.ba]){assert.ok(v.every(x=>x>=0&&x<=1));assert.ok(v.filter(x=>x===0).length>=N*N*.5);}
  assert.ok(correlation(r.ab,r.b)>correlation(r.ab,r.a));
});

test('fitSquare keeps aspect, centres, and pads with paper',()=>{
  const tall=new Float32Array(8*16).fill(1),sq=fitSquare(tall,8,16,16);
  assert.equal(sq.length,256);
  for(let y=0;y<16;y++){assert.equal(sq[y*16],0);assert.equal(sq[y*16+15],0);assert.ok(Math.abs(sq[y*16+8]-1)<1e-12);}
  assert.equal(sq.filter(v=>v>.5).length,8*16);
  assert.throws(()=>fitSquare(tall,8,16,12),RangeError);assert.throws(()=>fitSquare(tall,8,15,16),RangeError);
});

test('tone helpers are monotone and bounded',()=>{
  const values=[3,-1,2,0,5,4],m=matchTones(values,[0,0,0,.5,.8,1]);
  assert.deepEqual([...m],[.5,0,0,0,1,.8].map(Math.fround));
  const s=stretchTones(values,{low:0,high:.99});assert.ok(s.every(v=>v>=0&&v<=1));assert.equal(s[4],1);assert.equal(s[1],0);
  const v=vignette(new Float32Array(N*N).fill(1),N);assert.equal(v[0],0);assert.ok(v[(N/2)*N+N/2]>.99);
});

test('card copy: each result is labelled by the face it resembles',()=>{
  const zh=duetCopy({sharer:'小周',visitor:'阿林',lang:'zh'});
  assert.deepEqual(zh.names,['小周','阿林']);
  assert.deepEqual(zh.left,['阿林的幅度 + 小周的相位','→ 像小周']);assert.deepEqual(zh.right,['小周的幅度 + 阿林的相位','→ 像阿林']);
  assert.equal(zh.headline,'相位才是你。');
  const anon=duetCopy({lang:'zh'});assert.deepEqual(anon.left,['我的幅度 + TA的相位','→ 像TA']);
  const en=duetCopy({lang:'en'});assert.deepEqual(en.right,['Their amplitude + my phase','→ looks like me']);
  assert.equal(duetCopy({sharer:'<b>x</b>',lang:'en'}).names[0],'bx/b');
});
