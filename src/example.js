/**
 * JSS - JavaScript Shader Extension の実用例
 * WebGPUを使用して@compute関数を実行する例
 */

// @compute属性を持つ関数（WGSLのcompute shaderに変換される）
// バッファの型情報を引数に指定することで、自動的にバインディングが生成されます
@compute
function addVectors(inputA: read<f32[]>, inputB: read<f32[]>, output: write<f32[]>) {
  // 入力バッファからデータを読み取り
  // indexはglobal_id.xから自動的に取得されます
  let a = inputA[index];
  let b = inputB[index];
  
  // 計算結果を出力バッファに書き込み
  output[index] = a + b;
}

// 新しいシンプルな使用例
async function runSimpleExample() {
  // WebGPUを初期化
  await initJSS();
  
  // 入力データを準備
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  
  // GPUバッファを作成
  const device = globalThis.__JSS_DEVICE__;
  
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
  await addVectors(inputABuffer, inputBBuffer, outputBuffer);
  
  // 結果を読み取るためのステージングバッファを作成
  const stagingBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  
  // 結果をステージングバッファにコピー
  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(
    outputBuffer, 0,
    stagingBuffer, 0,
    data.byteLength
  );
  device.queue.submit([commandEncoder.finish()]);
  
  // 結果を読み取り
  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const resultData = new Float32Array(stagingBuffer.getMappedRange());
  
  // 結果を表示
  console.log('Input A:', data);
  console.log('Input B:', data);
  console.log('Result:', resultData);
  
  // リソースを解放
  stagingBuffer.unmap();
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
