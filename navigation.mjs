import {decodePortrait} from './share.mjs';
import {decodePointer} from './bundle.mjs';

export function shouldReloadForHash(hash){
  if(!hash)return true;
  if(hash.startsWith('#s')){decodePointer(hash);return true;}
  if(!hash.startsWith('#n')&&!hash.startsWith('#p='))return false;
  decodePortrait(hash);
  return true;
}
