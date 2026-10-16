# 四区七设施生产素材

2026-10-16。对照本地原版 `adarkroom/script/room.js`、`outside.js`、`world.js` 后，确认四个外围分区需要覆盖七种村内功能建筑。原版覆盖与空间安排见[核对说明](../../../../docs/engineering/village-original-coverage.md)。

使用内置 `image_gen.imagegen`，以 v1 住宅为材质和镜头参考，生成两张独立透明 PNG 图集。原始文件原样复制入项目，保留真实 alpha；没有离线抠图、调色或重绘。

| 原图 | 尺寸 | 图块 |
| --- | --- | --- |
| `public-zones.png` | 1536 × 1024，RGBA | 猎屋、工坊、制革坊、贸易摊 |
| `public-annexes.png` | 1536 × 1024，RGBA | 熏肉房、炼钢厂、军械库；右下留空 |

完整提示词：[四区基础设施](prompts/public-zones.txt)、[原版补充设施](prompts/public-annexes.txt)。源图 SHA-256、实际裁取范围和显示尺寸见 [manifest.json](manifest.json)。按实际剪影裁取后，以 alpha 加权 `box` 缩小并应用 0.5 阈值，去除半透明边缘，保持像素边界。最终尺寸各自保持原图比例，不统一拉伸成同一个方框。

四区共七个独立地块，设施数量分别读取原版的 `lodge`、`workshop`、`steelworks`、`armoury`、`tannery`、`smokehouse`、`trading post`。未建保留空地和木桩，示意页可显示全部外观；不会免费获得建筑、岗位或收入。

画幅扩至 576 × 324，住宅仍沿用原显示大小。v1 建筑与 v2 独立树木继续复用，v2 无树土地等比铺满新画幅。渲染器按设施实际尺寸摆放，地形模型按更保守的预留范围避让树木与道路。仅验收桌面。
