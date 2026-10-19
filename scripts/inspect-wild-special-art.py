"""Read original v8 PNGs and record alpha-bounded crops; never rewrite image pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root=Path('assets/pixel/expedition/v8')
manifest=dict(version=8,tool='built-in image_gen.imagegen',logicalSize=[576,324],alphaCut=.5,
    anchor='bottom-center',poseOrder=['idle','attack','hurt'],sources={},assets={})

def inspect(file, regions):
    with Image.open(root/file) as im:
        alpha=im.getchannel('A') if 'A' in im.getbands() else None
        fraction=alpha.histogram()[0]/(im.width*im.height) if alpha else 0
        manifest['sources'][file]=dict(size=list(im.size),hasAlpha=alpha is not None,
            transparentFraction=fraction,sha256=hashlib.sha256((root/file).read_bytes()).hexdigest())
        if alpha and fraction<.2:raise ValueError(f'{file}: missing transparency')
        for name,box,target,dimension in regions:
            if alpha:
                bounds=alpha.crop(box).point(lambda n:255 if n>=128 else 0).getbbox()
                if not bounds:raise ValueError(f'{name}: empty crop')
                l,t,r,b=bounds
                if l==0 or t==0 or r==box[2]-box[0] or b==box[3]-box[1]:
                    raise ValueError(f'{name}: crosses inspection boundary')
                x,y,w,h=box[0]+l,box[1]+t,r-l,b-t
                draw=[round(w*target/h),target] if dimension=='height' else [target,round(h*target/w)]
            else:
                x,y,r,b=box;w,h=r-x,b-y;draw=[576,324]
            manifest['assets'][name]=dict(file=file,sourceRect=[x,y,w,h],drawSize=draw,hasAlpha=alpha is not None)

# Measured transparent gutters, not assumed equal columns.
for file,prefix,cuts,height in [
    ('wild-shivering.png','wild-shivering',[0,500,1300,1774],66),
    ('wild-man-eater.png','wild-man-eater',[0,683,1560,2172],65),
    ('wild-feral-terror-spaced.png','wild-feral-terror',[0,565,1420,1983],77)
]:
    with Image.open(root/file) as im:
        inspect(file,[(prefix+'-'+pose,(cuts[i],0,cuts[i+1],im.height),height,'height')
            for i,pose in enumerate(['idle','attack','hurt'])])
for file,name,target,dimension in [
    ('special-swamp-elder.png','swamp-elder',52,'height'),
    ('special-cache-landmark.png','landmark-cache',24,'width'),
    ('special-cache-landmark.png','site-cache',144,'width'),
    ('special-swamp-cabin.png','swamp-cabin-background',324,'height'),
    ('special-cache-interior.png','cache-interior-background',324,'height')
]:
    with Image.open(root/file) as im:inspect(file,[(name,(0,0,*im.size),target,dimension)])
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
print('Recorded',len(manifest['sources']),'accepted unaltered sources and',len(manifest['assets']),'runtime crops.')
