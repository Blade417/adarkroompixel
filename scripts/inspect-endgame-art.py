"""Measure preserved phase-15 originals and rebuild runtime metadata, without editing pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path('assets/pixel/endgame/v1')
manifest = dict(version=1, tool='built-in image_gen.imagegen', logicalSize=[350, 350],
                flightCoordinates=[700, 700], sources={}, assets={})

for name in ['fabricator', 'shipyard', 'escape', 'homefleet']:
    file = name + '.png'
    with Image.open(root / file) as im:
        if im.width != im.height:
            raise ValueError(f'{file}: expected square background')
        manifest['sources'][file] = dict(size=list(im.size), hasAlpha=im.mode == 'RGBA',
            sha256=hashlib.sha256((root / file).read_bytes()).hexdigest())
        manifest['assets'][name] = dict(file=file, sourceRect=[0, 0, im.width, im.height],
            drawSize=[350, 350], transparent=False)

file = 'flight-atlas.png'
with Image.open(root / file) as im:
    alpha = im.getchannel('A')
    fraction = alpha.histogram()[0] / (im.width * im.height)
    if fraction < .2:
        raise ValueError('flight atlas needs actual transparency')
    manifest['sources'][file] = dict(size=list(im.size), hasAlpha=True,
        transparentFraction=fraction, sha256=hashlib.sha256((root/file).read_bytes()).hexdigest())
    # Measured empty gutters: vertical split 656; horizontal empty rows 585..590.
    regions = [('flight-ship', (0, 0, 656, 585), [20, 30]),
               ('asteroid-0', (656, 0, 1312, 585), [20, 37]),
               ('asteroid-1', (0, 585, 656, 1199), [20, 37]),
               ('asteroid-2', (656, 585, 1312, 1199), [20, 37])]
    for name, box, size in regions:
        bounded = alpha.crop(box).point(lambda n: 255 if n >= 128 else 0).getbbox()
        if not bounded:
            raise ValueError(f'{name}: empty crop')
        l, t, r, b = bounded
        if l == 0 or t == 0 or r >= box[2]-box[0] or b >= box[3]-box[1]:
            raise ValueError(f'{name}: clipped silhouette')
        manifest['assets'][name] = dict(file=file, region=list(box),
            sourceRect=[box[0]+l, box[1]+t, r-l, b-t], drawSize=size, transparent=True)

(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(f"Recorded {len(manifest['sources'])} originals and {len(manifest['assets'])} bounded runtime assets.")
