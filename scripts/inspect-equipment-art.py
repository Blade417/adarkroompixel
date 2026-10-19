"""Read preserved phase-13 PNGs; measure alpha bounds without modifying image pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path('assets/pixel/expedition/v7')
manifest = dict(version=7, tool='built-in image_gen.imagegen', logicalSize=[576,324], alphaCut=.5,
    anchor='bottom-center', hands={}, sources={}, assets={})

def inspect(file, regions):
    with Image.open(root/file) as im:
        alpha = im.getchannel('A')
        fraction = alpha.histogram()[0] / (im.width*im.height)
        if fraction < .2:
            raise ValueError(f'{file}: missing transparent background')
        manifest['sources'][file] = dict(size=list(im.size), hasAlpha=True,
            transparentFraction=fraction, sha256=hashlib.sha256((root/file).read_bytes()).hexdigest())
        for name, box, target, dimension in regions:
            bounds = alpha.crop(box).point(lambda n: 255 if n >= 128 else 0).getbbox()
            if not bounds:
                raise ValueError(f'{name}: empty silhouette')
            l,t,r,b = bounds
            if l == 0 or t == 0 or r == box[2]-box[0] or b == box[3]-box[1]:
                raise ValueError(f'{name}: silhouette crosses inspection boundary')
            x,y,w,h = box[0]+l,box[1]+t,r-l,b-t
            draw = [round(w*target/h),target] if dimension == 'height' else [target,round(h*target/w)]
            manifest['assets'][name] = dict(file=file, sourceRect=[x,y,w,h], drawSize=draw, hasAlpha=True)

inspect('late-weapons.png', [
    ('weapon-bayonet',(0,0,665,440),39,'width'),
    ('weapon-laser',(665,0,1460,440),69,'width'),
    ('weapon-grenade',(1460,0,1774,440),13,'height'),
    ('weapon-plasma',(0,440,755,887),70,'width'),
    ('weapon-energy-blade',(755,440,1380,887),53,'width'),
    ('weapon-disruptor',(1380,440,1774,887),34,'width')])

for armour in ['leather','iron','steel','kinetic']:
    regions = []
    for col, (pose,height) in enumerate([('idle',74),('attack',67),('hurt',67)]):
        regions.append((f'armour-{armour}-{pose}',(col*512,0,(col+1)*512,560),height,'height'))
    for col, direction in enumerate(['north','south','east']):
        regions.append((f'armour-{armour}-map-{direction}',(col*512,560,(col+1)*512,1024),24,'height'))
    inspect(f'armour-{armour}.png',regions)
    manifest['hands'][armour] = dict(idle=[.935,.408],attack=[.94,.33],hurt=[.705,.385])

# The kinetic edit raises the idle forearm slightly; anchors are measured within each bounded pose.
manifest['hands']['kinetic']['idle'] = [.93,.414]
manifest['hands']['kinetic']['hurt'] = [.71,.41]
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(f"Recorded {len(manifest['sources'])} unaltered sources and {len(manifest['assets'])} runtime crops.")
