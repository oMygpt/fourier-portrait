# 圆周之间 · Fourier Portrait

## 中文

完全静态、全程本地的傅里叶人像工具。照片不上传，不需要 API 或服务端。默认宣纸、墨线与朱印；支持桌面和手机。

### 使用

运行 `python3 -m http.server 8080`，通过 http://localhost:8080 打开（ES 模块需要 HTTP，不能直接双击 HTML）。整个目录可部署到 GitHub Pages。

1. 上传 JPG / PNG、拖入照片，或选择六个公有领域名人样例。
2. 显著的处理面板显示实际模型下载字节 / MB、四个处理步骤和粗略剩余时间。背景分离后显示真实 MODNet 遮罩的渐隐预览；尚未生成时明确显示为原图预览。网络估算基于当前下载速率，本地计算仅显示粗略范围。
3. 圆周轮廓就绪后先开始双轴 XY 绘制；素描继续在 Worker 中生成，处理面板保持可见，直到素描到达或回退。缓存模型可直接进入本地处理。
4. 完成后自动呈现素描与傅里叶线条叠加的唯一结果；保存 PNG 即保存这一结果。可暂停、跳到完成、重播或换图。
5. 公式面板提供自动 N、唯一的手动圆数滑块、真实系数预览和完整 LaTeX 导出。中文文件使用 XeLaTeX 编译。开启系统「减少动态效果」会跳过旋转动画。
6. 公式卡可选 3:4 / 9:16 和昵称。卡片主角是你的真实 x(t)、y(t) 系数，不展示你的照片或素描；约瑟夫·傅里叶的素描与公式是明确标记的示例。二维码含公式及可选的低分辨率素描明暗，扫码后用排线重建阴影。

顶部「中文 / EN」根据浏览器语言初始化，选择保存在 localStorage，更新 HTML lang；访客沿用自己的语言，不在分享数据中编码语言。访客绘制时同步显示公式，完成后可调整圆数并点击「生成我的公式」。

### 模型与隐私

U²-Net portrait q8（44.23MB，Apache-2.0）仅作素描层。contour 与 XDoG 回退保留原有傅里叶路径质量与自动 N。复杂背景使用 YuNet / MODNet 取景；素描层始终尝试 MODNet 抠图与柔和边缘。素描失败时保留 contour，contour 失败时使用 XDoG。模型、ORT、字体和二维码库全部自托管，使用 Cache API 缓存；第一次上传需要下载模型，样例无需下载模型。

分享链接含系数、笔画抬笔数据、尺寸、可选昵称与猜谜标记；素描就绪时还包含 24×32、3-bit 的粗略明暗图。这些明暗来自你的素描，能够表现脸部阴影；**不是只有公式，也不是加密**。不传原始照片或完整素描，语言选择不进入载荷。持有链接的人可以查看和转发画像。新卡片固定墨白配色，旧 navy / silver 分享仍可解码并沿用原配色。数字 `#n` 及旧 `#p=` 链接均兼容；旧链接没有明暗时仍绘制纯线条。

访客只需加载静态应用资源，不需要模型、原始照片或完整素描；解码与确定性排线均在本地完成，加载后断网也可重播。冷启动访问网页仍需网络，不提供离线安装或 Service Worker。

## English

A completely static, private Fourier portrait app. Your photo never leaves your browser. No API, backend or build step. Rice paper, ink and a vermilion seal; responsive on desktop and mobile.

### Use

Run `python3 -m http.server 8080` and open http://localhost:8080 (ES modules require HTTP). Deploy this directory directly to GitHub Pages.

