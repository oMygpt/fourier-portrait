// Build dist/ for Cloudflare Pages: the static site minus repo-only files, with models over 24 MiB split into parts.
// Usage: node tools/pages-dist.mjs [outDir]   then: npx wrangler pages deploy dist --project-name fourier-portrait
import {cpSync,mkdirSync,readdirSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('..',import.meta.url).pathname,out=process.argv[2]||join(root,'dist'),LIMIT=24*1024*1024;
const skip=name=>name.startsWith('.')&&name!=='.nojekyll'||['dist','worker','tools','node_modules'].includes(name)||name.endsWith('.test.mjs')||name==='README.md';
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const name of readdirSync(root))if(!skip(name))cpSync(join(root,name),join(out,name),{recursive:true});
const manifest={};
for(const name of readdirSync(join(out,'models'))){
  const file=join(out,'models',name),size=statSync(file).size;if(size<=LIMIT)continue;
  const bytes=readFileSync(file),parts=[];
  for(let i=0;i*LIMIT<size;i++){const part=`${name}.part${i}`;writeFileSync(join(out,'models',part),bytes.subarray(i*LIMIT,(i+1)*LIMIT));parts.push(part);}
  rmSync(file);manifest[name]={size,parts};
}
writeFileSync(join(out,'models','parts.json'),JSON.stringify(manifest));
writeFileSync(join(out,'_headers'),'/models/*\n  Cache-Control: public, max-age=604800\n/vendor/*\n  Cache-Control: public, max-age=604800\n');
console.log('dist ready:',out,'| split:',Object.keys(manifest).join(', ')||'none');
