# Local models / 本地模型

All models and ONNX Runtime are served from the same GitHub Pages origin and cached with Cache API. No inference server or runtime HuggingFace requests. 模型全部自托管，不向外部推理服务发送照片。

## U²-Net portrait / 人像素描

`u2net-portrait-q8.onnx`: **44,233,106 bytes**, Apache-2.0 ([license](U2NET-LICENSE.txt)), from https://github.com/xuebinqin/U-2-Net (`u2net_portrait.pth`). Exported to ONNX with per-channel INT8 weight storage and DequantizeLinear; computation remains floating point. This is not a claim of 4× speed or memory reduction. Below the 50MB budget and GitHub Pages' 100MB file limit.

RGB input at 512×512, normalized by the image maximum and ImageNet mean/std. MODNet masks the sketch even when contours retain the clean-photo pipeline. Output is inverted/min-max normalized, restored to source aspect ratio, masked and softly feathered.

The worker delivers contours first, then computes the sketch with ORT WASM. It is display-only, never included in cards or share payloads. Cards use only a small pre-baked Joseph Fourier example. Six samples have pre-baked `*-u2.png` assets.

## Contour / 轮廓

`contour512.onnx`, about 17MB fp32: informative-drawings (Chan et al., CVPR 2021), MIT. Original: https://github.com/carolineec/informative-drawings ; ONNX export: https://huggingface.co/x-Liola-x/informative-drawings-onnx (MIT).

Float32 RGB [1,3,512,512], 0–1 → float32 gray [1,1,512,512], white = 1. Aspect-preserving white padding and crop-back. Six precomputed contour samples. Anime model and its unused sample assets have been removed.

## Framing / 取景

- `modnet-q8.onnx`: MODNet, Apache-2.0 ([license](MODNET-LICENSE.txt)), https://github.com/ZHKKKe/MODNet .
- `yunet.onnx`: YuNet, MIT ([license](YUNET-LICENSE.txt)), https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet .
- Complex-background framing preserves head and shoulders. Clean-photo contours keep the original pipeline; sketch masking is independent.
