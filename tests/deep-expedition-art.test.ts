import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/pixel/expedition/v5/manifest.json';
import v2 from '../assets/pixel/expedition/v2/manifest.json';
import v3 from '../assets/pixel/expedition/v3/manifest.json';
import v4 from '../assets/pixel/expedition/v4/manifest.json';
import v8 from '../assets/pixel/expedition/v8/manifest.json';
import { SITE_ENEMY_ART, DEEP_SITES, sitePresentation } from '../src/app/expedition-art';
import { Expedition } from '../src/app/expedition';
import { ROOT } from '../src/node';
import { expeditionState, startGame } from './helpers';

describe('deep expedition source and runtime art',()=>{
  const art={...v2.assets,...v3.assets,...v4.assets,...manifest.assets,...v8.assets};
  it('preserves source hashes, actual PNG dimensions and transparent proportional crops',()=>{
    for(const [file,source] of Object.entries(manifest.sources)) {
      const bytes=fs.readFileSync(path.join(ROOT,'assets/pixel/expedition/v5',file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect(bytes.subarray(1,4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual(source.size);
      if(source.hasAlpha)expect(source.transparentFraction).toBeGreaterThan(.2);
    }
    for(const spec of Object.values(manifest.assets)) {
      const source=manifest.sources[spec.file as keyof typeof manifest.sources];
      const [x,y,w,h]=spec.sourceRect,[dw,dh]=spec.drawSize;
      expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0);expect(h).toBeGreaterThan(0);
      expect(x+w).toBeLessThanOrEqual(source.size[0]);expect(y+h).toBeLessThanOrEqual(source.size[1]);
      expect(Math.abs(dw/dh/(w/h)-1)).toBeLessThan(.06);expect(spec.hasAlpha).toBe(source.hasAlpha);
    }
    // The runtime resolves source URLs by basename; collisions would silently select the wrong version.
    const files=[...Object.keys(v2.sources),...Object.keys(v3.sources),...Object.keys(v4.sources),...Object.keys(manifest.sources)];
    expect(new Set(files).size).toBe(files.length);
  });
  it('covers every original city enemy with three poses and a Chinese name',()=>{
    const g=startGame(expeditionState(),{language:'zh'}), names=new Set<string>();
    for(const scene of Object.values(g.content.events.Setpieces.city.scenes)) {
      if(!scene.enemy)continue; names.add(scene.enemy);
      for(const pose of ['idle','attack','hurt'])expect(art).toHaveProperty(SITE_ENEMY_ART[scene.enemy]+'-'+pose);
      expect(g.t(scene.enemy)).toMatch(/[\u4e00-\u9fff]/);
    }
    expect(names.size).toBe(17);g.stop();
  });
  it('resolves every deep scene to a loaded background and all six landmarks to icon/entrance art',()=>{
    const g=startGame(expeditionState());const ex=new Expedition(g);ex.open();ex.pack('cured meat',10);ex.depart();
    for(const [id,site] of Object.entries(DEEP_SITES)) {
      expect(art).toHaveProperty('landmark-'+site.art);expect(art).toHaveProperty('site-'+site.art);
      if(id==='executioner')continue;
      g.events.startEvent(g.content.events.Setpieces[id]);
      for(const scene of Object.keys(g.content.events.Setpieces[id].scenes)) {
        g.events.loadScene(scene); expect(art).toHaveProperty(sitePresentation(g)!.background);
      }
      g.events.endEvent();
    }
    g.stop();
  });
  it('uses city hospital, subway and outer streets at the corresponding original scenes',()=>{
    const g=startGame(expeditionState());const ex=new Expedition(g);ex.open();ex.pack('cured meat',10);ex.depart();
    g.events.startEvent(g.content.events.Setpieces.city);
    for(const [scene,background] of [['a4','city-street-background'],['b8','city-hospital-background'],
      ['end13','city-hospital-background'],['c3','city-subway-background'],['d3','city-subway-background'],['end3','city-subway-background']]) {
      g.events.loadScene(scene);expect(sitePresentation(g)?.background).toBe(background);
    }
    g.stop();
  });
});
