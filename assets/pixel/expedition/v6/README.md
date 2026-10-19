# 战舰远行 v6：分区与舰内敌人

第十二阶段素材，使用内置 `image_gen.imagegen` 生成。12 个源 PNG 原样保存；运行时按实测边界裁取，保持比例缩小，沿用 576×324 场景及底部中心锚点。

- `warship-crew.png`：特工、研究员、不朽流浪者，三列三姿态。
- `warship-infestation.png`：仅使用第一列甲壳怪物、第三列古老野兽。首稿女王的上下姿态有重叠，弃用中列。
- `warship-queen.png`：重新生成并经内置编辑增加间距的甲壳女王，横向三姿态，替代首稿中列。
- `warship-security.png`：机械守卫、机械四足兽、故障医疗机；裁取边界按实际外沿确定，避免邻列伸出部分串帧。
- `warship-machinery.png`：自动炮塔、防御炮塔、失控焊接机。
- `warship-combat-bosses.png`：不稳定原型机、杀戮机器人；`warship-medical-bosses.png`：不稳定自动机、畸形实验体。
- 五张独立背景：电梯前厅、工程翼、军事翼、医疗翼、指挥甲板。每个区域的房间仍共用本区背景，战舰入门内部沿用 v5 走廊。

合计 16 类敌人的 48 个待机/攻击/受击姿态，加五张背景，共 53 项。敌人朝向旅人；透明背景、alpha、尺寸、SHA-256 与比例裁取记录于 `manifest.json`。源图未在本地重绘、去背或拼接。

`prompts.json` 保存完整提示词及修正原因。仓库根目录执行 `python scripts/inspect-warship-art.py`（需要 Pillow）可只读检查源图并重建清单。跨版本源文件名保持唯一。

工程、规则修复与实机证据见[第十二阶段说明](../../../../docs/engineering/phase12-warship.md)。后期武器分层、护甲人物、连续行走等仍待后续阶段。
