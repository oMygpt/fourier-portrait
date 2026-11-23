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

默认分享链接含系数、笔画抬笔数据、尺寸、可选昵称与猜谜标记；素描就绪时还包含 24×32、3-bit 的粗略明暗图。这些明暗来自你的素描，能够表现脸部阴影；**默认明暗与公式不是加密数据**。原始照片始终不上传；默认的高清分享会上传加密后的处理结果（见下节）。语言选择不进入载荷。持有链接的人可以查看和转发画像。新卡片固定墨白配色，旧 navy / silver 分享仍可解码并沿用原配色。数字 `#n` 及旧 `#p=` 链接均兼容；旧链接没有明暗时仍绘制纯线条。

### 公式卡、绘制视频与撤回

- **明暗 = 二维傅里叶**（`wave.mjs`）：素描由 U²-Net 神经网络生成；显影时把它拆成平面波，按空间频率半径 2、4、8 … 逐级叠加（512² FFT，逐档预计算、档间插值），画面角落显示当前最强的条纹波与「已叠加 N 个平面波」。叠满全部频率时与原素描完全一致。创作页、访客页、猜谜揭晓和视频第三段都使用它；系统开启「减少动态效果」时直接显示素描。线条仍是一维傅里叶（旋转的圆）。
- **同一个公式**：网页预览、LaTeX 导出、三种卡片、视频片头和二维码都由 `formula.mjs` 生成同一种写法：x(t) = a₀ + Σ aₖ cos(2πkt + φₖ)，每一项是一对反向旋转的圆。「圆」指旋转的圆，「项」指写出的 cos 项。
- **公式卡**（「这是我的公式。它能复原我的样子。」）：二维码就是公式本身（自包含链接，不经服务器、不会过期）。卡上印出的各项、线条肖像（只用公式画，不叠素描）与「N 个圆 · 项数 · 保留能量」都从二维码自身的数据解码得到，访客网页显示的是同一串数字。
- **画像卡**：主角是你的傅里叶画像（素描 + 圆周线条），配「我 = N 个旋转的圆」、真实系数、频谱指纹（每个频率的振幅）与由公式生成的编号。开启「猜猜我是谁」时卡片不露脸，只显示 16 个圆的轮廓。
- **绘制视频**（9:16，约 16 秒，优先 MP4）：圆链画出肖像 → 频率阶梯（2 → 4 → … → 全部圆，显示保留能量）→ 素描显影 → 短二维码。实时录制，需保持页面在前台。
- **猜猜我是谁**：访客先看到 2 个圆画出的曲线，圆数每 1.8 秒翻倍（2 → 4 → … → 全部），可显示创作者的提示语（≤12 字，写入二维码与文字链接）。按「我认出来了」记录当时的圆数，再揭晓素描与名字；成绩卡只含 16 个圆的轮廓、成绩与指回同一谜题的二维码，不含名字和脸，可转发挑战。不做服务端统计。
- **撤回**：每次上传附带随机删除令牌的 SHA-256；令牌只保存在本机「我的分享」中，可随时删除服务器上的密文。他人已保存的副本无法撤回。

### 高清分享（默认）：短二维码 + 端到端加密的素描与公式

公式卡中的「高清分享」**默认勾选**。浏览器将已抠图的 U²-Net 素描（≤250 KiB 的 WebP/JPEG）与完整精度的傅里叶系数、抬笔数据打包，用 WebCrypto 随机生成 AES-GCM-256 密钥和 96-bit IV，本地认证加密后才上传，每张画像只上传一次。

**二维码**只含短指针 `#s`：对象 id、密钥、圆数、可选昵称、猜谜与配色（约 56–74 字节，纠错等级 Q，约 QR v6–v9），访客解密后得到与创作者一致的线条和素描。**复制的文字链接**保持自包含格式（公式 + 粗略明暗 + E1 引用同一对象），对象过期后仍能画出线条和明暗。上传失败或取消勾选时，二维码回退为自包含格式。原始照片不上传。新 R2 存储桶仅收到密文，30 天生命周期自动清理；Worker 在满 30 天时立即停止提供该对象，底层删除由 Cloudflare 异步执行。

