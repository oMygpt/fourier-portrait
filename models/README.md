# Local line-art models

`contour512.onnx` and `anime512.onnx`: informative-drawings (Chan et al., CVPR 2021), MIT; ONNX export by x-Liola-x, MIT.

- Original: https://github.com/carolineec/informative-drawings
- Export: https://huggingface.co/x-Liola-x/informative-drawings-onnx
- Input: float32 RGB `[1, 3, 512, 512]`, range 0–1; output: float32 gray `[1, 1, 512, 512]`, white = 1.
- Each file is about 17MB. Kept at fp32 to preserve tested WASM behavior and output; no unverified fp16/int8 conversion.
- White square padding, aspect-preserving resize, and crop-back are implemented in `ml-worker.js`. Six samples have offline-precomputed grayscale output for both styles.

Models and ONNX Runtime are served from the same GitHub Pages origin. No runtime requests to HuggingFace or any inference server.
