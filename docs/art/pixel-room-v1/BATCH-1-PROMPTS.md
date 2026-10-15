# 首批黑屋素材生成提示词

工具：内置 `image_gen.imagegen`。参考图：`background-draft/room-background-draft-v1.png`，仅作为画风和材质参考。

每个素材独立生成。背景不透明；其余请求真实透明通道。文件检查与实际可用尺寸以最终素材目录的清单为准。

## room-back

透明背景：否

```text
Use case: stylized-concept. Game: Emberveil, a solemn pixel-art browser game set in a cold dark wooden hut. The provided image is a style reference ONLY, not an edit target. Match its cold charcoal, slate and desaturated weathered wood. Deliberately simplified 2D pixel art with crisp square clusters, readable at tiny size; approximately 20 colors; no photorealism, no 3D render, no isometric view, no smooth painted shading, no text, no labels, no watermark.
Asset type: standalone full-room background for layering game sprites. Landscape 16:9. Fixed straight-on side-view cutaway. Render a SINGLE empty modest timber hut, fully visible with a small near-black margin. Strong simple overhead beam, vertical wall planks, dark left doorway opening without a door leaf, small four-pane cold slate window upper center. Flat plank floor lower quarter with only slight depth. Background occupies entire canvas; no UI bands. Right third empty for a separate hearth sprite, middle-left empty for a separate character sprite. Low uniform cool ambient light sufficient to read the architecture. Simplify the reference strongly: large quiet planes, sparse scratches, broad bands of shading, no dense stippling. Pixel clusters should resemble a low-resolution 480x270 scene enlarged. Neutral wood undertone. Background opaque. Absolutely no people, no flames, no hearth, no chimney, no firewood, no props, no furniture, no snow, no trees, no outdoor scenery, no warm light pools. Do not alter the general room layout from the reference.
```

## hearth

透明背景：是

```text
Use case: stylized-concept. Game: Emberveil, a solemn pixel-art browser game set in a cold dark wooden hut. The provided image is a style reference ONLY, not an edit target. Match its cold charcoal, slate and desaturated weathered wood. Deliberately simplified 2D pixel art with crisp square clusters, readable at tiny size; approximately 20 colors; no photorealism, no 3D render, no isometric view, no smooth painted shading, no text, no labels, no watermark.
Asset type: ONE isolated cold stone fireplace sprite with true transparent background. Square canvas, large object centered, generous fully transparent margin, entire object inside frame. Orthographic straight-on front view matching a side-view cutaway room. Simple rustic rectangular fireplace made from dark slate stone blocks, arched black recess open at the front, short horizontal stone hearth base, a modest stone chimney rising above. Overall silhouette taller than wide, width about 65% canvas and height about 80%. The fireplace recess is wide enough for separately animated flames, positioned low in the sprite; recess interior nearly black. Tiny bed of dull charcoal only, no logs or flame. Chipped rough stone but coarse deliberate pixels, no fine realistic texture. Neutral dim cold light, darkest #141820, slate #333c4a and highlight #62656a. No orange anywhere. No glow, no cast shadow or floor plane outside the object, no ground, no background wall, no white or checkerboard baked into the pixels. Visible object opaque; all surroundings real alpha=0.
```

## stranger-huddled

透明背景：是

```text
Use case: stylized-concept. Game: Emberveil, a solemn pixel-art browser game set in a cold dark wooden hut. The provided image is a style reference ONLY, not an edit target. Match its cold charcoal, slate and desaturated weathered wood. Deliberately simplified 2D pixel art with crisp square clusters, readable at tiny size; approximately 20 colors; no photorealism, no 3D render, no isometric view, no smooth painted shading, no text, no labels, no watermark.
Asset type: a 2-by-2 four-frame sprite sheet on a square TRUE TRANSPARENT canvas, four equally sized square cells. No gutters painted, no border and no labels. Exactly one same huddled stranger per cell. Frames in reading order upper-left, upper-right, lower-left, lower-right. Each figure has IDENTICAL scale, clothing, pose and ground contact point relative to its cell. Each is centered horizontally within its cell, ground baseline at about 84% of each cell height, figure width about 62% cell, height about 65% cell. A tiny exhausted anonymous adult woman wrapped in a ragged dark charcoal-grey blanket, sitting on the floor with knees tucked up, hood bowed, facing RIGHT toward a separate fireplace. Face completely in shadow, no readable eyes or detailed face, no weapons or equipment. Broad readable angular silhouette, sparse slate edge highlights and muted brown boots, same palette as reference. Four micro-animation frames: 0 resting huddled; 1 shoulders rise by a tiny amount; 2 shiver with blanket edge subtly displaced; 3 return to rest. Almost all pixels should stay in place between frames; no dramatic pose change, no growth or shrink. Blanket must not trail across cell boundaries. No furniture, no fire, no warm aura, no floor, no ground shadows, no extra people. All empty space alpha=0. This is a clean usable tiny game animation sheet, not character concept art.
```

