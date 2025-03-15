# JSS - JavaScript Shader Extension

JSS（JavaScript Shader Extension）は、JavaScriptを拡張して、関数の前に`@compute`属性を付けることで、その関数をWGSL（WebGPU Shading Language）のcompute shaderに変換するトランスパイラーです。

## 概要

JSS（JavaScript Shader Extension）は以下の特徴を持ちます：

- 基本的にはJavaScriptのままで動作します
- 関数の前に`@compute`属性を付けた場合：
  - その関数はJSからは除外されます
  - その関数はWGSL（WebGPU Shading Language）のcompute shaderに変換されます
  - 変換されたシェーダーコードは文字列として出力後のJSに埋め込まれます
  - 自動生成されたラッパー関数を通じて簡単に呼び出せます

## インストール

```bash
npm install
```

## 使い方

### 1. JSS形式のコードを作成

```javascript
// @compute属性を持つ関数（WGSLに変換される）
@compute
function addVectors(inputA: read<f32[]>, inputB: read<f32[]>, output: write<f32[]>) {
  // 入力バッファからデータを読み取り
  // indexはglobal_id.xから自動的に取得されます
  let a = inputA[index];
  let b = inputB[index];
  
  // 計算結果を出力バッファに書き込み
  output[index] = a + b;
}
```

### 2. トランスパイル

```javascript
const { transpile } = require('./src/transpiler');
const fs = require('fs');

// ソースファイルを読み込む
const source = fs.readFileSync('your-file.js', 'utf-8');

// トランスパイル実行
const result = transpile(source);

// 出力ファイルに書き込む
fs.writeFileSync('output.js', result, 'utf-8');
```

### 3. 変換後のコードを使用

```javascript
import { JSS } from './runtime.js';

// WebGPUを初期化
await JSS.init();

// バッファを作成
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

// データをバッファにコピー
device.queue.writeBuffer(inputABuffer, 0, data);
device.queue.writeBuffer(inputBBuffer, 0, data);

// 計算を実行（自動生成されたラッパー関数を使用）
await addVectors(inputABuffer, inputBBuffer, outputBuffer);

// 結果を読み取る
const resultData = await JSS.readBuffer(outputBuffer, data.byteLength);
```

## デモ

デモを実行するには：

```bash
node src/build.js
```

その後、`dist/index.html`をWebGPUをサポートするブラウザで開いてください。

## 実装の詳細

JSS（JavaScript Shader Extension）は、以下のステップでJavaScriptコードをトランスパイルします：

1. 前処理: `@compute`属性を持つ関数を抽出
2. 残りのJSコードをASTに変換
3. ASTをJavaScriptに変換
4. 各`@compute`関数をWGSLに変換
5. ランタイムライブラリのインポート文を追加
6. 自動生成されたラッパー関数を追加
7. シェーダーコードをJSに埋め込み

## ランタイムライブラリ

JSSには、WebGPUの初期化と管理を行うランタイムライブラリが含まれています。主な機能は以下の通りです：

- `JSS.init()`: WebGPUを初期化する
- `JSS.getDevice()`: 現在のGPUデバイスを取得する
- `JSS.executeShader()`: シェーダーを実行する
- `JSS.readBuffer()`: バッファから結果を読み取る

## 制限事項

現在のバージョンでは、以下の制限があります：

- バッファパラメータは `read<f32[]>` または `write<f32[]>` の形式で指定する必要があります
- ワークグループサイズは固定で`64`です
- 複雑なJavaScript構文はサポートしていません

## ライセンス

ISC
