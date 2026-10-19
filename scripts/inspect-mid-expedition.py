"""Inspect preserved phase-10 PNGs and record runtime crops; never edit image pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path('assets/pixel/expedition/v4')
manifest = dict(version=4, tool='built-in image_gen.imagegen', logicalSize=[576, 324],
                alphaCut=0.5, anchor='bottom-center', poseOrder=['idle', 'attack', 'hurt'],
                enemyLayout='miners: 4 columns x 3 poses; town: first 3 of 4 columns x 3 poses; vigilante: 3 poses in one row; measured gutters',
                sources={}, assets={})

def inspect(file, regions):
    with Image.open(root / file) as image:
        alpha = image.getchannel('A') if 'A' in image.getbands() else None
        transparent = alpha.histogram()[0] / (image.width * image.height) if alpha else 0
        manifest['sources'][file] = dict(size=list(image.size), hasAlpha=alpha is not None,
            transparentFraction=transparent, sha256=hashlib.sha256((root / file).read_bytes()).hexdigest())
        if alpha and transparent < .2: raise ValueError(f'{file}: missing transparent background')
        for name, box, target, dimension in regions:
            if alpha:
                bounds = alpha.crop(box).point(lambda n: 255 if n >= 128 else 0).getbbox()
                if not bounds: raise ValueError(f'{name}: empty silhouette')
                l,t,r,b = bounds
                if l == 0 or t == 0 or r == box[2]-box[0] or b == box[3]-box[1]:
                    raise ValueError(f'{name}: silhouette crosses inspection boundary')
                x,y,w,h = box[0]+l,box[1]+t,r-l,b-t
            else:
                x,y,r,b = box; w,h = r-x,b-y
            draw = [round(w * target / h),target] if dimension == 'height' else [target,round(h * target / w)]
            if dimension == 'full': draw = [576,324]
            manifest['assets'][name] = dict(file=file, sourceRect=[x,y,w,h], drawSize=draw, hasAlpha=alpha is not None)

def enemies(file, names, columns, rows):
    regions=[]
    for col,(name,height) in enumerate(names):
        for row,pose in enumerate(['idle','attack','hurt']):
            regions.append((name+'-'+pose,(columns[col],rows[row],columns[col+1],rows[row+1]),height,'height'))
    inspect(file,regions)

enemies('miners.png', [('mine-guard',64),('mine-chief',68),('soldier',64),('veteran',64)],
        [0,355,740,1075,1448], [0,395,732,1086])
# Only the first three columns are accepted; the fourth column is unused.
# A separate source avoids the original spear overlap and the edited cloak clipping.
enemies('town-enemies.png', [('thug',64),('scavenger',64),('madman',62)],
        [0,360,722,1060], [0,412,743,1086])
with Image.open(root / 'vigilante.png') as image:
    w,h=image.size
    columns=[0,630,1590,w] # Measured gutters; spear-thrust frame is wider than the idle pose.
    inspect('vigilante.png', [('vigilante-'+pose,(columns[i],0,columns[i+1],h),68,'height')
        for i,pose in enumerate(['idle','attack','hurt'])])
edges=[0,716,1411,2172]
inspect('mid-landmarks.png',[(prefix+name,(edges[i],0,edges[i+1],724),width,'width')
    for i,name in enumerate(['coal','sulphur','town'])
    for prefix,width in [('landmark-',24),('site-',144)]])
for file,name in [('mine-yard-battle.png','mine-yard-background'),('town-battle.png','town-background')]:
    with Image.open(root / file) as image: inspect(file,[(name,(0,0,*image.size),576,'full')])
(root / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Recorded',len(manifest['sources']),'unaltered sources and',len(manifest['assets']),'runtime crops.')
