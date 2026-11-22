# Local line-art models

## Portrait sketch (display only)

`u2net-portrait-q8.onnx`: U²-Net portrait drawing, upstream Apache-2.0 (`U2NET-LICENSE.txt`). Source and checkpoint: https://github.com/xuebinqin/U-2-Net (portrait generation demo, `u2net_portrait.pth`). Exported locally to ONNX with per-output-channel INT8 weight storage and DequantizeLinear; computation remains floating point. File: **44,233,106 bytes**, below both 50MB and GitHub Pages' 100MB file limit. This is weight compression, not a claim of 4× speed or memory improvement.

Input is RGB stretched to 512×512, normalized by the image maximum and ImageNet mean/std. The first output is inverted/min-max normalized and restored to the source aspect ratio. `sketch-worker.mjs` runs it with the bundled ORT WASM provider in the existing ML Worker; model bytes use the same-origin Cache API. The sketch is display/card-only: contour thresholding, stroke analysis, Fourier coefficients and share payload remain independent. A sketch failure retains contour output; a contour failure falls back to XDoG. Samples have six pre-baked `*-u2.png` sketches, computed from their original sample frames, matching the existing pre-baked contour framing.

`contour512.onnx` and `anime512.onnx`: informative-drawings (Chan et al., CVPR 2021), MIT; ONNX export by x-Liola-x, MIT.

- Original: https://github.com/carolineec/informative-drawings
- Export: https://huggingface.co/x-Liola-x/informative-drawings-onnx
- Input: float32 RGB `[1, 3, 512, 512]`, range 0–1; output: float32 gray `[1, 1, 512, 512]`, white = 1.
- Each file is about 17MB. Kept at fp32 to preserve tested WASM behavior and output; no unverified fp16/int8 conversion.
- White square padding, aspect-preserving resize, and crop-back are implemented in `ml-worker.js`. Six samples have offline-precomputed grayscale output for both styles.

Models and ONNX Runtime are served from the same GitHub Pages origin. No runtime requests to HuggingFace or any inference server.
