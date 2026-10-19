"""Read unaltered phase-12 PNGs and record measured, alpha-bounded runtime crops."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path('assets/pixel/expedition/v6')
manifest = dict(version=6, tool='built-in image_gen.imagegen', logicalSize=[576, 324],
    alphaCut=.5, anchor='bottom-center', poseOrder=['idle', 'attack', 'hurt'],
    sources={}, assets={})

def inspect(file, regions):
    with Image.open(root/file) as im:
        alpha = im.getchannel('A') if 'A' in im.getbands() else None
        fraction = alpha.histogram()[0]/(im.width*im.height) if alpha else 0
        manifest['sources'][file] = dict(size=list(im.size), hasAlpha=alpha is not None,
            transparentFraction=fraction, sha256=hashlib.sha256((root/file).read_bytes()).hexdigest())
        if alpha and fraction < .2:
            raise ValueError(f'{file}: missing transparent background')
        for name, box, height in regions:
            if alpha:
                bounds = alpha.crop(box).point(lambda n: 255 if n >= 128 else 0).getbbox()
                if not bounds:
                    raise ValueError(f'{name}: empty crop')
                l,t,r,b = bounds
                if l == 0 or t == 0 or r == box[2]-box[0] or b == box[3]-box[1]:
                    raise ValueError(f'{name}: silhouette crosses crop boundary')
                x,y,w,h = box[0]+l,box[1]+t,r-l,b-t
                draw = [round(w*height/h),height]
            else:
                x,y,r,b = box; w,h = r-x,b-y; draw = [576,324]
            manifest['assets'][name] = dict(file=file, sourceRect=[x,y,w,h], drawSize=draw, hasAlpha=alpha is not None)

def sheet(file, entries):
    # Each column has individually measured row cuts; the generator's grid is not assumed exact.
    inspect(file, [(name+'-'+pose, (left, rows[i], right, rows[i+1]), height)
        for name,height,left,right,rows in entries for i,pose in enumerate(['idle','attack','hurt'])])

sheet('warship-crew.png', [
    ('warship-operative',65,0,512,[0,365,675,1024]),
    ('warship-researcher',62,512,1024,[0,365,680,1024]),
    ('warship-immortal',70,1024,1536,[0,365,675,1024])])
# The queen's rows overlap in the initial atlas. Only columns 1 and 3 are accepted.
sheet('warship-infestation.png', [
    ('warship-horror',54,0,512,[0,355,665,1024]),
    ('warship-beast',65,1024,1536,[0,344,648,1024])])
with Image.open(root/'warship-queen.png') as im:
    inspect('warship-queen.png', [('warship-queen-'+pose,(i*724,0,(i+1)*724,im.height),70)
        for i,pose in enumerate(['idle','attack','hurt'])])
sheet('warship-security.png', [
    ('warship-guard',67,0,465,[0,335,670,1024]),
    ('warship-quadruped',53,465,1015,[0,350,700,1024]),
    ('warship-medic',64,1015,1536,[0,335,675,1024])])
sheet('warship-machinery.png', [
    ('warship-auto-turret',48,0,512,[0,341,683,1024]),
    ('warship-defence-turret',56,512,1024,[0,341,683,1024]),
    ('warship-welder',61,1024,1536,[0,341,683,1024])])
sheet('warship-combat-bosses.png', [
    ('warship-prototype',82,0,768,[0,341,683,1024]),
    ('warship-sparring',78,768,1536,[0,341,683,1024])])
sheet('warship-medical-bosses.png', [
    ('warship-automaton',68,0,768,[0,341,683,1024]),
    ('warship-experiment',76,768,1536,[0,341,683,1024])])
for area in ['engineering','martial','medical','command','antechamber']:
    file = 'warship-'+area+'.png'
    with Image.open(root/file) as im:
        inspect(file, [('warship-'+area+'-background',(0,0,*im.size),324)])

(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Recorded',len(manifest['sources']),'unaltered sources and',len(manifest['assets']),'runtime crops.')
