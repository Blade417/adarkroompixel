"""Read-only inspection of generated PNGs. Writes metadata, never edits image pixels.
Requires Python + Pillow; run from the repository root.
"""
from pathlib import Path
import hashlib
import json
import sys
from PIL import Image

root = Path('assets/pixel/expedition/v3')
manifest = dict(version=3, tool='built-in image_gen.imagegen', logicalSize=[576, 324],
                alphaCut=0.5, anchor='bottom-center', poseOrder=['idle', 'attack', 'hurt'],
                enemyLayout='five columns (enemy identity), three rows (pose)', sources={}, assets={})

def inspect(file, regions):
    raw = (root / file).read_bytes()
    with Image.open(root / file) as image:
        alpha = image.getchannel('A') if 'A' in image.getbands() else None
        transparent = alpha.histogram()[0] / (image.width * image.height) if alpha else 0
        manifest['sources'][file] = dict(size=list(image.size), hasAlpha=alpha is not None,
            sha256=hashlib.sha256(raw).hexdigest(), transparentFraction=transparent)
        for name, box, size, target_width in regions:
            if alpha:
                bounds = alpha.crop(box).point(lambda n: 255 if n >= 128 else 0).getbbox()
                if not bounds: raise ValueError(f'{name}: empty silhouette')
                l, t, r, b = bounds
                if l == 0 or t == 0 or r == box[2] - box[0] or b == box[3] - box[1]:
                    raise ValueError(f'{name}: silhouette touches inspection region boundary')
                x, y, w, h = box[0] + l, box[1] + t, r-l, b-t
            else:
                x, y, r, b = box
                w, h = r-x, b-y
            draw = size or [target_width, max(1, round(h * target_width / w))]
            manifest['assets'][name] = dict(file=file, sourceRect=[x,y,w,h], drawSize=draw, hasAlpha=alpha is not None)
        if alpha and transparent < .2: raise ValueError(f'{file}: missing transparent background')

edges = [0, 550, 1080, 1610, 2172]
inspect('landmarks.png', [(prefix + name, (edges[i],0,edges[i+1],724), None, width)
    for i, name in enumerate(['house','cave','mine','outpost'])
    for prefix, width in [('landmark-',24), ('site-',144)]])

if '--partial' not in sys.argv or (root / 'site-enemies.png').exists():
    with Image.open(root / 'site-enemies.png') as image:
        w, h = image.size
        # Measured transparent gutters, not theoretical equal cells.
        columns, rows = [0,299,628,960,1248,w], [0,385,650,h]
        regions = []
        for column, (name, height) in enumerate([('squatter',64),('cave-lizard',37),('lizard',45),('site-beast',55),('matriarch',66)]):
            for row, pose in enumerate(['idle','attack','hurt']):
                box = (columns[column],rows[row],columns[column+1],rows[row+1])
                bounds = image.getchannel('A').crop(box).point(lambda n: 255 if n >= 128 else 0).getbbox()
                if not bounds: raise ValueError(f'{name}-{pose}: empty silhouette')
                sw, sh = bounds[2]-bounds[0], bounds[3]-bounds[1]
                regions.append((name+'-'+pose, box, [round(sw * height / sh), height], None))
        inspect('site-enemies.png', regions)

for name in ['house','cave','mine']:
    file = name + '-battle.png'
    if '--partial' in sys.argv and not (root / file).exists(): continue
    with Image.open(root / file) as image:
        inspect(file, [(name+'-background',(0,0,*image.size),[576,324],None)])
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print('Recorded', len(manifest['sources']), 'unaltered sources and', len(manifest['assets']), 'runtime crops.')
