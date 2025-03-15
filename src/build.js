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

// 出力ディレクトリを作成
const outputPath = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

// トランスパイル結果を出力
const outputFilePath = path.join(outputPath, 'example.js');
fs.writeFileSync(outputFilePath, result, 'utf-8');
console.log(`トランスパイル完了: ${outputFilePath}`);

// ランタイムライブラリをコピー
const runtimeSrc = path.join(__dirname, 'runtime.js');
const runtimeDest = path.join(outputPath, 'runtime.js');
fs.copyFileSync(runtimeSrc, runtimeDest);
console.log(`ランタイムライブラリをコピー: ${runtimeDest}`);

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
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
</head>
<body>
  <h1>AccelScript Demo</h1>
  
  <h2>コード</h2>
  <pre id="source-code"><code = class="lang-js">${source.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
  
  <!--
  <h2>トランスパイル後のコード</h2>
  <pre id="transpiled-code"><code = class="lang-js">${result.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
  -->
  
  <h2>実行結果</h2>
  <pre class="output" id="output"></pre>
  
  <script type="module" src="example.js"></script>
  <script>
    Prism.highlightAll();

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
