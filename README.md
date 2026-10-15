# 余烬之境 · 像素版（Emberveil Pixel）

《A Dark Room》（小黑屋）的像素画面版本：保留原作的规则与故事，场景是 480 × 270 的侧视像素小屋，按整数倍、最近邻方式显示；日志、设置与场景交互热区用 HTML。

> 原作：[doublespeakgames/adarkroom](https://github.com/doublespeakgames/adarkroom)，Michael Townsend（Doublespeak Games）开发，MPL-2.0。原版源码、官方翻译与音频保存在 [`original/`](./original/)。规则核心迁自相邻的 3D 重制项目 `adarkroomnew`。

## 进度

| 阶段 | 状态 |
|---|---|
| 第一阶段：黑屋（生火、添柴、火力衰减、温度、陌生人到来、读档恢复） | ✅ 已完成实际试玩；炉膛直接交互与恢复后的连续推进已接入（[工程说明](./docs/engineering/phase1.md)） |
| 森林 | ✅ 近林拾柴原型已接入：点门出发、枯枝／倒木采集、路标回屋、冷却与地点存档（[工程说明](./docs/engineering/phase2-forest.md)） |
| 首批制作 | ✅ 点击建造者或顶部“制作”：手推车提升拾柴收益、陷阱制作与森林检查，含材料、上限与存档（[工程说明](./docs/engineering/phase3-building.md)） |
| 村庄及之后的地点 | 后续阶段（规则核心已迁入） |

当前负责人：根据用户 2026-10-15 的安排，Codex 接手后续工程、美术、交互与验收。Claude 已完成第一阶段基础工程与规则迁移。已有文档中的原分工保留为历史记录（[黑屋美术说明](./docs/art/pixel-room-v1/README.md)）。

## 开发

持续记录见[开发日志](docs/development-log.md)，包含本轮交付、规则取舍、验证结果与遗留事项。

最近一轮：[手推车与陷阱的场景融合调整](docs/art/pixel-workshop-v2/README.md)。首版素材与交互见[屋内手推车、陷阱](docs/art/pixel-workshop-v1/README.md)，制作规则见[手推车与陷阱](docs/engineering/phase3-building.md)，此前记录见[序章试玩与引导修复](docs/engineering/opening-playtest-2026-10-15.md)。

需要 Node.js 20.19+。

```bash
npm install
npm run dev         # 开发服务器 http://localhost:5174/
npm run build       # 类型检查 + 生产构建 → dist/
npm run preview     # 预览生产构建 http://localhost:4174/
npm run check       # 类型检查 + 全部测试
npm test            # 只跑测试
npm run typecheck   # 只做类型检查
```

`dist/` 使用相对路径，可以放在任意静态目录下；需要通过 HTTP 打开（`file://` 下浏览器不加载模块脚本）。

## 操作

| 操作 | 作用 |
|---|---|
| 直接点击炉膛或按 F | 生火或添柴（同一个核心动作，共用冷却） |
| 点击木门／归途路标 | 森林解锁后出门／回屋；顶部地点导航同样可用 |
| 点击森林枯枝／倒木 | 分别获得 4／8 木头，20／45 秒后恢复；Tab、Enter 也可操作 |
| 点击建造者或顶部“制作” | 人物只在悬停／聚焦时提示；打开制作面板，Esc 关闭 |
| 点击屋内已制作的手推车／陷阱 | 查看对应详情，可从详情前往森林拾柴／检查陷阱 |
| 制作手推车后拾柴 | 枯枝／倒木分别变为 20／40 木头，采集间隔不变 |
| 制作陷阱后，在森林点“检查陷阱” | 收取猎物，90 秒后可再次检查；数量与剩余冷却随存档保留 |
| 空格 / 回车 | 焦点不在其他控件上时，同上 |
| 1–9 | 事件中选择对应的按钮 |
| Esc | 关闭设置、取消重新开始、跳过陌生人到来 |

炉膛没有常驻文字按钮：初次进入有短暂引导，悬停或键盘聚焦时显示操作与消耗；冷却在炉台下方用细线表示，拒绝与成功反馈出现在炉边。陌生人恢复后，在温暖房间中休息 12 秒会自然开始帮忙，无需刷新页面。

设置中可以切换语言（中文 / English）、声音开关和动态效果（跟随系统 / 减少 / 完整），导出 / 导入存档码，或重新开始。

## 调试参数

- `?debug`：调试面板。显示帧率、布局模式、缩放倍数、DPR、采样算法和仍在使用的占位素材；可以直接设置木头、毛皮、火力、温度、陌生人等级，快进时间，重播陌生人到来，触发事件，显示锚点，清除存档。
- `?sample=mode|box|nearest`：素材缩小算法，默认 `mode`。

两者可以组合，例如 `http://localhost:5174/?debug&sample=box`。

## 存档

| 键（localStorage） | 内容 |
|---|---|
| `emberveil.pixel.save` | 游戏存档 |
| `emberveil.pixel.prefs` | 设备偏好：语言、声音、音量、动态效果 |

与 3D 版的键不同，同源预览时互不覆盖。

## 目录

| 路径 | 说明 |
|---|---|
| `original/` | 原版源码（只读）：剧情脚本、官方翻译、音频；`original/audio` 是 Vite 的静态目录 |
| `src/core/` | 无界面游戏核心，迁自 `adarkroomnew`（不得使用 DOM，测试会检查） |
| `src/pixel/` | 像素画面：素材烘焙、布局与锚点、状态映射、光照、粒子、陌生人到来、整数缩放、渲染器 |
| `src/ui/` | HTML 界面：标题、日志、库存、生火控件、事件、设置、调试面板 |
| `src/app/` | 浏览器适配：剧情加载、偏好设置、音频 |
| `src/i18n/` | 补充的中文翻译 |
| `src/main.ts` | 启动、布局、主循环 |
| `assets/pixel/room/v1/` | 黑屋素材与 `manifest.json`（美术交付，工程侧只读） |
| `docs/art/` | 美术方向与交接说明 |
| `docs/engineering/` | 工程说明 |
| `tests/` | 规则测试、随机游玩测试、像素层测试 |

## 许可

原作代码与资源遵循 MPL-2.0（见 [LICENSE.md](./LICENSE.md)），本版本同样以 MPL-2.0 发布。
