# JSS - JavaScript Shader Extension

JSS（JavaScript Shader Extension）は、JavaScriptを拡張して、関数の前に`@compute`属性を付けることで、その関数をWGSL（WebGPU Shading Language）のcompute shaderに変換するトランスパイラーです。

## 概要

JSS（JavaScript Shader Extension）は以下の特徴を持ちます：

- 基本的にはJavaScriptのままで動作します
- 関数の前に`@compute`属性を付けた場合：
  - その関数はJSからは除外されます
  - その関数はWGSL（WebGPU Shading Language）のcompute shaderに変換されます
  - 変換されたシェーダーコードは文字列として出力後のJSに埋め込まれます

## インストール

```bash
npm install
```

## 使い方

### 1. JSS形式のコードを作成

```javascript
// 通常のJavaScript関数
function normalFunction(a, b) {
  return a + b;
}

// @compute属性を持つ関数（WGSLに変換される）
@compute
function addVectors(index) {
  // 入力バッファからデータを読み取り
  let a = inputA[index];
  let b = inputB[index];
  
  // 計算結果を出力バッファに書き込み
  output[index] = a + b;
}

// 通常のJavaScriptコード
console.log(normalFunction(5, 3));
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

### 3. 変換後のコード

```javascript
// 通常のJavaScript関数
function normalFunction(a, b) {
  return a + b;
}

// 通常のJavaScriptコード
console.log(normalFunction(5, 3));

// Generated WGSL Shader Code
const shaderCode = {
  addVectors: `
@group(0) @binding(0) var<storage, read> inputA: array<f32>;
@group(0) @binding(1) var<storage, read> inputB: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(1)
fn addVectors(index: f32) -> void {
  // 入力バッファからデータを読み取り
  let a = inputA[index];
  let b = inputB[index];
  
  // 計算結果を出力バッファに書き込み
  output[index] = a + b;
}
`
};
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
5. シェーダーコードをJSに埋め込み

## 制限事項

現在のバージョンでは、以下の制限があります：

- 関数パラメータの型は常に`f32`として扱われます
- バッファのバインディングは固定で、`inputA`、`inputB`、`output`の3つのみサポートしています
- ワークグループサイズは固定で`1`です
- 複雑なJavaScript構文はサポートしていません

## ライセンス

ISC
