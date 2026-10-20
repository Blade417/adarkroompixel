/** Bootstrap: the headless core, the pixel room on a canvas, the HTML interface and audio. */
import './ui/style.css';
import { Game } from './core/game';
import { SAVE_KEY } from './core/save';
import type { Language } from './core/i18n';
import { audioUrl, browserContent, zhDictionaries } from './app/content';
import { browserStorage, loadPrefs, reducedMotion, savePrefs, type MotionPref } from './app/prefs';
import { AudioManager } from './app/audio';
import { ArrivalPlayer, ArrivalWatcher } from './pixel/arrival';
import { loadSceneArt, standInPieces } from './pixel/assets';
import { chooseMode, fitFull, fitNarrow, STACKED_STAGE_SHARE, type Fit } from './pixel/fit';
import { OpeningProgress } from './app/opening';
import { ForestJourney, type PixelPlace } from './app/forest';
import { PIXEL_RECIPES } from './app/building';
import { ForestRenderer, loadForestArt } from './pixel/forest';
import { SceneControls } from './ui/scene-controls';
import { VillageControls } from './ui/village-controls';
import { rememberVillageClearing, villageView, VILLAGE_SIZE } from './app/village';
import { VillageRenderer, loadVillageArt } from './pixel/village';
import { uiStrings } from './ui/strings';
import { roomView, type RoomView } from './pixel/mapping';
import { Renderer } from './pixel/renderer';
import { SAMPLE_MODES, type SampleMode } from './pixel/resample';
import { DebugPanel } from './ui/debug';
import { Hud, type HudHost } from './ui/hud';
import { HEADER_H, hudLayout } from './ui/layout';
import { Expedition } from './app/expedition';
import { ExpeditionPanel } from './ui/expedition';
import { Endgame } from './app/endgame';
import { EndgamePanel } from './ui/endgame';
import { StartupAssets, useStartupAssets } from './pixel/loading';
import { startupArt } from './pixel/preload';
import { LoadingScreen } from './ui/loading';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const sampleParam = params.get('sample') as SampleMode | null;
const sample: SampleMode = sampleParam && SAMPLE_MODES.includes(sampleParam) ? sampleParam : 'mode';

const storage = browserStorage();
const prefs = loadPrefs(storage);
const hasSave = (() => {
  try {
    const s = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    return Boolean(s && (s.stores || s.features || s.previous?.ending));
  } catch {
    return false;
  }
})();

document.documentElement.lang = prefs.language === 'zh' ? 'zh-CN' : 'en';

const game = new Game({ content: browserContent, storage, language: prefs.language, dictionaries: { zh: zhDictionaries }, craftables: PIXEL_RECIPES });
const audio = new AudioManager((key) => {
  const path = game.content.audio[key];
  return path ? audioUrl(path) : undefined;
});
audio.setEnabled(prefs.sound, prefs.volume);
game.bus.on((e) => audio.handle(e));

const watcher = new ArrivalWatcher();
const opening = new OpeningProgress(game);
const journey = new ForestJourney(game);
const expedition = new Expedition(game);
const endgame = new Endgame(game);
const player = new ArrivalPlayer();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reducedMotion(prefs.motion, motionQuery.matches);
let renderer: Renderer | null = null;
let forestRenderer: ForestRenderer | null = null;
let villageRenderer: VillageRenderer | null = null;
let fit: Fit | null = null;
/** devicePixelRatio of the current layout (zoom or a move to another screen changes it) */
let layoutDpr = 0;
let anchors = false;
let fps = 60;
let sceneLayoutKey = '';

/** stop the clock and every save before the page reloads (the reload must not write the old state back) */
function leave(): void {
  game.stop();
  game.over = true;
  location.reload();
}

function updateMotion(): void {
  reduce = reducedMotion(prefs.motion, motionQuery.matches);
  hud.setReduced(reduce);
  if (reduce) player.skip();
}

