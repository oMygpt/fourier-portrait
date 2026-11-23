// "圆周判词": a one-line, playful verdict computed from the real formula — two honest, checkable numbers.
//   circles: how many rotating circles the formula has (the same count the card's headline prints).
//   lead:    how many of the largest circles (k ≠ 0, biggest first) it takes to hold 85% of the energy Σ|cₖ|².
// Energy is not likeness (16 circles look like nobody), so the line never claims "85% of you" — only 85% of the energy.
// Tier cut points come from the six sample portraits (automatic counts, XY mode):
//   circles 293–611 → gauss 293, curie 309, newton 331 | euler 456 | fourier 579, einstein 611
//   lead    12–28   → curie 12, newton 12 | gauss 15, euler 18, einstein 19 | fourier 28
import {canonicalFormula} from './formula.mjs';

export const PERSONA_ENERGY=.85,CIRCLE_TIERS=[400,520],LEAD_TIERS=[14,22];

export function personaStats(mode,chains){
  const circles=canonicalFormula(mode,chains).circles,moving=(mode==='xy'?[...chains.x,...chains.y]:chains.complex).filter(c=>c.k);
  const amplitudes=moving.map(c=>c.amplitude).sort((a,b)=>b-a),total=amplitudes.reduce((s,a)=>s+a*a,0);
  let lead=0,acc=0;
  if(total>0)for(const a of amplitudes){acc+=a*a;lead++;if(acc>=PERSONA_ENERGY*total*(1-1e-12))break;}
  return {circles,lead};
}

const tier=(value,[low,high])=>value<low?0:value<high?1:2;

export function persona(mode,chains,lang='zh'){
  const {circles,lead}=personaStats(mode,chains),zh=lang==='zh';
  if(!lead)return zh?`${circles} 个圆，安安静静。`:`${circles} circles, keeping perfectly still.`;
  const shape=[
    zh?`${circles} 个圆——极简派，一个都不浪费`:`${circles} circles: a minimalist, not one wasted`,
    zh?`${circles} 个圆——细节不少，个个有戏`:`${circles} circles: plenty of detail, all of it busy`,
    zh?`${circles} 个圆——大概是头发太有主见`:`${circles} circles: the hair has opinions, probably`
  ][tier(circles,CIRCLE_TIERS)];
  const outline=[
    zh?`前 ${lead} 个圆就拿下 85% 的能量，干脆利落`:`the top ${lead} already hold 85% of the energy`,
    zh?`前 ${lead} 个圆拿下 85% 的能量，分工明确`:`the top ${lead} hold 85% of the energy, a tidy team`,
    zh?`要 ${lead} 个主圆才凑齐 85% 的能量，轮廓戏很多`:`it takes ${lead} lead circles to reach 85% of the energy`
  ][tier(lead,LEAD_TIERS)];
  return zh?`${shape}；${outline}。`:`${shape}; ${outline}.`;
}
