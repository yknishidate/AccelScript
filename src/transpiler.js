/**
 * JSS - JavaScript Shader Extension
 * JavaScriptを拡張し、@compute属性を持つ関数をWGSLのcompute shaderに変換するトランスパイラー
 */

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const generate = require('@babel/generator').default;

/**
 * @compute属性を持つ関数を抽出する前処理
 * @param {string} source JavaScriptのソースコード
 * @returns {{jsCode: string, computeFunctions: Array<{name: string, params: string[], body: string}>}}
 */
function preprocess(source) {
  // 結果を格納するオブジェクト
  const result = {
    jsCode: source,
    computeFunctions: []
  };

  // @compute属性を持つ関数を検出する正規表現
  // デコレータ構文: @compute\nfunction name(...) {...}
  const decoratorRegex = /@compute\s*\n\s*function\s+(\w+)\s*\(([^)]*)\)\s*{([\s\S]*?)}/g;
  
  // @compute属性を持つ関数を検出し、JSコードから除外する
  let match;
  while ((match = decoratorRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const functionName = match[1];
    const params = match[2].split(',').map(param => param.trim()).filter(Boolean);
    const functionBody = match[3];
    
    // 検出した関数情報を保存
    result.computeFunctions.push({
      name: functionName,
      params,
      body: functionBody
    });
    
    // JSコードから@compute関数を除外
    result.jsCode = result.jsCode.replace(fullMatch, '');
  }
  
  return result;
}

/**
 * JavaScript関数をWGSLのcompute shaderに変換する
 * @param {{name: string, params: string[], body: string}} functionInfo 関数情報
 * @returns {string} WGSLコード
 */
function convertToWGSL(functionInfo) {
  // パラメータの型を推測（簡易的な実装）
  const typedParams = functionInfo.params.map(param => `${param}: f32`);
  
  // バッファのバインディングを追加
  const bufferBindings = `
@group(0) @binding(0) var<storage, read> inputA: array<f32>;
@group(0) @binding(1) var<storage, read> inputB: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;
`;
  
  // WGSLコードを生成
  const wgslCode = `${bufferBindings}
@compute @workgroup_size(1)
fn ${functionInfo.name}(${typedParams.join(', ')}) -> void {
  ${functionInfo.body}
}
`;
  
  return wgslCode;
}

/**
 * ソースコードを変換し、@compute関数をWGSLに変換してJSに埋め込む
 * @param {string} source JavaScriptのソースコード
 * @returns {string} 変換後のJavaScriptコード
 */
function transpile(source) {
  // 1. 前処理: @compute関数を抽出
  const { jsCode, computeFunctions } = preprocess(source);
  
  // 2. 残りのJSコードをASTに変換
  const ast = parser.parse(jsCode, {
    sourceType: 'module'
  });
  
  // 3. ASTをJavaScriptに変換
  let result = generate(ast).code;
  
  // 4. 各@compute関数をWGSLに変換
  const wgslShaders = {};
  for (const funcInfo of computeFunctions) {
    wgslShaders[funcInfo.name] = convertToWGSL(funcInfo);
  }
  
  // 5. シェーダーコードをJSに埋め込む
  if (Object.keys(wgslShaders).length > 0) {
    result += '\n\n// Generated WGSL Shader Code\n';
    result += 'const shaderCode = {\n';
    
    const entries = Object.entries(wgslShaders);
    for (let i = 0; i < entries.length; i++) {
      const [name, code] = entries[i];
      result += `  ${name}: \`${code}\`${i < entries.length - 1 ? ',' : ''}\n`;
    }
    
    result += '};\n';
  }
  
  return result;
}

module.exports = {
  preprocess,
  convertToWGSL,
  transpile
};
