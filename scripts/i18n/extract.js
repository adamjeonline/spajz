const acorn=require('/opt/npm-tools/node_modules/acorn'),walk=require('/opt/npm-tools/node_modules/acorn-walk'),fs=require('fs'),path=require('path');
const root=process.argv[2];const files=process.argv.slice(3);
const out={};const ctxs={};
const eng=s=>/[A-Za-z]{2}/.test(s)&&(/ /.test(s)||/^[A-Z][a-z]/.test(s)||/[…?!:]$/.test(s))&&!/^(https?:|data:|file:|blob:)/.test(s)&&!/^[.#\[]/.test(s)&&!/\.(png|jpe?g|svg|css|js|json|exe|zip|webp|mp4|woff2?|html|bin|pdf|ini|xml|txt|cfg|dll|iso|rvz)\b/i.test(s)&&!/^[\w.-]+(\/[\w.-]+)+$/.test(s)&&!/[{};=]/.test(s.replace(/\$\{[^}]*\}/g,''))&&!/^(\d|-)/.test(s)&&!/^[a-z0-9]+([:._-][a-z0-9]+)+$/i.test(s);
const nm=n=>!n?'':n.type==='Identifier'?n.name:n.type==='MemberExpression'?nm(n.object)+'.'+(n.property.name||n.property.value||'?'):n.type==='CallExpression'?nm(n.callee)+'()':n.type;
const LOGRE=/(^|\.)(log|logs|warn|error|debug|info|trace|dbg|slog|plog|vlog|logLine|logTo|appendLog|note)$/i;
function ctx(anc){ // anc: ancestors incl node last
  const n=anc[anc.length-1],p=anc[anc.length-2]||{},g=anc[anc.length-3]||{};
  if(p.type==='Property'&&p.key===n&&!p.computed)return 'KEY';
  if(p.type==='MemberExpression'&&p.property===n)return 'KEY';
  if(p.type==='BinaryExpression'&&/[=!]==?/.test(p.operator))return 'CMP';
  if(p.type==='SwitchCase')return 'CMP';
  if(p.type==='ImportDeclaration'||p.type==='ExportNamedDeclaration')return 'IMP';
  if(p.type==='CallExpression'||p.type==='NewExpression'){const c=nm(p.callee);
    if(LOGRE.test(c)||/console\./.test(c))return 'LOG:'+c;
    if(/require|querySelector|getElementById|getElementsBy|closest|matches|classList|setAttribute|getAttribute|removeAttribute|hasAttribute|addEventListener|removeEventListener|createElement|RegExp|includes|startsWith|endsWith|indexOf|split|replace|join|invoke|handle|send|on$|once|emit|getItem|setItem|^gp$|^sp$|^gpv$|toggle|^\$\$?$|^\$\(\)|style|setProperty|spawn|execFile|exec$|path\.|fs\.|join$|resolve|basename|extname|dirname|readFile|writeFile|existsSync|fetch|get$|has$|set$|delete$|test$|match/.test(c)&&p.arguments&&p.arguments[0]===n)return 'API:'+c;
    return 'ARG:'+c+'#'+p.arguments.indexOf(n);}
  if(p.type==='AssignmentExpression'){return 'ASG:'+nm(p.left)}
  if(p.type==='Property'&&p.value===n)return 'PROP:'+(p.key.name||p.key.value);
  if(p.type==='ArrayExpression')return 'ARR:'+(g.type==='Property'?(g.key.name||g.key.value):g.type==='CallExpression'?nm(g.callee):g.type==='VariableDeclarator'?nm(g.id):g.type);
  if(p.type==='VariableDeclarator')return 'VAR:'+nm(p.id);
  return p.type;
}
for(const f of files){
  const src=fs.readFileSync(f,'utf8');let ast;
  for(const st of ['script','module']){try{ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:st,allowHashBang:true,allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true});break}catch(e){}}
  const rel=path.relative(root,f);
  walk.fullAncestor(ast,(n,_,anc)=>{
    let s=null,kind;
    if(n.type==='Literal'&&typeof n.value==='string'){if(!eng(n.value))return;s=n.value;kind='s'}
    else if(n.type==='TemplateLiteral'){
      let t='';n.quasis.forEach((q,i)=>{t+=q.value.cooked??q.value.raw;if(i<n.expressions.length)t+='${'+src.slice(n.expressions[i].start,n.expressions[i].end)+'}'});
      const plain=n.quasis.map(q=>q.value.cooked||'').join(' ');
      if(/<\w/.test(plain)){const tt=t.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g,'\u0001');
        for(const m of tt.matchAll(/>([^<>]+)</g)){const x=m[1].replace(/\s+/g,' ').trim();if(eng(x.replace(/\u0001/g,'X')))rec(x.replace(/\u0001/g,'{}'),rel,'HTMLT')}
        for(const m of tt.matchAll(/\b(?:title|placeholder|aria-label|alt)="([^"]+)"/g))if(eng(m[1].replace(/\u0001/g,'X')))rec(m[1].replace(/\u0001/g,'{}'),rel,'HTMLT');
        return}
      if(!eng(plain))return;s=t;kind='t'}
    else if(n.type==='BinaryExpression'&&n.operator==='+'){
      const p=anc[anc.length-2];if(p&&p.type==='BinaryExpression'&&p.operator==='+')return;
      const parts=[];(function fl(x){if(x.type==='BinaryExpression'&&x.operator==='+'){fl(x.left);fl(x.right)}else parts.push(x)})(n);
      if(!parts.some(x=>x.type==='Literal'&&typeof x.value==='string'&&/[A-Za-z]{2}/.test(x.value)))return;
      let t='';for(const x of parts)t+=(x.type==='Literal'&&typeof x.value==='string')?x.value:x.type==='TemplateLiteral'?x.quasis.map((q,i)=>(q.value.cooked||'')+(i<x.expressions.length?'${'+src.slice(x.expressions[i].start,x.expressions[i].end)+'}':'')).join(''):'${'+src.slice(x.start,x.end)+'}';
      const plain=t.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g,' ');
      if(/<\w/.test(plain)||!eng(plain.trim()))return;
      if(!/[A-Za-z]{3}.*\$\{|\$\{.*[A-Za-z]{3}/.test(t))return;
      rec(t.replace(/\s+/g,' ').trim(),rel,'CAT>'+ctx(anc));return;
    }
    else return;
    rec(s.replace(/\s+/g,' ').trim(),rel,ctx(anc));
  });
}
function rec(s,rel,c){if(!s)return;const o=out[s]=out[s]||{f:new Set(),c:new Set()};o.f.add(rel);o.c.add(c)}
for(const f of fs.readdirSync(root+'/renderer').filter(x=>x.endsWith('.html')).map(x=>root+'/renderer/'+x).concat([root+'/renderer/companion/index.html'])){
  let t=fs.readFileSync(f,'utf8').replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g,'');const rel=path.relative(root,f);
  for(const m of t.matchAll(/>([^<>]+)</g)){const x=m[1].replace(/\s+/g,' ').trim();if(/[A-Za-z]{2}/.test(x))rec(x,rel,'HTML')}
  for(const m of t.matchAll(/\b(?:title|placeholder|aria-label|alt|data-tip|data-label)="([^"]+)"/g))rec(m[1],rel,'HTML');
}
const o={};for(const [k,v] of Object.entries(out))o[k]={f:[...v.f],c:[...v.c]};
fs.writeFileSync(__dirname+'/cand4.json',JSON.stringify(o));
const cc={};for(const v of Object.values(o))for(const c of v.c){const k=c.split(/[:#]/)[0];cc[k]=(cc[k]||0)+1}
console.log(Object.keys(o).length,cc);