随机 128-bit 对象 id 和 256-bit 解密密钥保存在 URL **fragment** 的可选 E1 字段。密钥不发送给存储服务；访客本地解密、淡入真实素描。获取失败、过期或密钥错误时，保留 A 的明暗预览并给出小提示。**持有完整链接的人都能解密、转发和保存，已保存的副本无法撤回**；默认公式/明暗仍可在 30 天后重建。服务商可见网络元数据及密文长度，不是匿名服务。

当前 API 为 workers.dev；客户端地址只定义在 `encrypted-sketch.mjs` 的 `SKETCH_API_BASE`。Worker 源码、无密钥配置与生命周期规则见 [worker/](worker/README.md)。不配置或修改 DNS。

默认访客只需加载静态应用资源，不需要模型、原始照片或完整素描；解码与确定性排线均在本地完成，加载后断网也可重播。选用的完整素描首次获取需要网络，解密到内存后可离线重播。冷启动访问网页仍需网络，不提供离线安装或 Service Worker。

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

Default share links include coefficients, pen lifts, dimensions, an optional nickname and a guessing flag. When ready, they also include a **24×32, 3-bit coarse tone map derived from your sketch**. This reveals facial shading: **default formula/tone data is not encrypted**. The original photo is never uploaded; the default HD share uploads encrypted processed results (see below). Anyone with the link can view and forward the portrait. New cards use ink. Old navy/silver visitors retain their palette; old links without tones remain line-only. Numeric `#n` and legacy `#p=` transport remain supported. Language is not encoded.

### Card, drawing video and withdrawal

- **Tones = 2D Fourier** (`wave.mjs`): the sketch comes from the U²-Net network; it develops as plane waves added by spatial-frequency radius 2, 4, 8, … (512² FFT, rungs precomputed and blended), with the strongest current wave and “N plane waves” shown in a corner. With every frequency it equals the sketch exactly. Used on the creator page, visitor page, riddle reveal and the video's third act; reduced-motion shows the sketch directly. Lines remain 1D Fourier (rotating circles).
- **One formula**: the page preview, LaTeX export, all three cards, the video header and the QR are produced by `formula.mjs` in one notation: x(t) = a₀ + Σ aₖ cos(2πkt + φₖ), each term one pair of counter-rotating circles. “Circles” count rotating circles; “terms” count written cosine terms.
- **Formula card** (“This is my formula. It can bring back how I look.”): the QR *is* the formula (self-contained link, no server, no expiry). The printed terms, the line portrait (drawn from the formula alone, no sketch) and the “circles · terms · energy” line are all decoded from the QR's own payload; the visitor page shows the same numbers.
- **Portrait card**: the hero is your Fourier portrait (sketch + circle lines) with “Me = N rotating circles”, real coefficients, a spectral fingerprint and an edition number derived from the formula. In guessing mode the card shows only a 16-circle silhouette.
- **Drawing video** (9:16, ~16 s, MP4 preferred): chains draw the portrait → frequency ladder (2 → 4 → … → all circles, with retained energy) → sketch develops → short QR. Recorded in real time; keep the page visible.
- **Guess who**: visitors first see a 2-circle curve; the count doubles every 1.8 s (2 → 4 → … → all), with the creator's optional hint (≤12 characters, carried in both QR and text link). “I know who it is!” records the circle count, then reveals sketch and name. The score card shows only a 16-circle silhouette, the score and a QR back to the same riddle — no name, no face — so it can be forwarded as a challenge. No server-side statistics.
- **Withdrawal**: each upload carries the SHA-256 of a random delete token kept only in this browser's “My shares”; the stored ciphertext can be deleted at any time. Copies others saved cannot be recalled.

### HD share (default): short QR + end-to-end encrypted sketch and formula

“HD share” is **checked by default**. The matted U²-Net sketch (WebP/JPEG ≤250 KiB) is bundled with full-precision Fourier coefficients and pen lifts, encrypted with a fresh AES-GCM-256 key and 96-bit IV, and uploaded once per portrait as authenticated ciphertext.

