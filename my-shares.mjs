// Creator-side record of uploaded HD shares so they can be withdrawn later.
// Holds only the object id and the delete token (never the decryption key), in this browser's localStorage.
const KEY='fourier-my-shares',RETENTION_MS=30*24*60*60*1000,LIMIT=100;
const valid=r=>r&&/^[\w-]{22}$/.test(r.id)&&/^[\w-]{43}$/.test(r.deleteToken)&&Number.isFinite(r.created)&&typeof r.label==='string';

export function listShares(storage=globalThis.localStorage,now=Date.now()){
  try{const rows=JSON.parse(storage?.getItem(KEY)||'[]');return Array.isArray(rows)?rows.filter(r=>valid(r)&&now-r.created<RETENTION_MS).sort((a,b)=>b.created-a.created):[];}catch{return [];}
}
function save(rows,storage){try{storage?.setItem(KEY,JSON.stringify(rows.slice(0,LIMIT)));}catch{}}
export function rememberShare({id,deleteToken,label=''},storage=globalThis.localStorage,now=Date.now()){
  const row={id,deleteToken,created:now,label:String(label).slice(0,32)};
  if(!valid(row))throw new RangeError('Invalid share record');
  save([row,...listShares(storage,now).filter(r=>r.id!==id)],storage,now);return row;
}
export function forgetShare(id,storage=globalThis.localStorage,now=Date.now()){
  save(listShares(storage,now).filter(r=>r.id!==id),storage);
}
