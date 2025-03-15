// WGSLに変換される関数
// 引数から自動的にバインディングが生成される
@compute
function addVectors(inputA: read<f32[]>, inputB: read<f32[]>, output: write<f32[]>) {
  let a = inputA[index];
  let b = inputB[index];
  output[index] = a + b;
}

async function runSimpleExample() {
  // 初期化
  await JSS.init();
  
  // GPUバッファを作成
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const inputABuffer = new JSSFloat32Array(data);
  const inputBBuffer = new JSSFloat32Array(data);
  const outputBuffer = new JSSFloat32Array(data.length);
  
  // 計算を実行（スレッド数を指定）
  await dispatch(addVectors(inputABuffer, inputBBuffer, outputBuffer), data.length);
  console.log('Result:', outputBuffer.array);
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    runSimpleExample().catch(console.error);
  });
}
