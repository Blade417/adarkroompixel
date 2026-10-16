# 首次远行 · 森林样片资产

后续已新增 [v2 独立装备与早期敌人](../v2/README.md)。当前入口仅继续加载本目录的森林背景和野兽；持矛旅人图集保留为首版历史资产，不再打包。以下为首版交付记录。

2026-10-16。使用内置 `image_gen.imagegen` 生成，原始 PNG 原样复制进项目；没有离线重绘、抠图或覆盖旧素材。提示词见 [PROMPTS.md](PROMPTS.md)，实际尺寸、透明比例、裁切、逻辑显示尺寸和 SHA-256 见 [manifest.json](manifest.json)。

| 文件 | 原始尺寸 | 本次交付 |
| --- | --- | --- |
| [forest-battle.png](forest-battle.png) | 1672 × 941，RGB | 无人物的林间战斗背景；逻辑显示 576 × 324 |
| [traveler.png](traveler.png) | 1536 × 1024，RGBA | 战斗待机/刺击/受击三姿态，世界地图北/南/东三向；西向为东向镜像 |
| [beast.png](beast.png) | 2172 × 724，RGBA | 咆哮野兽待机/攻击/受击三姿态 |
| [beast-draft.png](beast-draft.png) | 2142 × 734，RGBA | 历史初稿，分帧间距不足；保留过程但不由加载器引用或打包 |

旅人有效全透明像素约 80.1%，野兽约 76.1%；运行时使用既有 alpha 加权 box 缩小与 0.5 阈值烘焙透明精灵，背景使用 mode 缩小。原图有半透明边缘，交付 PNG 不做二次编辑。依据实际轮廓裁取，人物不能按等宽三列直接裁切：刺击的长矛越过了理论单元格，需要独立 sourceRect。三个姿态按身体而非武器顶端校准逻辑比例；长矛姿态使用单独脚底位置。三姿态是最小演出，不声称已经交付连续行走帧。

地图树木复用 `assets/pixel/village/v2/trees.png`，村庄小图标复用 v1 生火间；均在运行时按原裁切来源再采样。迷雾、地面噪点、足迹、血条和罗盘由程序绘制。尚未新制可平铺森林地块、洞口图标、其他地形或其余敌人；这些仍在工作单中。

`node scripts/inspect-expedition-art.mjs <含 sharp 的 node_modules 目录>` 可只读检查原图并重建清单，不改 PNG。样片加载器显式列出三个最终 PNG，避免将初稿纳入正式产物。

样片：[开发预览](http://127.0.0.1:5184/docs/art/pixel-expedition-v1/)；完整交互与边界见[样片验收记录](../../../../docs/engineering/phase7-expedition-slice.md)。
