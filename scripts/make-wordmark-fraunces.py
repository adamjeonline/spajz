"""Špajz wordmark in Fraunces (opsz 144, wght 900, SOFT 50, WONK 0): Š tomato red, pajz cream, dark drop shadow.
Outlines only, so it looks the same everywhere.  python3 fraunces.py <repo>/renderer/brand"""
import sys, re, uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
FONT='/home/claude/fonts/FC.ttf'
tt=TTFont(FONT); gs=tt.getGlyphSet(); order=tt.getGlyphOrder(); upm=tt['head'].unitsPerEm
blob=hb.Blob.from_file_path(FONT); hbf=hb.Font(hb.Face(blob))
CREAM,RED='#f4e7c9','#e4503a'
def shape(s,size,track=0):
    buf=hb.Buffer(); buf.add_str(s); buf.guess_segment_properties(); hb.shape(hbf,buf,{'kern':True,'liga':False})
    k=size/upm; x=0; out=[]
    for info,pos in zip(buf.glyph_infos,buf.glyph_positions):
        out.append((order[info.codepoint],x+pos.x_offset*k,pos.y_offset*k,info.cluster)); x+=pos.x_advance*k+track
    return out,k
def paths(s,size,dx,base,track=0):
    gl,k=shape(s,size,track); res=[]; bp=BoundsPen(gs)
    for g,x,y,cl in gl:
        pen=SVGPathPen(gs); gs[g].draw(TransformPen(pen,(k,0,0,-k,dx+x,base-y))); res.append((cl,pen.getCommands()))
        gs[g].draw(TransformPen(bp,(k,0,0,-k,dx+x,base-y)))
    return res,bp.bounds
SIZE=118; SH=6
def wordmark(light=True):
    """light=True: for dark backgrounds (cream letters)"""
    _,(x0,y0,x1,y1)=paths('Špajz',SIZE,0,0,1.5)
    pad=4; ox=-x0+pad; base=-y0+pad
    W=x1-x0+SH+2*pad; H=y1-y0+SH+2*pad
    sh='#0d0b18' if light else '#d9cba8'; rest=CREAM if light else '#1b1830'
    body=''
    for dx,dy,shadow in ((SH,SH,True),(0,0,False)):
        ps,_=paths('Špajz',SIZE,ox+dx,base+dy,1.5)
        body+=''.join(f'<path d="{d}" fill="{sh if shadow else (RED if cl==0 else rest)}"/>' for cl,d in ps)
    return body,W,H
def svg(w,h,body,vb=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb or f"0 0 {w:.1f} {h:.1f}"}" width="{round(w)}" height="{round(h)}" role="img" aria-label="Špajz">{body}</svg>'
OUT=sys.argv[1] if len(sys.argv)>1 else None
for light,name in ((True,'dark'),(False,'light')):
    b,W,H=wordmark(light); s=svg(W,H,b)
    open(f'w-{name}.svg','w').write(s)
    if OUT:
        open(f'{OUT}/trustyshelf-wordmark-{name}.svg','w').write(s)
        old=open(f'{OUT}/trustyshelf-logo-{name}.svg').read()
        img=re.search(r'<image [^>]*/>',old).group(0)   # the jar icon (the user's PNG)
        ih=float(re.search(r'height="([\d.]+)"',img).group(1))
        k=ih*0.80/H; gap=18
        img2=re.sub(r'x="[^"]*" y="[^"]*"','x="0" y="0"',img)
        body=img2+f'<g transform="translate({ih+gap:.1f} {(ih-H*k)/2:.1f}) scale({k:.4f})">{b}</g>'
        LW=ih+gap+W*k
        open(f'{OUT}/trustyshelf-logo-{name}.svg','w').write(svg(LW,ih,body))
print('ok',round(W),round(H))