1. Upload/drop a JPG or PNG, or choose one of six public-domain samples.
2. A prominent processing panel shows real model download bytes / MB, four processing steps and a rough ETA. An actual MODNet subject mask fades away the background once available; until then, the image is labeled as an original preview. Download estimates use the current transfer rate; compute estimates are deliberately approximate.
3. XY circles begin when contours are ready. The worker keeps computing the sketch, and the processing panel remains visible until it arrives or falls back. Cached models proceed directly to local computation.
4. One best final overlay is shown automatically. The PNG download is that overlay. Pause, skip, replay or choose another photo.
5. The formula panel offers automatic N, one optional manual circle-count slider, actual coefficient previews and full LaTeX export. English exports compile with pdfLaTeX or XeLaTeX. System reduced-motion preferences skip the animation.
6. Choose a 3:4 or 9:16 formula card and an optional nickname. The hero is your actual x(t), y(t), not your photo or sketch. The small Joseph Fourier sketch is explicitly labeled as an example. Scan the QR to watch circles draw your portrait.

The header's 中文 / EN toggle defaults from the browser, persists in localStorage and updates HTML lang. Visitors use their own language; no language is added to the payload. Their formula is visible while the portrait forms. Adjust the circle count and select **Make mine**.

### Models & privacy

The self-hosted U²-Net portrait q8 model is 44.23MB (Apache-2.0), used only for the sketch layer. The existing contour pipeline and XDoG fallback independently preserve Fourier quality and automatic N. YuNet / MODNet frame complex backgrounds; the sketch always attempts MODNet masking and soft paper edges. Sketch failures retain contours; contour failures use XDoG. Models, ORT, fonts and QR generation are all self-hosted. Model downloads use Cache API; pre-baked samples need no model downloads.

Share links include coefficients, pen lifts, dimensions, an optional nickname and a guessing flag. When the sketch is ready, they also include a **24×32, 3-bit coarse tone map derived from your sketch**. It reveals facial shading: the link is not formula-only, and **this is not encryption**. No original photo or full-resolution sketch is included. Anyone with the link can view and forward the portrait. New cards use ink. Old navy/silver visitors retain their palette; old links without tones remain line-only. Numeric `#n` and legacy `#p=` transport remain supported. Language is not encoded.

Visitors need only the static app assets, not a model, original photo or full sketch. Decoding and deterministic hatching run locally; replay works after disconnecting. A cold page load still needs the network; there is no offline installation or service worker.

## Technical notes / 技术说明

- Native HTML/CSS/ES modules, dedicated ML and path workers; no runtime framework.
- XY applies a real DFT independently to x and y. Pen lifts prevent travel lines across the face. Auto N retains ≥99% energy and targets ≤1.5px mean normalized reconstruction error.
- The v2 binary payload uses DEFLATE, quantized coefficients and a full pen-lift bitmap. Its option byte stores guessing in bit 0 and legacy palette in bits 1–2. An optional trailing T1 section stores width, height, bit depth and packed quantized darkness; the entire payload is compressed together. Maps are bounded to 2048 cells and 2–4 bits. Darkness is square-root-companded before quantization, then bilinearly interpolated in linear darkness for feathered, grain-modulated cross-hatching. Tone-free payload bytes retain their original format; older deployed decoders need the updated app to read the extension. Numeric transport groups five bytes into thirteen decimal digits with an explicit tail length.
- QR uses separate Byte (URL) and Numeric (payload) segments. Tone shares have an 8000-bit budget (≤ v22); tone-free links retain 5760 bits (≤ v18). Four-pixel integer modules and a four-module quiet zone are preserved. Coefficients may be trimmed to fit; the visitor slider selects from those transmitted. Cards retain the creator's full-N first terms and counts. Coarse tones cannot reproduce fine U²-Net hair or facial texture.
- Share base: `https://omygpt.github.io/fourier-portrait/`. Local verification must replace only the origin/path while keeping the exact fragment.
- Tests: `node --test fourier.test.mjs tone.test.mjs`. Syntax: `node --check app.js` (and other modified modules). Whitespace: `git diff --check`.
- Model origins, sizes and licenses: [models/README.md](models/README.md). Third-party license files are vendored with their assets.