const host: HudHost = {
  hasSave,
  get language() {
    return prefs.language;
  },
  get sound() {
    return prefs.sound;
  },
  get motion() {
    return prefs.motion;
  },
  begin() {
    audio.unlock();
  },
  setLanguage(lang: Language) {
    if (lang === prefs.language) return;
    prefs.language = lang;
    savePrefs(storage, prefs);
    // story text is translated when the content loads, so a language switch reloads
    if (hud.begun && !game.over) game.saveNow();
    leave();
  },
  setSound(on: boolean) {
    prefs.sound = on;
    savePrefs(storage, prefs);
    audio.setEnabled(on, prefs.volume);
    if (on) audio.unlock();
  },
  setMotion(m: MotionPref) {
    prefs.motion = m;
    savePrefs(storage, prefs);
    updateMotion();
  },
  restart() {
    game.stop();
    if (endgame.ending) endgame.nextGeneration();
    else game.deleteSave(true);
    leave();
  },
  importSave(code: string) {
    if (!game.importCode(code)) return false;
    leave();
    return true;
  },
  skipArrival() {
    if (!player.playing) return false;
    player.skip();
    return true;
  },
  get forestReady() { return forestRenderer !== null; },
  get villageReady() { return villageRenderer !== null; },
  get expeditionOpen() { return expedition.opened; },
  get endgameOpen() { return endgame.opened; },
  openEndgame(place) {
    if (!hud.canInteract() || player.playing) return false;
    return endgame.open(place);
  },
  openExpedition() {
    if (!hud.canInteract() || player.playing) return false;
    const opened = expedition.open();
    if (opened) endgame.leave();
    return opened;
  },
  hasWorkshopArt(id) { return Boolean(renderer?.sceneArt.workshop[id]); },
  travel(place: PixelPlace) {
    if (!hud.canInteract() || player.playing || (place === 'outside' && !forestRenderer) || (place === 'village' && !villageRenderer)) return false;
    const moved = journey.travel(place);
    if (moved) { endgame.leave(); hud.canvas.focus({ preventScroll: true }); layout(); }
    return moved;
  }
};

const app = document.getElementById('app')!;
const hud = new Hud(app, game, host, journey);
const loadingScreen = new LoadingScreen(app, prefs.language);
const expeditionPanel = new ExpeditionPanel(app, expedition, () => { layout(); requestAnimationFrame(() => hud.canvas.focus({ preventScroll: true })); });
const endgamePanel = new EndgamePanel(app, endgame, () => host.travel('room'), leave, sample);
const sceneControls = new SceneControls(hud.canvas.parentElement!, journey, uiStrings(game.i18n.lang),
  () => hud.canInteract() && !player.playing, place => host.travel(place));
const villageControls = new VillageControls(hud.canvas.parentElement!, journey, uiStrings(game.i18n.lang),
  () => hud.canInteract() && !player.playing, place => host.travel(place), (zone, opener) => hud.openDistrict(zone, opener));
hud.setReduced(reduce);
// the room behind the title is the saved one; its clock only runs after Begin / Continue
game.start();
expedition.restore();
endgame.restore();

motionQuery.addEventListener('change', updateMotion);

// ---------------------------------------------------------------- layout

function layout(): void {
  if (!renderer) return;
  const dpr = window.devicePixelRatio || 1;
  layoutDpr = dpr;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight - HEADER_H;
  const stacked = chooseMode(vw, vh, dpr) === 'stacked';
  hud.setStacked(stacked);
  const { w, h } = hud.stageSize();
  // Keep the return marker in the forest and the door plus furnace in the unlocked room.
  const focus = journey.outside ? 240 : journey.unlocked ? 224 : undefined;
  const village = journey.place === 'village';
  // The overview uses the full map, so its status and log need space outside both edges.
  const f = village ? fitFull(w, Math.max(1, h - 112), dpr, VILLAGE_SIZE) :
    stacked ? fitNarrow(w, vh * STACKED_STAGE_SHARE, dpr, focus) : fitFull(w, h, dpr);
  if (village && !stacked) f.top += 56;
  // snap the canvas' page position (not only its offset in the stage) to device pixels
  const r = hud.stage.getBoundingClientRect();
  f.left = Math.round((r.left + f.left) * dpr) / dpr - r.left;
  if (!stacked) f.top = Math.round((r.top + f.top) * dpr) / dpr - r.top;
  fit = f;
  renderer.resize(f);
  const hudFit = hudLayout(f, w, h);
  if (journey.place === 'village') {
    hudFit.band = f.top + f.cssH + 16;
    hudFit.bandH = Math.max(0, h - hudFit.band);
  }
  hud.applyLayout(hudFit);
  hud.placeHearth(f);
  sceneControls.layout(f);
  villageControls.layout(f);
}

window.addEventListener('resize', layout);

// ---------------------------------------------------------------- pointer: the hearth

// The furnace has a DOM target aligned to the scene; empty floor never tends the fire.
hud.canvas.addEventListener('click', () => player.skip());

// ---------------------------------------------------------------- the loop

const MAX_CATCH_UP = 8 * 60 * 60 * 1000;
let last = performance.now();

function currentView(): RoomView {
  const s = game.store;
  return roomView({
    fire: game.room.fire,
    temperature: game.room.temperature,
    builderLevel: game.room.builderLevel,
    wood: s.get('stores.wood'),
    fur: s.get('stores.fur'),
    cart: s.num('game.buildings.cart'),
    traps: s.num('game.buildings.trap')
  });
}

