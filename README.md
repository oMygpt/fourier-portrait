# 圆周之间 · Fourier Portrait

无需构建、完全在浏览器内运行的傅里叶人像绘图工具。暖金色夜间观星室，中文界面，支持手机。原生 HTML / CSS / ES 模块，无运行时框架或服务端。

## 使用

在本目录执行 `python3 -m http.server 8080`，访问 http://localhost:8080 。因为使用 ES 模块，请通过 HTTP 打开，而非双击 HTML 文件。

1. 首页默认以傅里叶本人的肖像演示。点击「上传你的照片」或拖入本地 JPG / PNG；也可选择傅里叶、爱因斯坦、牛顿、居里夫人、欧拉或高斯。
2. 照片先渐变成黑白 **AI 线条画**，再显现等距轮廓点，最后唤醒圆周并绘制。可随时切换「原图 / 线条画 / 傅里叶绘制」。默认「清晰轮廓」，也可选「素描线稿」或无需模型的「经典算法」。
3. 绘制时可暂停/继续或直接看完成图。结果页可重新播放、保存人像 PNG 或换照片。
4. 展开「微调这场相遇」：调整线条风格/粗细、轮廓细节（松开重新处理）、圆数量（从头重绘）、速度，以及原图叠加和旋转圆。也可单独下载黑白线条画 PNG。扫描拼图或复杂背景可点击「调整取景」，在原图上拖选需要的区域（手机也支持），再运行完整绘制；换图即可回到未裁剪原图。
5. 向下展开公式，或点击「揭开公式」，可查看数学说明及当前幅值最大的四个傅里叶系数。

系统开启「减少动态效果」时，不循环播放首页，不旋转绘制，缩短转场并直接呈现结果。保存人像 PNG 不含原图、星尘或辅助圆；线条画导出为白底黑线。

建议使用背景简洁、对比清晰的肖像。无边缘或损坏图片会显示中文提示。非常大的图片解码仍可能受设备内存限制。

## 数学与处理流程

### 分享你的公式画像