The **QR** holds only a short `#s` pointer: object id, key, circle counts, optional nickname, guessing flag and palette (about 56–74 bytes, error correction Q, roughly QR v6–v9). Visitors decrypt the creator's exact lines and sketch. The **copied text link** stays self-contained (formula + coarse tones + E1 to the same object), so it still draws after expiry. If the upload fails or the box is unchecked, the QR falls back to the self-contained format. The original photo is never uploaded. A dedicated R2 bucket has a 30-day deletion lifecycle; the Worker stops serving an object at 30 days even if Cloudflare's asynchronous deletion has not run yet.

A random 128-bit object id and the 256-bit key are stored in an optional E1 section of the URL **fragment**. The storage service never receives the key. Visitors decrypt locally and fade in the real sketch. Fetch failure, expiry or a wrong key falls back to A's embedded tone preview with a small note. **Anyone with the full link can decrypt, save and forward it; saved copies cannot be recalled.** Default formula/tone data remains reconstructible after expiry. The provider still sees ordinary network metadata and ciphertext sizes; this is not anonymity.

The API currently uses workers.dev. Its only client URL constant is `SKETCH_API_BASE` in `encrypted-sketch.mjs`. Source, credential-free deployment config and lifecycle rules are in [worker/](worker/README.md). No DNS changes are configured.

Default visitors need only the static app assets, not a model, original photo or full sketch. Decoding and deterministic hatching run locally; replay works after disconnecting. An opted-in full sketch needs network access for its initial retrieval, then can replay offline while held in memory. A cold page load still needs the network; there is no offline installation or service worker.

## Technical notes / 技术说明

- Native HTML/CSS/ES modules, dedicated ML and path workers; no runtime framework.
- XY applies a real DFT independently to x and y. Pen lifts prevent travel lines across the face. Auto N retains ≥99% energy and targets ≤1.5px mean normalized reconstruction error.
- The v2 binary payload uses DEFLATE, quantized coefficients and a full pen-lift bitmap. Its option byte stores guessing in bit 0 and legacy palette in bits 1–2. An optional trailing T1 section stores width, height, bit depth and packed quantized darkness; the entire payload is compressed together. Maps are bounded to 2048 cells and 2–4 bits. Darkness is square-root-companded before quantization, then bilinearly interpolated in linear darkness for feathered, grain-modulated cross-hatching. Tone-free payload bytes retain their original format; older deployed decoders need the updated app to read the extension. Numeric transport groups five bytes into thirteen decimal digits with an explicit tail length.
- E1 is an optional 52-byte section: tag/version, 16-bit body length, 16-byte object id and 32-byte raw key. AES-GCM ciphertext uses a version byte, 12-byte IV and authentication tag; image MIME is authenticated inside the encrypted plaintext.
- QR uses separate Byte (URL) and Numeric (payload) segments. Tone/encrypted-reference shares have an 8000-bit budget (≤ v22); links with neither retain 5760 bits (≤ v18). Four-pixel integer modules and a four-module quiet zone are preserved. Coefficients may be trimmed to fit; the visitor slider selects from those transmitted. Cards retain the creator's full-N first terms and counts. Coarse tones cannot reproduce fine U²-Net hair or facial texture.
- Share base: `https://fourier.jupyter.pro/`; storage API same-origin at `https://fourier.jupyter.pro/api` (Worker route). Old `omygpt.github.io` links and the workers.dev API keep working. Local verification must replace only the origin/path while keeping the exact fragment.
- Tests: `node --test fourier.test.mjs tone.test.mjs encrypted-sketch.test.mjs bundle.test.mjs video.test.mjs riddle.test.mjs formula.test.mjs ink.test.mjs wave.test.mjs worker/worker.test.mjs`. Syntax: `node --check app.js` (and other modified modules). Whitespace: `git diff --check`.
- Model origins, sizes and licenses: [models/README.md](models/README.md). Third-party license files are vendored with their assets.
