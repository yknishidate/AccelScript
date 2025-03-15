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
 * バッファ型情報を解析する
 * @param {string} paramStr パラメータ文字列（例: "inputA: read<f32[]>"）
 * @returns {{name: string, access: string, type: string}} バッファ情報
 */
function parseBufferType(paramStr) {
  // パラメータ文字列を解析（例: "inputA: read<f32[]>"）
  const match = paramStr.match(/(\w+)\s*:\s*(read|write)<(\w+)(?:\[\])?>/);
  if (!match) return null;
  
  const [, name, access, type] = match;
  return { name, access, type };
}

/**
 * JavaScript関数をWGSLのcompute shaderに変換する
 * @param {{name: string, params: string[], body: string}} functionInfo 関数情報
 * @returns {{1d: string, 2d: string}} 1次元と2次元のWGSLコード
 */
function convertToWGSL(functionInfo) {
  // バッファパラメータを解析
  const bufferParams = [];
  for (const param of functionInfo.params) {
    const bufferInfo = parseBufferType(param);
    if (bufferInfo) {
      bufferParams.push(bufferInfo);
    }
  }
  
  // 共通のユニフォームバッファ定義
  const uniformsStruct = `struct Uniforms {
  width: u32,
  height: u32,
  is_2d: u32,  // 1次元の場合は0、2次元の場合は1
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;\n`;
  
  // バッファバインディング（ユニフォームバッファの後）
  let bufferBindings = '';
  for (let i = 0; i < bufferParams.length; i++) {
    const { name, access, type } = bufferParams[i];
    const storageAccess = access === 'read' ? 'read' : 'read_write';
    // バインディングインデックスを1からスタート（0はユニフォームバッファ用）
    bufferBindings += `@group(0) @binding(${i + 1}) var<storage, ${storageAccess}> ${name}: array<${type}>;\n`;
  }
  
  // 1次元用WGSLコードを生成
  const wgslCode1D = `${uniformsStruct}${bufferBindings}
@compute @workgroup_size(64)  // 1次元用ワークグループサイズ
fn ${functionInfo.name}(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // グローバルインボケーションIDからインデックスを取得
  let index = global_id.x;
  
  // スレッド数を超えていないかチェック
  if (index < uniforms.width) {
    ${functionInfo.body}
  }
}
`;

  // 2次元用WGSLコードを生成
  const wgslCode2D = `${uniformsStruct}${bufferBindings}
@compute @workgroup_size(8, 8)  // 2次元用ワークグループサイズ
fn ${functionInfo.name}(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // グローバルインボケーションIDからインデックスを取得
  let x = global_id.x;
  let y = global_id.y;
  
  // スレッド数を超えていないかチェック
  if (x < uniforms.width && y < uniforms.height) {
    let width = uniforms.width;
    let index = y * width + x;
    ${functionInfo.body}
  }
}
`;
  
  return {
    '1d': wgslCode1D,
    '2d': wgslCode2D
  };
}

/**
 * ラッパー関数を生成する
 * @param {string} funcName 関数名
 * @param {Array<{name: string, access: string, type: string}>} bufferParams バッファパラメータ
 * @returns {string} ラッパー関数のコード
 */
function generateWrapperFunction(funcName, bufferParams) {
  // バッファパラメータの名前を取得
  const paramNames = bufferParams.map(param => param.name);
  
  // バッファタイプの配列を生成（ユニフォームバッファを含む）
  const bufferTypes = ['uniform', ...bufferParams.map(param => 
    param.access === 'read' ? 'read-only-storage' : 'storage'
  )];
  
  return `
// WebGPUラッパー関数
function ${funcName}(${paramNames.join(', ')}) {
  // シェーダー情報を返す（実行はしない）
  return {
    name: '${funcName}',
    code1d: shaderCode.${funcName}_1d,
    code2d: shaderCode.${funcName}_2d,
    buffers: [${paramNames.join(', ')}],
    bufferTypes: [${bufferTypes.map(type => `'${type}'`).join(', ')}]
  };
}
`;
}

function generateDispatchFunction() {
  return `
// グローバルなdispatch関数
async function dispatch(shaderInfo, threadCount) {
  if (threadCount === undefined) {
    throw new Error('threadCount must be specified');
  }
  
  // threadCountの型に基づいて次元を判定
  const is2D = Array.isArray(threadCount) || 
               (typeof threadCount === 'object' && threadCount !== null && 
                'width' in threadCount && 'height' in threadCount);
  
  // 次元に応じたコードとパラメータを選択
  const code = is2D ? shaderInfo.code2d : shaderInfo.code1d;
  
  // ユニフォームバッファのデータを準備
  let uniformData;
  if (is2D) {
    // 2次元の場合
    let width, height;
    if (Array.isArray(threadCount)) {
      [width, height] = threadCount;
    } else {
      width = threadCount.width;
      height = threadCount.height;
    }
    uniformData = { width: width, height, is_2d: 1 };
  } else {
    // 1次元の場合
    uniformData = { width: threadCount, height: 1, is_2d: 0 };
  }
  
  return AxRuntime.executeShader(
    shaderInfo.name,
    code,
    [uniformData, ...shaderInfo.buffers],
    shaderInfo.bufferTypes,
    threadCount
  );
}
`;
}

/**
 * ランタイムライブラリのインポート文を生成する
 * @returns {string} インポート文
 */
function generateImports() {
  return `import { AxRuntime, AxFloat32Array, AxInt32Array, AxUint32Array } from './runtime.js';\n`;
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
  const wrapperFunctions = [];
  
  for (const funcInfo of computeFunctions) {
    // WGSLコードを生成
    wgslShaders[funcInfo.name] = convertToWGSL(funcInfo);
    
    // バッファパラメータを解析
    const bufferParams = [];
    for (const param of funcInfo.params) {
      const bufferInfo = parseBufferType(param);
      if (bufferInfo) {
        bufferParams.push(bufferInfo);
      }
    }
    
    // ラッパー関数を生成
    wrapperFunctions.push(generateWrapperFunction(funcInfo.name, bufferParams));
  }
  
  // 5. シェーダーコードをJSに埋め込む
  if (Object.keys(wgslShaders).length > 0) {
    // ランタイムライブラリのインポート文を追加
    result = generateImports() + result;
    
    // ラッパー関数を追加
    result += '\n\n// WebGPU Wrapper Functions\n';
    result += wrapperFunctions.join('\n');

    // dispatch関数を追加
    result += '\n\n' + generateDispatchFunction();
    
    // シェーダーコードを追加
    result += '\n\n// Generated WGSL Shader Code\n';
    result += 'const shaderCode = {\n';
    
    const entries = Object.entries(wgslShaders);
    let i = 0;
    for (const [name, codes] of entries) {
      // 1次元シェーダーコード
      result += `  ${name}_1d: \`${codes['1d']}\`,\n`;
      // 2次元シェーダーコード
      result += `  ${name}_2d: \`${codes['2d']}\`${i < entries.length - 1 ? ',' : ''}\n`;
      i++;
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
