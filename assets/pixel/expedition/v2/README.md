# 远行 v2：独立装备与早期敌人

2026-10-16。内置 `image_gen.imagegen` 生成；五个 PNG 原样复制到本目录，不覆盖 v1。实际提示词见 [PROMPTS.md](PROMPTS.md)，透明比例、SHA-256、裁取与逻辑尺寸见 [manifest.json](manifest.json)。

| 源图 | 原始尺寸 | 接入内容 |
| --- | --- | --- |
| [traveler-body.png](traveler-body.png) | 1536 × 1024 RGBA | 无武器的待机、攻击、受击身体；北/南/东地图姿态，西向镜像 |
| [weapons.png](weapons.png) | 1774 × 887 RGBA | 骨矛、铁剑、钢剑、步枪、流星索及子弹；独立附着到身体手部 |
| [early-enemies.png](early-enemies.png) | 1536 × 1024 RGBA | 瘦弱男子、怪鸟、双头生物，每种待机/攻击/受击三姿态 |
| [field-battle.png](field-battle.png) | 1672 × 941 RGB | 无人物草原背景，运行时 576 × 324 |
| [barrens-battle.png](barrens-battle.png) | 1672 × 941 RGB | 无人物荒地背景，运行时 576 × 324 |

继续使用 v1 森林背景与咆哮野兽，地图复用既有树木/村庄图标。旧版持矛旅人不再加载；本轮没有把新武器烘焙进人物身体，空手真正不画装备。身体和装备通过手部锚点合成，三种身体姿态配短位移，不声称拥有每种武器独立的完整动作帧。步枪子弹与流星索在出手时有短暂飞行表现；减少动态效果时不画飞行。地图人物仍是三向静态姿态，未交付连续行走帧。

双头生物初稿的攻击姿态误有三颗头，经同一内置工具定向编辑后采用本版；不使用初稿。原图布局没有严格服从等分列，尤其长矛和步枪横向较长；裁取脚本用实测边界，不按理论网格强切。透明图分别有约 73.2%、87.7%、63.4% 全透明像素。运行时复用既有 alpha 加权 box 采样与 0.5 阈值。

重建清单：`node scripts/inspect-expedition-equipment.mjs <含 sharp 的 node_modules 目录>`。脚本只读 PNG，检查透明背景、非空轮廓及裁取分区边界，重建 manifest，不修改源图。手部锚点与身体逻辑高度随 manifest 管理。

[打开独立样片](http://127.0.0.1:5184/docs/art/pixel-expedition-v1/)；[实现、规则和验收](../../../../docs/engineering/phase7-expedition-equipment.md)。
