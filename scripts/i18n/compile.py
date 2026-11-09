import json,re,glob,sys,os
DIR=os.environ.get('I18N_DIR','tr'); OUT=os.environ.get('I18N_OUT','pt-BR.json')
keys=json.load(open('keys.json'))
tr={}
for f in sorted(glob.glob(DIR+'/*.txt')):
    for ln in open(f,encoding='utf-8').read().splitlines():
        if not ln.strip(): continue
        if ln.startswith('='):
            en,_,pt=ln[1:].partition('|'); keys.append(en); tr[len(keys)-1]=pt; continue
        i,_,pt=ln.partition('|'); tr[int(i)]=pt
PH=re.compile(r'\$\{((?:[^{}`]|\{(?:[^{}]|\{[^{}]*\})*\}|`(?:[^`\\]|\\.)*`)*)\}')
def split_en(s):
    # returns literal parts and placeholder exprs; '{}' = positional html placeholder
    parts=[];exprs=[];pos=0
    tok=re.compile(PH.pattern+r'|\{\}')
    for m in tok.finditer(s):
        parts.append(s[pos:m.start()]); exprs.append(m.group(1) if m.group(0)!='{}' else None); pos=m.end()
    parts.append(s[pos:]); return parts,exprs
def tern(expr):
    m=re.match(r'''^(.*?)\?\s*(["'])(.*?)\2\s*:\s*(["'])(.*?)\4\s*$''',expr.strip(),re.S)
    if not m: return None
    cond,a,b=m.group(1),m.group(3),m.group(5)
    plural_first=bool(re.search(r'>\s*1|!==?\s*1',cond))
    return a,b,plural_first
exact={};tpls=[];errs=[]
norm=lambda s:' '.join(s.split())
for i,pt in tr.items():
    en=keys[i]
    if pt==en: continue
    parts,exprs=split_en(en)
    if not exprs:
        exact[norm(en)]=norm(pt) if '[[' not in pt else pt; continue
    # build regex
    rx=''
    for j,p in enumerate(parts):
        rx+=re.escape(p).replace('\\ ',' ')
        if j<len(exprs):
            e=exprs[j]; t=tern(e) if e else None
            if t: rx+='('+'|'.join(re.escape(x) for x in sorted({t[0],t[1]},key=len,reverse=True))+')'
            elif e and re.fullmatch(r'[a-zA-Z_$][\w$]*(\.[\w$]+)*\.length|[a-z]\d?|[a-z]\+1|[\w.]+\s*[-+]\s*[\w.]+|\w+\.(count|total|done|pct|n|got|added|left|points|checked|moved|shrunk|skipped|failed)',e.strip()):
                rx+='([\\d.,]+)'
            else: rx+='(.*?)'
    # pt pieces
    out=[];pos=0;posi=0
    tok=re.compile(r'\[\[\$\{(.*?)\}\|([^|\]]*)\|([^\]]*)\]\]|'+PH.pattern+r'|\{\}')
    ok=True
    for m in tok.finditer(pt):
        if m.start()>pos: out.append(pt[pos:m.start()])
        if m.group(0).startswith('[['):
            ex=m.group(1)
            try: gi=exprs.index(ex)
            except ValueError: errs.append((i,'plural expr not in EN',ex)); ok=False; break
            t=tern(ex)
            a,b=(t[0],t[1]) if t else ('','')
            o1,o2=m.group(2),m.group(3)
            if t and t[2]: o1,o2=o2,o1
            out.append({'g':gi,'a':a,'b':b,'o':[o1,o2]})
        elif m.group(0)=='{}':
            idx=[k for k,e in enumerate(exprs) if e is None]
            if posi>=len(idx): errs.append((i,'too many {}')); ok=False; break
            out.append({'g':idx[posi]}); posi+=1
        else:
            ex=m.group(4)
            try: gi=exprs.index(ex)
            except ValueError: errs.append((i,'expr not in EN',ex[:60])); ok=False; break
            out.append({'g':gi})
        pos=m.end()
    if not ok: continue
    if pos<len(pt): out.append(pt[pos:])
    lits=sorted([p for p in parts if p.strip()],key=len,reverse=True)
    if not lits or len(lits[0].strip())<3: continue  # too generic
    if any(t[0]==rx for t in tpls): continue
    tpls.append([rx,out,lits[0].strip(),len(exprs)])
# templates with more literal text first
tpls.sort(key=lambda t:-len(re.sub(r'\(\.\*\?\)','',t[0])))
print('exact',len(exact),'tpl',len(tpls),'errs',len(errs))
for e in errs[:40]: print(e)
data={'d':exact,'t':tpls}
json.dump(data,open(OUT,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
