/**
 * JSS - JavaScript Shader Extension のビルドスクリプト
 * example.jsをトランスパイルして、実際に動作するJavaScriptコードを生成します
 */

const fs = require('fs');
const path = require('path');
const { transpile } = require('./transpiler');

// ソースファイルを読み込む
const sourcePath = path.join(__dirname, 'example.js');
const source = fs.readFileSync(sourcePath, 'utf-8');

// トランスパイル実行
const result = transpile(source);

// 出力ファイルに書き込む
const outputPath = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

const outputFilePath = path.join(outputPath, 'example.js');
fs.writeFileSync(outputFilePath, result, 'utf-8');

console.log(`トランスパイル完了: ${outputFilePath}`);

// HTMLファイルも作成（ブラウザでの実行用）
const htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSS - JavaScript Shader Extension Demo</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    pre {
      background-color: #f5f5f5;
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
    }
    .output {
      margin-top: 20px;
      border: 1px solid #ddd;
      padding: 10px;
      border-radius: 5px;
    }
    h1 {
      color: #333;
    }
  </style>
</head>
<body>
  <h1>JSS - JavaScript Shader Extension Demo</h1>
  <p>このデモは、JavaScriptを拡張して@compute属性を持つ関数をWGSLのcompute shaderに変換するトランスパイラーの例です。</p>
  
  <h2>元のコード（@compute属性を含む）</h2>
  <pre id="source-code">${source.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  
  <h2>トランスパイル後のコード</h2>
  <pre id="transpiled-code">${result.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  
  <h2>実行結果</h2>
  <div class="output" id="output">
    <p>WebGPUが利用可能な場合、ここに結果が表示されます。</p>
  </div>
  
  <script src="example.js"></script>
  <script>
    // 出力をキャプチャ
    const originalConsoleLog = console.log;
    const outputDiv = document.getElementById('output');
    
    console.log = function(...args) {
      originalConsoleLog.apply(console, args);
      
      const p = document.createElement('p');
      p.textContent = args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg);
        }
        return String(arg);
      }).join(' ');
      
      outputDiv.appendChild(p);
    };
  </script>
</body>
</html>
`;

const htmlFilePath = path.join(outputPath, 'index.html');
fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');

console.log(`HTMLファイル作成: ${htmlFilePath}`);
