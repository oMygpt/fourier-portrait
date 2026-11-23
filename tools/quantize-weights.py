# Usage: python tools/quantize-weights.py in.onnx out.onnx   (requires: pip install onnx numpy)
# Weight-only per-channel int8 quantization (DequantizeLinear → float Conv), like the bundled U²-Net q8.
import sys, numpy as np, onnx
from onnx import numpy_helper, helper, TensorProto
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
users = {}
for n in m.graph.node:
    for i, x in enumerate(n.input):
        users.setdefault(x, []).append((n.op_type, i))
new_inits, new_nodes = [], []
for t in m.graph.initializer:
    a = numpy_helper.to_array(t)
    use = users.get(t.name, [])
    if a.dtype == np.float32 and a.size > 1024 and use and all(op in ('Conv', 'ConvTranspose') and i == 1 for op, i in use):
        axis = 1 if use[0][0] == 'ConvTranspose' else 0
        moved = np.moveaxis(a, axis, 0).reshape(a.shape[axis], -1)
        scale = np.maximum(np.abs(moved).max(axis=1), 1e-12) / 127.0
        shape = [1] * a.ndim; shape[axis] = -1
        q = np.clip(np.round(a / scale.reshape(shape)), -127, 127).astype(np.int8)
        new_inits += [numpy_helper.from_array(q, t.name + '_q'), numpy_helper.from_array(scale.astype(np.float32), t.name + '_scale'), numpy_helper.from_array(np.zeros(a.shape[axis], np.int8), t.name + '_zp')]
        new_nodes.append(helper.make_node('DequantizeLinear', [t.name + '_q', t.name + '_scale', t.name + '_zp'], [t.name], axis=axis, name=t.name + '_dq'))
    else:
        new_inits.append(t)
del m.graph.initializer[:]; m.graph.initializer.extend(new_inits)
nodes = list(m.graph.node); del m.graph.node[:]; m.graph.node.extend(new_nodes + nodes)
onnx.checker.check_model(m); onnx.save(m, dst)
print('quantized', len(new_nodes), 'tensors')
