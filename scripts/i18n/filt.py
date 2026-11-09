import json,re,sys
d=json.load(open('cand4.json'))
bad=('LOG','CMP','KEY','API','IMP')
badarg=re.compile(r'^ARG:(path\.join|.*addColorStop|.*setProperty|vdf\.get|iniGet|readIni|setIni|readFolder|Response|test|.*fillTextX|cached|.*setAttribute|svg|keyEv|word|clearReturnCover|drop|search|kc|k|tag)$')
badprop=re.compile(r'^PROP:(keys|class|id|transform|swatch|g|l|wii|gc|gamegear|megadrive|neogeo|ps3|n3ds|saturn|arcade|epic|ubisoft|xbox|\*|front|kick|key|emulatorName|font|bg|color|src|url|exe|ext|cmd|args|re|rx|match|file|folder|dir|path|type|kind|mode|icon|glyph|sys|system|core|platform|plat|ua|accept|hdr|headers)$')
mainok=re.compile(r'^(PROP:(error|err|msg|message|label|title|text|note|detail|info|stage|why|status|lead|sub|what|how|where|more|lbl|ph|placeholder|btn|pickTitle|back|retry|resume|start|undo|load|quit|get|own|tune|group|name)|ARG:(dialog\..*|onStatus|say|fixSay|SsError|SgError|showLaunch|toast.*|.*\.push|lines|sub|taskbarShow|startBar|rowL|shelf)|ReturnStatement|ConditionalExpression|BinaryExpression|LogicalExpression|ASG:.*|VAR:.*|ARR:.*|HTMLT)')
keep={}
for k,v in d.items():
    cs=[c.replace('CAT>','') for c in v['c']]
    cs=[c for c in cs if c.split(':')[0] not in bad and not badarg.match(c.split('#')[0]) and not badprop.match(c)]
    if not cs: continue
    if all(f.startswith('main') for f in v['f']) and not any(mainok.match(c.split('#')[0]) for c in cs): continue
    if re.fullmatch(r'[\w\s.+-]{1,3}',k): continue
    keep[k]={'f':v['f'],'c':cs}
# order: by file then length so related strings are together
order=sorted(keep,key=lambda k:(min(keep[k]['f']),))
json.dump({k:keep[k] for k in order},open('keep.json','w'),ensure_ascii=False)
print(len(keep),sum(map(len,keep)))
