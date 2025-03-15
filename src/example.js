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
  await JSS.init();
  
  // GPUバッファを作成
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  
  const inputABuffer = new JSSFloat32Array(data);
  const inputBBuffer = new JSSFloat32Array(data);
  const outputBuffer = new JSSFloat32Array(data.length);
  
  // 計算を実行（自動生成されたラッパー関数を使用）
  await dispatch(addVectors(inputABuffer, inputBBuffer, outputBuffer), 8);
  
  // 結果を表示
  console.log('Input A:', inputABuffer.array);
  console.log('Input B:', inputABuffer.array);
  console.log('Result:', outputBuffer.array);
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
