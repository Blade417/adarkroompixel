"""Read preserved phase-11 PNGs and record measured runtime crops. Never edit pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path('assets/pixel/expedition/v5')
manifest = dict(version=5, tool='built-in image_gen.imagegen', logicalSize=[576,324],
    alphaCut=0.5, anchor='bottom-center', poseOrder=['idle','attack','hurt'],
    enemyLayout='columns identify enemies; rows idle/attack/hurt; creatures only first two columns accepted; swarms separate',
    sources={}, assets={})

def inspect(file, regions):
    with Image.open(root/file) as im:
        alpha=im.getchannel('A') if 'A' in im.getbands() else None
        fraction=alpha.histogram()[0]/(im.width*im.height) if alpha else 0
        manifest['sources'][file]=dict(size=list(im.size),hasAlpha=alpha is not None,
            transparentFraction=fraction,sha256=hashlib.sha256((root/file).read_bytes()).hexdigest())
        if alpha and fraction < .2: raise ValueError(f'{file}: missing transparent background')
        for name,box,target,dimension in regions:
            if alpha:
                bounds=alpha.crop(box).point(lambda n:255 if n>=128 else 0).getbbox()
                if not bounds: raise ValueError(f'{name}: empty crop')
                l,t,r,b=bounds
                if l==0 or t==0 or r==box[2]-box[0] or b==box[3]-box[1]:
                    raise ValueError(f'{name}: silhouette crosses crop boundary')
                x,y,w,h=box[0]+l,box[1]+t,r-l,b-t
            else:
                x,y,r,b=box; w,h=r-x,b-y
            draw=[round(w*target/h),target] if dimension=='height' else [target,round(h*target/w)]
            if dimension=='full': draw=[576,324]
            manifest['assets'][name]=dict(file=file,sourceRect=[x,y,w,h],drawSize=draw,hasAlpha=alpha is not None)

def enemies(file,names,columns,rows):
    inspect(file,[(name+'-'+pose,(columns[col],rows[row],columns[col+1],rows[row+1]),height,'height')
        for col,(name,height) in enumerate(names) for row,pose in enumerate(['idle','attack','hurt'])])

enemies('deep-city-military.png',[('city-sniper',64),('city-commando',64),('city-frail-man',61),('city-old-man',61)],
        [0,392,737,1092,1448],[0,406,746,1086])
enemies('deep-city-survivors.png',[('city-youth',64),('city-squatters',62),('city-deformed',68)],
        [0,427,1098,1536],[0,378,708,1024])
# Rats/tentacles in the first draft have overlapping attack-frame column extents.
# Only lizards/bird are accepted here. A separate, wider-gutter sheet supplies swarms.
enemies('deep-city-creatures.png',[('city-lizards',48),('city-bird',70)],
        [0,368,732],[0,368,727,1086])
enemies('deep-city-swarms.png',[('city-rats',44),('city-tentacles',60)],
        [0,758,1536],[0,381,708,1024])

for file,names,columns,height in [
    ('deep-deep-landmarks-a.png',['city','battlefield','borehole'],[0,670,1325,1983],793),
    ('deep-deep-landmarks-b.png',['shipwreck','swamp','warship'],[0,729,1351,2172],724)
]:
    inspect(file,[(prefix+name,(columns[i],0,columns[i+1],height),width,'width')
        for i,name in enumerate(names) for prefix,width in [('landmark-',24),('site-',144)]])
for file,name in [
    ('deep-city-street.png','city-street-background'),('deep-city-hospital.png','city-hospital-background'),
    ('deep-city-subway.png','city-subway-background'),('deep-swamp-scene.png','swamp-background'),
    ('deep-warship-corridor.png','warship-corridor-background')
]:
    with Image.open(root/file) as im: inspect(file,[(name,(0,0,*im.size),576,'full')])
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Recorded',len(manifest['sources']),'unaltered sources and',len(manifest['assets']),'runtime crops.')