function frame(now: number): void {
  const dt = now - last;
  last = now;
  if (dt > 0 && dt < 1000) fps += (1000 / dt - fps) * 0.05;
  let live = false;
  if (expedition.opened && game.active === 'world' && dt > 1500) expedition.paused = true;
  if (endgame.flying && (dt > 1500 || hud.overlayOpen || document.hidden)) endgame.pause();
  if (hud.begun && !game.over && !(expedition.opened && (expedition.paused || hud.overlayOpen || document.hidden)) && !(endgame.flying && endgame.paused)) {
    rememberVillageClearing(game);
    if (dt > 1000) {
      // the tab was hidden: the world kept going; catch up in one-second steps, without animating it
      game.clock.run(Math.min(dt, MAX_CATCH_UP), 1000);
    } else if (dt > 0) {
      game.tick(dt);
      live = true;
    }
    opening.update();
  }
  const view = currentView();
  if (watcher.observe(game.room.builderLevel, live && !journey.away) && !reduce) player.start(now);
  const nextSceneKey = `${journey.place}|${journey.unlocked}`;
  if (sceneLayoutKey !== nextSceneKey) {
    sceneLayoutKey = nextSceneKey;
    app.dataset.place = journey.place;
    layout();
  }
  // a DPR change without a resize (another screen) has no reliable event everywhere: poll it
  if (renderer && (window.devicePixelRatio || 1) !== layoutDpr) layout();
  if (renderer) {
    const pose = player.pose(now);
    if (journey.place === 'village' && villageRenderer && fit) {
      villageRenderer.render(fit, villageView(game), villageControls.highlighted, now, reduce);
    } else if (journey.outside && forestRenderer && fit) {
      forestRenderer.render(fit, journey, sceneControls.highlighted, now, reduce);
    } else renderer.render({
      view,
      timeMs: now,
      reduceMotion: reduce,
      arrival: pose,
      hoverHearth: hud.hearthHighlighted && !pose,
      hoverDoor: sceneControls.highlighted === 'door',
      hoverWorkshop: hud.highlightedWorkshop,
      debugAnchors: anchors
    });
    hud.frame(now, view, !journey.away && pose !== null);
  } else {
    hud.frame(now, view, false);
  }
  sceneControls.frame(now, forestRenderer !== null);
  villageControls.frame(villageView(game), hud.begun && villageRenderer !== null);
  expeditionPanel.frame(now, !hud.begun || hud.overlayOpen, reduce);
  endgamePanel.frame(now, !hud.begun || hud.overlayOpen || Boolean(game.events.active()), reduce);
  requestAnimationFrame(frame);
}

const persist = (): void => {
  if (hud.begun && !game.over) game.saveNow();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (expedition.opened && game.active === 'world') expedition.paused = true;
    endgame.pause();
    persist();
  }
});
window.addEventListener('pagehide', persist);

// ---------------------------------------------------------------- start

async function boot(): Promise<void> {
  const assets = new StartupAssets(startupArt(sample), progress => loadingScreen.update(progress));
  useStartupAssets(assets);
  await assets.download();
  const art = await assets.prepare('room', () => loadSceneArt(sample));
  const forestArt = await assets.prepare('forest', () => loadForestArt(sample));
  const villageArt = await assets.prepare('village', () => loadVillageArt(sample));
  await assets.prepare('expedition', () => expeditionPanel.prepareArt());
  await assets.prepare('later', () => endgamePanel.prepareArt());
  renderer = new Renderer(hud.canvas, art);
  if (forestArt) {
    forestRenderer = new ForestRenderer(hud.canvas, forestArt);
  }
  if (villageArt) villageRenderer = new VillageRenderer(hud.canvas, villageArt);
  if (game.active === 'room' || game.active === 'outside') journey.restoreLocation();
  if (journey.place === 'village' && !villageRenderer) journey.travel('room');
  if (journey.outside && !forestRenderer) journey.travel('room');
  document.documentElement.style.setProperty('--base', art.base);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', art.base);
  layout();
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
  assets.finish();
  useStartupAssets(null);
  // Paint the completed progress before revealing the fully prepared title screen.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  loadingScreen.remove();
  hud.setAssetsReady();
  hud.focusStart();

  if (DEBUG) {
    new DebugPanel(app, {
      game,
      info: () => ({
        fps,
        layout: app.dataset.mode ?? '',
        scale: fit?.scale ?? 0,
        ps: fit?.ps ?? 0,
        dpr: window.devicePixelRatio || 1,
        sample,
        standIns: renderer ? standInPieces(renderer.sceneArt) : [],
        arrival: player.playing
      }),
      previewArrival: () => player.start(performance.now()),
      setAnchors: (on) => (anchors = on),
      skip: (ms) => {
        game.clock.run(ms, 1000);
        // what happened during the skip is not animated (like returning to the tab)
        watcher.observe(game.room.builderLevel, false);
      },
      restart: () => host.restart()
    });
  }
}

// handy for debugging and automated checks
(window as unknown as { __adrpx: unknown }).__adrpx = {
  game,
  hud,
  player,
  get renderer() {
    return renderer;
  },
  get fit() {
    return fit;
  }
};

void boot().catch(error => {
  useStartupAssets(null);
  loadingScreen.fail();
  console.error('[startup] Artwork could not be prepared', error);
});
