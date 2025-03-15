import { JSS } from './runtime.js';
/**
 * JSS - JavaScript Shader Extension の実用例
 * WebGPUを使用して@compute関数を実行する例
 */

// @compute属性を持つ関数（WGSLのcompute shaderに変換される）
// バッファの型情報を引数に指定することで、自動的にバインディングが生成されます

// 新しいシンプルな使用例
async function runSimpleExample() {
  // WebGPUを初期化
  await JSS.init();

  // 入力データを準備
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);

  // GPUバッファを作成
  const device = JSS.getDevice();
  const inputABuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const inputBBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const outputBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  // 入力データをGPUバッファにコピー
  device.queue.writeBuffer(inputABuffer, 0, data);
  device.queue.writeBuffer(inputBBuffer, 0, data);

  // 計算を実行（自動生成されたラッパー関数を使用）
  await addVectors(inputABuffer, inputBBuffer, outputBuffer);

  // 結果を読み取る
  const resultData = await JSS.readBuffer(outputBuffer, data.byteLength);

  // 結果を表示
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
  module.exports = {
    runSimpleExample
  };
}

// JSS WebGPU Wrapper Functions

// WebGPUラッパー関数
async function addVectors(inputA, inputB, output) {
  // バッファタイプの配列
  const bufferTypes = ['read-only-storage', 'read-only-storage', 'storage'];
  
  // シェーダーを実行
  return JSS.executeShader('addVectors', shaderCode.addVectors, [inputA, inputB, output], bufferTypes);
}


// Generated WGSL Shader Code
const shaderCode = {
  addVectors: `@group(0) @binding(0) var<storage, read> inputA: array<f32>;
@group(0) @binding(1) var<storage, read> inputB: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64)  // 一般的なワークグループサイズ（GPUによって最適値は異なる）
fn addVectors(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // グローバルインボケーションIDからインデックスを取得
  let index = global_id.x;
  
  // インデックスが配列の範囲内かチェック（バッファオーバーランを防止）
  // 最初のバッファがある場合、そのサイズをチェックに使用
  if (index < arrayLength(&inputA)) {
    
  // 入力バッファからデータを読み取り
  // indexはglobal_id.xから自動的に取得されます
  let a = inputA[index];
  let b = inputB[index];
  
  // 計算結果を出力バッファに書き込み
  output[index] = a + b;

  }
}
`
};
