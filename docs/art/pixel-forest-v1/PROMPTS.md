# 森林首批素材生成提示词

日期：2026-10-15。工具：内置 `image_gen.imagegen`，五件素材分别生成。背景为不透明 PNG，前景与物件请求真实透明通道。原始生成文件保留在项目素材目录，没有离线重绘、抠图或尺寸改写。参考黑屋现有的冷灰、旧木材和像素簇画风；未使用额外图片作为编辑目标。

## forest-back

透明背景：否

```text
Use case: stylized-concept. Asset type: production background layer for the pixel-art browser game Emberveil, companion to a gloomy weathered timber cabin. Generate one landscape 16:9 PNG forest background, ideally 1672x941 or similar 16:9. Camera: eye level looking across a shallow forest clearing, 2D side-on stage with slight ground depth, NOT top-down, NOT isometric. Final logical viewport 480x270. Ground contact line around y=210/270, forest horizon around y=155/270. Foreground bottom fifth is dark earth with sparse muted blue gray frost and dry leaves, level unobstructed clearing between x=80 and x=420 logical px. A faint path leads off to the LEFT for returning home. Dense bare pine trunks and spruce silhouettes further behind the clearing, layers fading into cold charcoal-blue mist, no foreground trunks blocking center. Practical room for future loose branch prop at logical (206,213), fallen log (313,212), return marker (128,209). Those objects MUST NOT be painted into this background. Palette deliberately narrow and desaturated: near black #0c1117, dark slate #1b252d, mist #34414a, weathered bark #51483d, frost #727e83 in small patches. Maintain readability at low brightness; darkest foreground and brighter mid-distance. Style: mature hand placed pixel-art cluster work, hard stair-stepped edges, restrained dithering, rough weathered materials, no smooth brush strokes, no photorealism, no 3D render, no vector cartoon, no excessive outline. Pixels about 3-4 source pixels corresponding to a 480x270 logical scene, no blurry antialiasing. Quiet hostile winter dusk/night, no full moon, no bright sky, no saturated blues, no white snow blanket, no stars, no buildings, no people, no animals, no UI, no text, no borders, no collectible branches or fallen log or sign painted into ground. Entire image opaque, extends to all four edges, no vignette frame. Deliver the background only.
```

## forest-foreground

透明背景：是

```text
Use case: stylized-concept. Asset type: transparent foreground framing layer for Emberveil pixel forest. One full landscape 16:9 transparent PNG, final logical viewport 480x270. Two extremely dark weathered pine trunk silhouettes and sparse bare twigs cling ONLY to the far left 0-10% and far right 90-100% edges; tiny low roots at bottom two corners. Preserve a completely transparent central 80% of the canvas with NO ground or fog. These are cropped near-camera framing trees, not a complete forest. They are intended to overlay a cold night forest clearing without covering any center collection targets. Mature 2D hand clustered pixel art, hard square stepped edges, low resolution ~480x270 enlarged, crisp no antialiasing, no photorealism no 3D no painterly gradients. Restrained bark texture in charcoal #0b1016 #151b21 #252c30 with minimal dark muted brown, entirely dark enough to sit in front of slate #34414a mist. Very sparse textures. No moss green, no snow white. Actual alpha=0 background, no checkerboard, no white background, no labels no text no icons no UI no glow. Full canvas framing must retain its composition; do not center a single tree.
```

## loose-branches

透明背景：是

```text
Use case: stylized-concept. Asset type: ONE isolated clickable loose-firewood sprite for Emberveil, on TRUE TRANSPARENT square PNG. Exactly one low irregular cluster of 5-7 naturally fallen dry sticks with broken forked tips, uneven lengths, some overlapping, NOT tied, NOT a neat bundle, NOT chopped log rounds. Whole object centered with 12% clear transparent margin, side view with slight view of the top matching eye-level forest clearing ground. Horizontal silhouette approximately 2.5:1 width to height. Final intended logical size around 64x26 pixels, so simple bold readable shapes. Hard stair-stepped pixel edges, deliberate coarse pixel clusters, restrained 16-24-color art, no smooth painterly shading, no photorealism, no 3D, no vector style. Weathered cold gray-brown bark #3b3731 #544a3e, restrained pale broken ends #8b7960, slate edge light #6b7374, minimal near-black crevices. Desaturated and bleak night forest, enough edge contrast against #1b252d dark earth, NO orange candy-colored log ends. No ground plane, no floor patch, no ground shadow beyond silhouette, no leaves pile, no stones, no snow clump, no person, no tools. All outer pixels genuine alpha=0, no opaque backdrop, no baked checkerboard, no lettering or UI.
```

## fallen-log

透明背景：是

```text
Use case: stylized-concept. Asset type: ONE isolated fallen deadwood harvestable object sprite for Emberveil pixel forest. TRUE TRANSPARENT square PNG. One short thick naturally BROKEN fallen tree section lying almost horizontally, slight diagonal slope, rough cracked dark bark, one modest visible gray-tan fractured end facing slightly left, two short snapped branch stubs. Not a lumber stack, not multiple log rounds, no axe. Low wide silhouette about 2.8:1, full object inside frame with 12% transparent margin; side-on with slight top plane consistent with eye-level clearing. Intended in-game draw width about 100 logical pixels. Stylized mature pixel art like a weathered gloomy timber cabin, strong hard stepped clusters, sparse material marks, approximately 20 muted colors. No realistic microtexture, no painted blur, no 3D or isometric, no cartoon outline. Palette charcoal crevices #171b20, dark muted bark #393b38, weathered brown #554d41, cut/broken wood #8c7c62 kept gray and low saturation, cold slate highlights #647071. Silhouette readable on dark #1b252d dirt. No bright orange wood, no fresh bright green moss, no foliage, no stump attached to ground, no floor, no cast shadow beyond the object. Actual transparent alpha surrounds the object; no white/checkerboard, no words or UI.
```

## home-marker

透明背景：是

```text
Use case: stylized-concept. Asset type: ONE isolated environmental return-home marker sprite, TRUE TRANSPARENT square PNG, for Emberveil gloomy pixel forest. A short rough weathered wooden post with one broad arrow-shaped wooden plank POINTING LEFT; a very small worn piece of muted rust ochre cloth tied just below the plank gives a subtle warm navigation cue. No lantern, no flame, no fantasy ornaments. No lettering or pictogram on the wood. Single marker fully visible centered with generous transparent margin, front-side view with slight depth matching eye-level side-view forest clearing. Overall silhouette taller than wide, intended draw size about 34x64 logical pixels. Practical quiet handcrafted rustic object, not a game HUD icon. Mature pixel art with crisp hard stair-step edges, broad deliberate clusters, only about 16 colors, dark gray brown wood #36352f #51483d #756957 and muted cloth #8c6540, sparse cold slate edge #6a7477. Maintain readable silhouette on dim forest without neon or thick black cartoon outline. No photorealism, no 3D render, no isometric, no smooth illustration, no background, no ground patch, no roots or shadows beyond post bottom, no snow base. True alpha=0 outside marker, no white or baked checkerboard; no text labels numbers watermark.
```

