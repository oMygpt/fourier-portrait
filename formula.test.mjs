import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalFormula,evaluateFormula,axisTerms,frequencyLadder,energyShare,formulaLatex,formulaLines,formulaSummary,latexDocument,expressionParts} from './formula.mjs';
import {realDft,dft,evaluate} from './fourier.mjs';
import {limitChains,formulaBody} from './portrait.mjs';
import {cardCopy} from './card.mjs';
import {encodePortrait,decodePortrait} from './share.mjs';

const portrait=(n=180)=>{const path=Array.from({length:n},(_,i)=>({x:70*Math.cos(2*Math.PI*i/n)+11*Math.sin(10*Math.PI*i/n)+4,y:95*Math.sin(2*Math.PI*i/n)-7*Math.cos(6*Math.PI*i/n),draw:i%20>1}));
  return {path,chains:{x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)}};};

test('the canonical cosine form reproduces exactly what the circles draw, for any subset of circles',()=>{
  const {chains}=portrait();
  for(const count of [1,2,7,40,360]){
    const xy=limitChains('xy',chains,count),f=canonicalFormula('xy',xy);
    for(let i=0;i<50;i++){const t=i/50,p=evaluateFormula(f,t);assert.ok(Math.abs(p.x-evaluate(xy.x,t).x)<1e-9);assert.ok(Math.abs(p.y-evaluate(xy.y,t).x)<1e-9);}
    assert.equal(f.circles,count);
  }
  const z=canonicalFormula('complex',{complex:chains.complex.slice(0,30)});
  for(let i=0;i<20;i++){const a=evaluateFormula(z,i/20),b=evaluate(chains.complex.slice(0,30),i/20);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-9);}
});

test('conjugate circles merge into one term; a lone circle of a pair still counts',()=>{
  const terms=axisTerms([{k:3,amplitude:2,phase:.5},{k:-3,amplitude:2,phase:-.5},{k:4,amplitude:1,phase:0}]);
  assert.deepEqual(terms.map(t=>[t.k,t.circles,Number(t.amplitude.toFixed(9))]),[[3,2,4],[4,1,1]]);
  assert.throws(()=>axisTerms([{k:1,amplitude:-1,phase:0}]),RangeError);
});

test('one formatter: page (KaTeX), LaTeX file and card print identical numbers',()=>{
  const {chains}=portrait(),xy={x:chains.x.slice(0,9),y:chains.y.slice(0,9)},f=canonicalFormula('xy',xy);
  const card=cardCopy({mode:'xy',chains:xy,lang:'zh'}),page=formulaBody('xy',xy,2,'zh'),doc=latexDocument(f,'zh'),lines=formulaLines(f,2);
  const numbers=text=>(text.match(/\d+(\.\d+)?/g)||[]).slice(0,5);
  assert.deepEqual(numbers(card.equations[0].text),numbers(lines[0].text));
  assert.deepEqual(numbers(page.split('\\\\')[0]),numbers(lines[0].text.replaceAll('π','\\pi')));
  for(const part of expressionParts(f.axes[0].terms,{latex:true}).slice(0,3))assert.ok(doc.includes(part.replace(/^[+-] /,'')));
  let depth=0;for(const c of doc+formulaLatex(f)){if(c==='{')depth++;if(c==='}')depth--;assert.ok(depth>=0);}assert.equal(depth,0);
  assert.match(formulaSummary(f,'zh'),/^9|18 个旋转的圆/);assert.match(formulaSummary(f,'en'),/rotating circles/);
});

test('the formula printed from a shared link is the formula that link draws',()=>{
  const {path,chains}=portrait(),url=encodePortrait({mode:'xy',chains,path,dimensions:{width:160,height:220}}).url,shared=decodePortrait(url);
  const f=canonicalFormula('xy',shared.chains);
  for(let i=0;i<shared.path.length;i+=17){const p=evaluateFormula(f,i/shared.path.length);assert.ok(Math.abs(p.x-shared.path[i].x)<1e-9&&Math.abs(p.y-shared.path[i].y)<1e-9);}
});

test('frequency ladder and energy share',()=>{
  assert.deepEqual(frequencyLadder(40),[2,4,8,16,32,40]);assert.throws(()=>frequencyLadder(0),RangeError);
  const {chains}=portrait();assert.equal(energyShare(chains.x,chains.x),1);assert.ok(energyShare(chains.x.slice(0,3),chains.x)<1);assert.equal(energyShare([],[]),1);
});

