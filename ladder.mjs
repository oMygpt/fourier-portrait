// Frequency ladder shared by the riddle and the video: the same portrait rebuilt with 2, 4, 8, … circles.
// All rungs use the same sampling so they can be morphed point by point.
import {frequencyLadder,energyShare} from './formula.mjs';
import {limitChains} from './portrait.mjs';
import {samplePortrait,closeStrokeSeams} from './portrait-render.mjs';

const circlesOf=(mode,chains)=>mode==='xy'?[...chains.x,...chains.y]:chains.complex;

export function portraitCurve(mode,chains,path,samples){
  return closeStrokeSeams(samplePortrait(mode,chains,path,samples),12);
}

export function ladderRungs(mode,chains,path,samples=2400){
  const all=circlesOf(mode,chains);
  if(!all.length||!path.length)throw new RangeError('Nothing to draw');
  return frequencyLadder(all.length).map(n=>{const selected=limitChains(mode,chains,n);return {n,energy:energyShare(circlesOf(mode,selected),all),points:portraitCurve(mode,selected,path,samples)};});
}

// Rungs visually identical to the full portrait (≥99.9% energy) are skipped, except the last.
export function trimLadder(rungs){
  const kept=rungs.filter((r,i)=>i===rungs.length-1||r.energy<.999);
  return kept.length?kept:rungs.slice(-1);
}
