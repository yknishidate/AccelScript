# AccelScript

AccelScriptはJavaScriptとWGSLを単一ファイルに記述し、シェーダを通常のJavaScript関数に近い形で簡単に実行するためのトランスパイラーとランタイムライブラリです。

## Example

### Code

```js
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
  await AxRuntime.init();
  
  // GPUバッファを作成
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const inputABuffer = new AxFloat32Array(data);
  const inputBBuffer = new AxFloat32Array(data);
  const outputBuffer = new AxFloat32Array(data.length);
  
  // 計算を実行（スレッド数を指定）
  await dispatch(addVectors(inputABuffer, inputBBuffer, outputBuffer), data.length);
  console.log('Result:', outputBuffer.array);
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    runSimpleExample().catch(console.error);
  });
}
```

### 実行結果

```js
Result: {"0":2,"1":4,"2":6,"3":8,"4":10,"5":12,"6":14,"7":16}
```