完成后点击「制作我的公式分享卡」，可选昵称（最多 16 个字符）、3:4（1080×1440）或 9:16（1080×1920）。卡片重新渲染高分辨率完整肖像、公式摘录和本地生成的二维码，可保存 PNG、系统分享（支持文件时）或复制链接。QR 编码器为本地 vendored [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（MIT），不依赖 QR CDN。

扫码链接的 `#p=` fragment 仅含数学系数、笔画抬笔位图、尺寸和可选昵称，不含照片，也不上传到服务器。**这不是加密**：持有链接的人可以查看与转发画像，请勿在昵称写入隐私信息。分享链接使用当前页面的域名与路径；正式分享请从已部署的 GitHub Pages 页面生成，本地 localhost 链接仅用于本机验证。

二进制 v1：魔数/版本/模式、采样数和尺寸、每链条目数、幅值标尺、能量比例、UTF-8 昵称、每个采样点的抬笔位、幅值排序的频率 int16 + 对数幅值 uint8 + 相位 uint8。XY 利用实数共轭对减少体积，解码时恢复成两条实数链。总 URL 限制 2000 字符，按能量优先分配剩余系数容量，不需要 CompressionStream。卡片采用当前完整系数，扫码版可能省略细节以保持二维码可扫；二维码与卡片链接完全一致。无效或未知版本链接会显示错误并退回普通创作流程。

分享页跳过上传，直接演示系数重建，再大幅展示画像、公式与「生成我的傅里叶画像」入口。LaTeX 下载保留完整当前系数，不受二维码预算影响。

### 双轴计算与自动项数

默认「双轴 XY」：分别对实数序列 xₙ、yₙ 计算 DFT，按各自幅值排序。上方圆链角度偏移为 0，水平投影给出 x(t)；左侧圆链偏移 π/2，纵向投影给出 y(t)。两条琥珀色虚线交点就是画笔，笔画间抬笔时圆链仍继续运动。可切换「复平面单链」保留原来的复数绘制。圆数量滑块应用于每条链；两种模式均支持原图叠加、隐藏圆、速度和 PNG 导出。

$$X_k=\frac1N\sum_n x_n e^{-2\pi i kn/N},\quad Y_k=\frac1N\sum_n y_n e^{-2\pi i kn/N}$$
$$x(t)=\operatorname{Re}\sum_k X_ke^{2\pi ikt}=\sum_k|X_k|\cos(2\pi kt+\arg X_k)$$
$$y(t)=\operatorname{Re}\sum_k Y_ke^{2\pi ikt}=\sum_k|Y_k|\cos(2\pi kt+\arg Y_k)$$

每张新图片自动为 X、Y 和复数模式分别选择最少项数（至少 8 项，最多为现有项数）：累计能量 ≥99%，且在采样路径上平均重建误差 ≤1.5px。误差采用最长边 590px 的统一参考绘图尺度，双轴布局实际可能更小，因此这一误差标准更保守。手动调整后可点击「恢复自动」。自动的 X、Y 项数可不同，手动滑块则同时指定每条链的项数。

结果下方预览每链前 8 项，可「保存公式 (LaTeX)」下载当前模式和当前项数的完整数值公式，也可「复制公式」复制方程体。文件使用 article、ctex 和 amsmath，请用 **XeLaTeX** 编译。系数约三位有效数字，实际绘制使用未舍入系数；长公式按项分行。PNG 只保存已画轨迹，不含圆链、导线或原图。

默认：白色补边为正方形 → 等比缩放至 512×512 → informative-drawings（contour / anime，RGB float32 NCHW）→ 裁掉补边、还原原图比例并将最长边缩至 400px → Otsu 自适应阈值与细节偏移 → 连通区域去碎点 → Zhang–Suen 细化 → 8 邻域笔画描摹（保留闭环、在分叉处分段）→ 去除短笔画 → Ramer–Douglas–Peucker 简化 → 贪心最近端点排序（允许反转）→ 闭合路径沿弧长均匀重采样为 1800 点 → DFT。细节滑块同时调节阈值和最短笔画长度，抑制服装纹理。AI 模式使用中央偏上的椭圆形肖像先验，保留更短的眼鼻笔画，外围采用更强过滤；这不是人脸检测，偏离中央的肖像可先调整取景。

六位名人的两种 AI 线稿已预计算为 `samples/*-contour.png` / `*-anime.png`，选择样例不需要下载模型。上传或裁剪照片时才懒加载本地模型，Worker 里优先尝试 WebGPU，设备不支持时使用单线程 WASM。细化、笔画排序、DFT 和自动 N 的计算也放在独立 Worker 中，避免阻塞界面。首次模型下载显示百分比；Cache API 保存的只是公共模型，不保存照片；第二次访问可复用，当前会话也复用推理 Session。30 秒超时或模型失败自动退回 XDoG，也可点击「无需等待 · 立即使用经典算法」。

`models/` 两个 fp32 模型各约 17MB（均小于 GitHub Pages 单文件 100MB），保留已验证的 WASM 数值与画质，未做未验证的 fp16/int8 转换。onnxruntime-web 1.20.1 与实际使用的 JSEP WASM/MJS 自托管于 `vendor/ort/`，模型、运行时、KaTeX、QR 与 UI 字体均不依赖 CDN。总静态资源约 58MB；字体为 UI 字符子集，昵称中其他字符使用系统字体。预计算使用相同补边/裁剪与 fp32 模型，构建产物已经入库，无需在部署时运行 Python。

备用的经典 XDoG 采用 Winnemöller 等（2012）的扩展高斯差分思想，归一化亮度为 I：

$$D=(1+p)(G_\sigma * I)-p(G_{k\sigma}*I)$$

$$T(D)=\begin{cases}1&D\ge\epsilon\\1+\tanh(\phi(D-\epsilon))&D<\epsilon\end{cases}$$

经典模式以 0.5 二值化为黑白素描，再将去除短碎线、简化后的笔画重绘为干净的白底黑线，作为可预览和下载的线条画。「线条风格/粗细」在经典模式联动 sigma、k、p、epsilon、phi，在 AI 模式联动二值化阈值；「轮廓细节」同时调节阈值和最短笔画长度。没有服务器 API 或 OpenCV 依赖。笔画描摹与最近端点排序思路启发自 [LingDong-/linedraw](https://github.com/LingDong-/linedraw)（MIT，Copyright © 2017 Lingdong Huang），阅读其 `linedraw.py` 与 `strokesort.py` 后独立实现；未引入 Python 运行时依赖。

把轮廓点视作复数：

$$z_n=x_n+i y_n$$

离散傅里叶系数：

$$c_k=\frac{1}{N}\sum_{n=0}^{N-1}z_n e^{-2\pi i kn/N},\quad k=-\lfloor N/2\rfloor,\ldots,\lceil N/2\rceil-1$$

按系数幅值降序排列，选前 M 项（集合记作 K_M）：

$$z(t)\approx\sum_{k\in K_M}c_k e^{2\pi i kt},\quad t\in[0,1]$$

其中 $|c_k|$ 是圆半径，$\arg(c_k)$ 是初始相位，$k$ 为旋转频率，正负表示相反方向。零频项对应整体位置。保留越多项，越接近原始采样轮廓。页面用 KaTeX 渲染公式，无网络时仍显示文字公式。

这是单路径近似，并非语义人脸识别。笔画之间的移动仍属于闭合路径与 DFT；绘制时在已标记的跨笔画连接段抬笔，减少难看的直线穿越（不是对连接段另做傅里叶变换）。低项数仍可能偏离原始线条。最近端点排序和直接 DFT 都有二次复杂度，因此限制采样数量。图像坐标 y 轴向下，与教科书复平面的视觉旋转方向相反，但公式一致。

## 名人肖像与鸣谢

以下 Wikimedia Commons 图像均标记为公有领域。仓库仅含压缩肖像与缩略图，选择样例也运行与上传相同的线条画和傅里叶流程。没有把测试照片打包进项目。

| 人物 | 来源 |
| --- | --- |
| 傅里叶 | [Fourier2.jpg](https://commons.wikimedia.org/wiki/File:Fourier2.jpg) |
| 爱因斯坦 | [Albert_Einstein_Head.jpg](https://commons.wikimedia.org/wiki/File:Albert_Einstein_Head.jpg) |
| 牛顿 | [GodfreyKneller-IsaacNewton-1689.jpg](https://commons.wikimedia.org/wiki/File:GodfreyKneller-IsaacNewton-1689.jpg) |
| 居里夫人 | [Marie_Curie_c1920.jpg](https://commons.wikimedia.org/wiki/File:Marie_Curie_c1920.jpg) |
| 欧拉 | [Leonhard_Euler.jpg](https://commons.wikimedia.org/wiki/File:Leonhard_Euler.jpg) |
| 高斯 | [Carl_Friedrich_Gauss_1840_by_Jensen.jpg](https://commons.wikimedia.org/wiki/File:Carl_Friedrich_Gauss_1840_by_Jensen.jpg) |

## AI 模型与运行时鸣谢

- [carolineec/informative-drawings](https://github.com/carolineec/informative-drawings)，Chan et al., CVPR 2021，MIT（见 `models/LICENSE`）。
- [x-Liola-x/informative-drawings-onnx](https://huggingface.co/x-Liola-x/informative-drawings-onnx)，MIT，提供 contour512 / anime512 ONNX 导出。运行时仅访问本仓库 `models/`，不访问 HuggingFace。
- [onnxruntime-web](https://github.com/microsoft/onnxruntime)，Microsoft，MIT（见 `vendor/ort/LICENSE`）。
- KaTeX（MIT）、Noto CJK UI 字体子集（SIL OFL），许可分别位于对应 `vendor/` 子目录。

## 隐私

图片通过 File API 读取、Canvas 与 Worker 本地处理，不发送到服务器，不写入持久存储。无分析统计。所有资源自托管；网络请求仅获取公共静态资源，Cache API 仅缓存模型。分享是用户主动导出数学系数到 URL fragment，详见上方分享隐私说明。首次离线且无缓存时可选经典算法；预绘样例、字体和公式不需要第三方服务。

## GitHub Pages 部署

把此目录文件推送到 GitHub 仓库的 `main` 分支根目录。在仓库 **Settings → Pages → Build and deployment** 中选择 **Deploy from a branch → main → / (root)** 并保存。无需 npm、构建命令或 Actions 工作流。`.nojekyll` 禁止 Jekyll 处理，所有资源使用相对路径，兼容项目子路径。

## 检查

算法测试：`node --test fourier.test.mjs`。浏览器检查需另行验证图片上传、动画与下载。运行时不需要 Node 或任何包。

## 许可

MIT，见 [LICENSE](LICENSE)。
