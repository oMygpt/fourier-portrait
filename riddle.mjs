// "Guess who": the riddle is the Fourier series itself. The curve starts from 2 circles and doubles;
// the fewer circles a friend needs to recognise you, the better they know you.
import {frequencyLadder} from './formula.mjs';
import {ladderRungs} from './ladder.mjs';

export const RIDDLE_STEP=1.8,RIDDLE_HOLD=2.5,MORPH=.45;

export const riddleLevels=frequencyLadder;

export function prepareRiddle(mode,chains,path,samples=2400){
  const rungs=ladderRungs(mode,chains,path,samples);
  return {total:rungs.at(-1).n,rungs};
}

// Where the riddle is after `elapsed` seconds: current rung, morph fraction toward the next, and whether it ran out.
export function riddleState(elapsed,count,step=RIDDLE_STEP,hold=RIDDLE_HOLD){
  if(!Number.isInteger(count)||count<1)throw new RangeError('Invalid rung count');
  const t=Math.max(0,elapsed),index=Math.min(count-1,Math.floor(t/step)),local=t/step-index;
  const morph=index<count-1&&local>1-MORPH?(local-(1-MORPH))/MORPH:0;
  return {index,morph:morph*morph*(3-2*morph),done:t>=(count-1)*step+hold};
}

// The circle count the visitor saw when they pressed "I got it" (the rung they were looking at).
export const recognisedAt=(rungs,state)=>rungs[state.morph>.5?Math.min(rungs.length-1,state.index+1):state.index].n;

export function scoreText(n,total,lang='zh'){
  const zh=lang==='zh',share=total?Math.max(1,Math.round(n/total*100)):100;
  if(n==null)return zh?`看完全部 ${total} 个圆，才揭晓了答案。`:`It took all ${total} circles to reveal the answer.`;
  return zh?`你只用了 ${n} 个圆（全部的 ${share}%）就认出了 TA。`:`You recognised them with just ${n} circles (${share}% of all ${total}).`;
}

// Score card copy: never names or shows the person, so it can be forwarded as a challenge.
export function scoreCopy(n,total,lang='zh'){
  const zh=lang==='zh';
  return {
    title:n==null?(zh?'这一题，我没猜出来':'This one stumped me'):(zh?`我用 ${n} 个圆认出了 TA`:`I knew them by ${n} circles`),
    subtitle:zh?`全部共 ${total} 个旋转的圆`:`Out of ${total} rotating circles`,
    challenge:zh?'你需要几个圆？扫码挑战':'How many do you need? Scan to try'
  };
}
