// @compute属性を持つ関数（WGSLのcompute shaderに変換される）
// バッファの型情報を引数に指定することで、自動的にバインディングが生成されます
@compute
function addVectors(inputA: read<f32[]>, inputB: read<f32[]>, output: write<f32[]>) {
  output[index] = inputA[index] + inputB[index];
}

// 新しいシンプルな使用例
async function runSimpleExample() {
  // WebGPUを初期化
  await AxRuntime.init();
  const device = AxRuntime.getDevice();
  
  // GPUバッファを作成
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  
  const inputABuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  
  const inputBBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  
  const outputBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  
  // 入力データをGPUバッファにコピー
  device.queue.writeBuffer(inputABuffer, 0, data);
  device.queue.writeBuffer(inputBBuffer, 0, data);
  
  // 計算を実行（自動生成されたラッパー関数を使用）
  await dispatch(addVectors(inputABuffer, inputBBuffer, outputBuffer), 8);
  
  // 結果を表示
  const resultData = await AxRuntime.readBuffer(outputBuffer, data.byteLength);
  console.log('Input A:', data);
  console.log('Input B:', data);
  console.log('Result:', resultData);
}

// 計算を実行
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    runSimpleExample().catch(console.error);
  });
}

// Node.jsでの実行用（WebGPUがサポートされていない場合はスキップ）
if (typeof module !== 'undefined') {
  module.exports = { runSimpleExample };
}