import {formulaCardCopy} from './card.mjs';
test('formula card copy: one title, one summary, and an honest note about what the QR holds',()=>{
  const f=canonicalFormula('xy',{x:[{k:1,amplitude:2,phase:0},{k:-1,amplitude:2,phase:0}],y:[{k:2,amplitude:1,phase:0}]});
  const hd=formulaCardCopy({formula:f,lang:'zh'}),long=formulaCardCopy({formula:f,lang:'zh',selfContained:true});
  assert.equal(hd.title,'这是我的公式。');assert.equal(hd.subtitle,'它能复原我的样子。');assert.equal(hd.summary,'3 个旋转的圆 · x 1 / y 1 项');
  assert.match(hd.note,/端到端加密/);assert.match(long.note,/二维码里就是这串公式/);
  assert.equal(formulaCardCopy({formula:f,name:'Ada',lang:'en'}).title,"Ada's formula.");
});

import {persona,personaStats,CIRCLE_TIERS,LEAD_TIERS} from './persona.mjs';
import {residueLinks,SILHOUETTE_CIRCLES} from './card.mjs';
import {fourierPortrait} from './samples/fourier-formula.mjs';
// n equal circles on x (plus a DC term, which never counts toward the lead circles).
const flat=n=>({x:[{k:0,amplitude:50,phase:0},...Array.from({length:n},(_,i)=>({k:(i>>1)+1,amplitude:1,phase:0}))],y:[]});
const pad=(chains,total)=>({...chains,y:Array.from({length:total-chains.x.length},(_,i)=>({k:1000+i,amplitude:1e-6,phase:0}))});
test('persona: counts circles like the card, and the lead circles that hold 85% of the energy',()=>{
  assert.deepEqual(personaStats('xy',flat(20)),{circles:21,lead:17});
  assert.equal(personaStats('xy',{x:[{k:1,amplitude:10,phase:0},{k:2,amplitude:.1,phase:0}],y:[]}).lead,1);
  assert.equal(personaStats('complex',{complex:[{k:1,amplitude:3,phase:0},{k:-1,amplitude:4,phase:0}]}).lead,2);
  assert.deepEqual(personaStats('xy',{x:[],y:[]}),{circles:0,lead:0});
  assert.match(persona('xy',{x:[],y:[]},'zh'),/0 个圆/);
});
test('persona: tiers calibrated on the samples, bilingual, deterministic, never about likeness',()=>{
  // samples: gauss 293 | euler 456 | einstein 611 circles; curie 12 | euler 18 | fourier 28 lead circles
  assert.deepEqual(CIRCLE_TIERS,[400,520]);assert.deepEqual(LEAD_TIERS,[14,22]);
  const few=persona('xy',pad(flat(12),293),'zh'),mid=persona('xy',pad(flat(20),456),'zh'),many=persona('xy',pad(flat(33),611),'zh');
  assert.match(few,/^293 个圆——极简派.*；前 11 个圆就拿下 85% 的能量/);
  assert.match(mid,/^456 个圆——细节不少.*；前 18 个圆拿下 85% 的能量，分工明确。$/);
  assert.match(many,/^611 个圆——大概是头发太有主见；要 29 个主圆才凑齐 85% 的能量/);
  assert.match(persona('xy',pad(flat(12),293),'en'),/^293 circles: a minimalist.*the top 11 already hold 85% of the energy\.$/);
  assert.equal(persona('xy',flat(20),'en'),persona('xy',structuredClone(flat(20)),'en'));
  for(const line of [few,mid,many])assert.doesNotMatch(line,/神韵|像|美|丑|对称/);
});
test('cards: 8-circle silhouette, real epicycle residue, Fourier’s own formula',()=>{
  assert.equal(SILHOUETTE_CIRCLES,8);
  const values=[{k:0,amplitude:9,phase:0},{k:1,amplitude:3,phase:0},{k:-1,amplitude:3,phase:0},{k:2,amplitude:1,phase:Math.PI/2}];
  const links=residueLinks(values,3,0);
  assert.deepEqual(links.map(l=>l.r),[3,3,1]);assert.deepEqual([links[0].cx,links[0].cy],[0,0]);
  assert.ok(Math.abs(links[1].cx-3)<1e-9&&Math.abs(links[2].cx-6)<1e-9&&Math.abs(links[2].y-1)<1e-9);
  assert.ok(Math.abs(residueLinks(values,2,.3)[1].y)<1e-9); // a conjugate pair always lands on the real axis
  const f=fourierPortrait;assert.equal(f.mode,'xy');assert.ok(f.chains.x.length+f.chains.y.length>500);
  assert.ok(f.path.some(p=>!p.draw)&&f.path.some(p=>p.draw));assert.ok([...f.chains.x,...f.chains.y].every(c=>[c.k,c.amplitude,c.phase].every(Number.isFinite)));
});
