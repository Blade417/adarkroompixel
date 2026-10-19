# 远行 v8：野外遭遇与特殊地点

内置 `image_gen.imagegen` 生成，保留八张原始 PNG，其中七张用于运行时、14 项裁取。没有本地重绘、抠图、缩放或拼接源图；完整生成及编辑提示词见 [prompts.json](prompts.json)。

| 文件 | 内容 | 实际尺寸 |
| --- | --- | --- |
| wild-shivering.png | 颤抖男子，待机/向左攻击/受击 | 1774×887 |
| wild-man-eater.png | 食人兽，三姿态 | 2172×724 |
| wild-feral-terror-spaced.png | 狂野恐兽，三姿态，扩大间距的接受版 | 1983×793 |
| special-swamp-elder.png | 沼泽木屋内盘坐的老流浪者 | 1536×1024 |
| special-cache-landmark.png | 被毁村庄，地图与入口两种比例 | 1536×1024 |
| special-swamp-cabin.png | 无人物的苔藓木屋内部 | 1672×941 |
| special-cache-interior.png | 无人物的废村储物棚内部 | 1672×941 |

`wild-feral-terror.png` 为姿态水平范围重叠的初稿，仅保留生成过程；运行时裁取使用 `-spaced` 编辑版，构建资源匹配也排除初稿。其余五张人物/地标接受图具有透明通道，两张完整背景为 RGB。

[manifest.json](manifest.json) 记录七张接受图的 SHA-256、尺寸、透明比例、实际裁取边界与等比例逻辑尺寸。三敌人九姿态、老人、地标两比例及两背景共 14 项。脚底沿用底部居中，透明阈值 0.5；老人是地点居民，不进入战斗或战利品逻辑。

在项目根目录用带 Pillow 的 Python 执行 `scripts/inspect-wild-special-art.py` 可重建清单；脚本只读取 PNG 像素。透明图按实际间隔检测，没有假定等宽三列。完整背景缩放到 576×324，接受原图比例的微小舍入误差。实机证据与规则边界见 [阶段十四](../../../../docs/engineering/phase14-wild-special.md)。