## fire

透明背景：是

```text
Use case: stylized-concept. Asset for Emberveil solemn pixel-art browser game. Provided image is a style and material reference only. Crisp chunky square pixels, strict straight-on 2D front view, no isometric view, simple coarse color clusters and limited palette, no smooth gradients, no photorealism, no 3D render, no text or labels or border or watermark. True transparent background, not a painted checkerboard or white background.
Create a square 2-by-2 four-frame sprite sheet for a looping fire animation. Four equal square cells, reading order upper-left, upper-right, lower-left, lower-right. ONE stylized cluster of pixel-art flames per cell, no logs, no rocks, no brazier, no smoke, no hearth. Same flame base centered horizontally at y=82% within EACH cell, maximum flame height 65% cell and maximum width 55% cell. Empty gutters and cell boundaries fully transparent. Main center tongue and two smaller side tongues, irregular angular silhouette, 5-7 solid colors from dark red #77322a through orange #d87b42 to pale yellow #f6d28c. Opaque solid flame pixels with clean pixel stairs, no soft halo or aura. Four distinct consecutive moments of the same small campfire: tall center leans left, splits into two tips, tall center leans right, then shorter center. Footprint and base must remain fixed and scale must stay consistent across all four frames. Large transparent margins at least 12% per cell. No sparks far from the main flame, no decorations. Game-ready readable low-resolution sprite design, coarse pixel edges, not a fire photograph.
```

## woodpile

透明背景：是

```text
Use case: stylized-concept. Asset for Emberveil solemn pixel-art browser game. Provided image is a style and material reference only. Crisp chunky square pixels, strict straight-on 2D front view, no isometric view, simple coarse color clusters and limited palette, no smooth gradients, no photorealism, no 3D render, no text or labels or border or watermark. True transparent background, not a painted checkerboard or white background.
Create a square 2-by-2 sprite sheet of THREE inventory states of the SAME woodpile. Equal square cells, reading order: upper-left LOW pile of three logs; upper-right MEDIUM pile of seven logs; lower-left HIGH pile of about twelve logs; lower-right COMPLETELY EMPTY transparent cell. Do not duplicate objects into the fourth cell. Ground contact line in each populated cell y=83%, centers x=50%. Log diameter and perspective identical in all three cells; width about 65% cell; low stack about 22% cell height, medium 38%, high 55%. Short firewood logs stacked sideways, circular sawn ends visible at the front, dark desaturated brown bark and muted tan end grain. Cut ends have one or two coarse rings only. They sit loosely in a triangular stack. Fixed orthographic front view, restrained coarse pixel texture, match the weathered hut reference without adding surrounding room. Three piles need to stay inside own cells with plenty of transparent padding. Absolutely no flames, no glow, no orange lighting, no axe, no base, no floor, no shadow on background. All empty space alpha=0.
```

## door-closed

透明背景：是

```text
Use case: stylized-concept. Asset for Emberveil solemn pixel-art browser game. Provided image is a style and material reference only. Crisp chunky square pixels, strict straight-on 2D front view, no isometric view, simple coarse color clusters and limited palette, no smooth gradients, no photorealism, no 3D render, no text or labels or border or watermark. True transparent background, not a painted checkerboard or white background.
Create ONE isolated closed rustic wooden door leaf sprite, vertically rectangular with horizontal top and bottom edges, square overall canvas and generous fully transparent margins. Door leaf width about 48% of square canvas, height 82%, centered horizontally, bottom at y=91%. Straight-on front view, no perspective at all. Five or six rough vertical dark timber planks joined into a rectangular door, simple black iron strap hinges on LEFT and small black iron latch on RIGHT. No ornate studs, no carvings, no door frame, no wall, no threshold, no hinges protruding far outside leaf. Neutral dim cool light, desaturated wood #565044, dark slate shadows, coarse pixel highlights. Board silhouette opaque all the way to its rectangular edge so it can cover a dark doorway. Real transparent alpha outside the leaf. No glow, no warm light, no blue aura, no cast shadows, no background. Keep material quiet, minimal scratches, readable when rendered about 55x105 logical pixels.
```



