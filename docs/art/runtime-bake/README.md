# 无损运行素材

默认画面使用六张预烘焙、无损 WebP 图集。图集保留旧浏览器处理路径产生的实际显示像素，包含全部场景和动画；原始 PNG、裁切描述及 `box` / `nearest` 调试路径保留。

不能将此过程称为原始高分辨率图片的可逆压缩：图集保存的是游戏此前就会缩小得到的像素。发布前应以本工具逐帧比较 RGBA 数组，验证游戏实际画面没有变化。半透明火焰的 RGBA 另存于元数据，避免浏览器图片解码预乘舍入造成一个色阶的偏差。

## 重新生成

1. 安装开发依赖；本地 Python 需有支持 WebP 的 Pillow。运行 `python scripts/runtime-art-server.py`，写入端仅监听 `127.0.0.1:4182`，只接受来源 `http://127.0.0.1:5175`。
2. 用 Vite 启动 `127.0.0.1:5175`，关闭 HMR，避免写入新图集时打断生成过程。例如在 Node 模块脚本中调用：

   ```js
   import { createServer } from 'vite';
   const server = await createServer({ server: { host: '127.0.0.1', port: 5175, strictPort: true, hmr: false } });
   await server.listen();
   ```

3. 打开 `/docs/art/runtime-bake/index.html`，点击“生成运行素材”。工具调用原有素材处理函数，在浏览器生成图集；本地接收端以无损 WebP 编码，并比较 PNG 与 WebP 解码后的 RGBA。
4. 完成后重新打开本页，点击“校验运行素材”。必须显示 `identical: true`、`differingChannels: 0` 才可发布。报告和中间 PNG 在忽略的 `.runtime-art-build/` 中。
5. 提交 `assets/pixel/runtime/v1/` 的图集和清单。单元测试会检查原始文件、处理算法与图集的 SHA-256，避免原图或处理方式更新后继续使用旧图集。

## 启动行为

游戏首次进入会下载并解码全部六张图集，显示真实响应字节驱动的资源进度和各场景状态，处理完成后才开放开始或继续。失败或 45 秒无数据会显示重新加载入口，不会用计时器伪造进度。后续切换场景复用已经准备好的小画布，音频仍按现有方式加载。
