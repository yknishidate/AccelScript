const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const generate = require('@babel/generator').default;

/**
 * シェーダー関数を抽出する前処理
 * @param {string} source JavaScriptのソースコード
 * @returns {{jsCode: string, computeFunctions: Array<{name: string, params: string[], body: string}>, vertexFunctions: Array<{name: string, params: string[], body: string}>, fragmentFunctions: Array<{name: string, params: string[], body: string}>}}
 */
function preprocess(source) {
  // 結果を格納するオブジェクト
  const result = {
    jsCode: source,
    computeFunctions: [],
    vertexFunctions: [],
    fragmentFunctions: []
  };

  // @compute属性を持つ関数を検出する正規表現
  // デコレータ構文: @compute\nfunction name(...) {...}
  const computeRegex = /@compute[\s\n]+function\s+(\w+)\s*\(([^)]*)\)\s*{([\s\S]*?)}/g;
  
  // @vertex属性を持つ関数を検出する正規表現（改良版）
  const vertexRegex = /@vertex[\s\n]+function\s+(\w+)\s*\(([^{]*)\)\s*{([\s\S]*?)}/g;

  // @fragment属性を持つ関数を検出する正規表現（改良版）
  const fragmentRegex = /@fragment[\s\n]+function\s+(\w+)\s*\(([^{]*)\)\s*{([\s\S]*?)}/g;
  
  // @compute属性を持つ関数を検出し、JSコードから除外する
  let match;
  while ((match = computeRegex.exec(source)) !== null) {
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
  
  // @vertex属性を持つ関数を検出し、JSコードから除外する
  while ((match = vertexRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const functionName = match[1];
    const params = match[2].split(',').map(param => param.trim()).filter(Boolean);
    const functionBody = match[3];
    
    // 検出した関数情報を保存
    result.vertexFunctions.push({
      name: functionName,
      params,
      body: functionBody
    });
    
    // JSコードから@vertex関数を除外
    result.jsCode = result.jsCode.replace(fullMatch, '');
  }
  
  // @fragment属性を持つ関数を検出し、JSコードから除外する
  while ((match = fragmentRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const functionName = match[1];
    const params = match[2].split(',').map(param => param.trim()).filter(Boolean);
    const functionBody = match[3];
    
    // 検出した関数情報を保存
    result.fragmentFunctions.push({
      name: functionName,
      params,
      body: functionBody
    });
    
    // JSコードから@fragment関数を除外
    result.jsCode = result.jsCode.replace(fullMatch, '');
  }
  
  return result;
}

/**
 * パラメータ型情報を解析する
 * @param {string} paramStr パラメータ文字列
 * @returns {Object} パラメータ情報
 */
function parseParamType(paramStr) {
  // バッファ型の解析（例: "inputA: read<f32[]>"）
  const bufferMatch = paramStr.match(/(\w+)\s*:\s*(read|write)<(\w+)(?:\[\])?>/);
  if (bufferMatch) {
    const [, name, access, type] = bufferMatch;
    return { 
      kind: 'buffer',
      name, 
      access, 
      type 
    };
  }
  
  // ビルトイン属性の解析（例: "@builtin(vertex_index) vertexIndex: u32"）
  const builtinMatch = paramStr.match(/@builtin\((\w+)\)\s+(\w+)\s*:\s*(\w+)(?:<([^>]+)>)?/);
  if (builtinMatch) {
    const [, builtin, name, type, templateType] = builtinMatch;
    return { 
      kind: 'builtin',
      name, 
      builtin, 
      type,
      templateType
    };
  }
  
  // ロケーション属性の解析（例: "@location(0) position: vec3<f32>"）
  const locationMatch = paramStr.match(/@location\((\d+)\)\s+(\w+)\s*:\s*(\w+)(?:<([^>]+)>)?/);
  if (locationMatch) {
    const [, location, name, type, templateType] = locationMatch;
    return { 
      kind: 'location',
      name, 
      location: parseInt(location), 
      type,
      templateType
    };
  }
  
  // 出力パラメータの解析（例: "@location(0) @out color: vec4<f32>"）
  const outLocationMatch = paramStr.match(/@location\((\d+)\)\s+@out\s+(\w+)\s*:\s*(\w+)(?:<([^>]+)>)?/);
  if (outLocationMatch) {
    const [, location, name, type, templateType] = outLocationMatch;
    return { 
      kind: 'out_location',
      name, 
      location: parseInt(location), 
      type,
      templateType
    };
  }
  
  // ビルトイン出力属性の解析（例: "@builtin(position) @out pos: vec4<f32>"）
  const outBuiltinMatch = paramStr.match(/@builtin\((\w+)\)\s+@out\s+(\w+)\s*:\s*(\w+)(?:<([^>]+)>)?/);
  if (outBuiltinMatch) {
    const [, builtin, name, type, templateType] = outBuiltinMatch;
    return { 
      kind: 'out_builtin',
      name, 
      builtin, 
      type,
      templateType
    };
  }
  
  // 通常の型の解析（例: "scale: f32"）
  const normalMatch = paramStr.match(/(\w+)\s*:\s*(\w+)(?:<([^>]+)>)?/);
  if (normalMatch) {
    const [, name, type, templateType] = normalMatch;
    return { 
      kind: 'normal',
      name, 
      type,
      templateType
    };
  }
  
  return null;
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
    const bufferInfo = parseParamType(param);
    if (bufferInfo && bufferInfo.kind === 'buffer') {
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
 * JavaScript関数をWGSLの頂点シェーダーに変換する
 * @param {{name: string, params: string[], body: string}} functionInfo 関数情報
 * @returns {string} WGSLコード
 */
function convertToVertexWGSL(functionInfo) {
  // パラメータを解析
  const params = [];
  for (const param of functionInfo.params) {
    const paramInfo = parseParamType(param);
    if (paramInfo) {
      params.push(paramInfo);
    }
  }
  
  // バッファパラメータを抽出
  const bufferParams = params.filter(p => p.kind === 'buffer');
  
  // バッファバインディングを生成
  let bufferBindings = '';
  for (let i = 0; i < bufferParams.length; i++) {
    const { name, access, type } = bufferParams[i];
    const storageAccess = access === 'read' ? 'read' : 'read_write';
    bufferBindings += `@group(0) @binding(${i}) var<storage, ${storageAccess}> ${name}: array<${type}>;\n`;
  }
  
  // 入力パラメータを生成
  const inputParams = params.filter(p => ['builtin', 'location', 'normal'].includes(p.kind));
  let inputDeclarations = '';
  for (const param of inputParams) {
    if (param.kind === 'builtin') {
      inputDeclarations += `@builtin(${param.builtin}) ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n  `;
    } else if (param.kind === 'location') {
      inputDeclarations += `@location(${param.location}) ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n  `;
    } else {
      inputDeclarations += `${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n  `;
    }
  }
  
  // 出力パラメータを生成
  const outputParams = params.filter(p => ['out_builtin', 'out_location'].includes(p.kind));
  let outputStruct = '';
  let outputDeclarations = '';
  
  if (outputParams.length > 0) {
    outputStruct = 'struct VertexOutput {\n';
    for (const param of outputParams) {
      if (param.kind === 'out_builtin') {
        outputStruct += `  @builtin(${param.builtin}) ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n`;
      } else if (param.kind === 'out_location') {
        outputStruct += `  @location(${param.location}) ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n`;
      }
    }
    outputStruct += '};\n\n';
    
    outputDeclarations = ') -> VertexOutput {\n  var output: VertexOutput;\n  ';
  } else {
    outputDeclarations = ') {\n  ';
  }
  
  // WGSLコードを生成
  const wgslCode = `${outputStruct}${bufferBindings}
@vertex
fn ${functionInfo.name}(
  ${inputDeclarations}${outputDeclarations}${functionInfo.body.replace(/@out\s+(\w+)/g, 'output.$1')}
  ${outputParams.length > 0 ? '\n  return output;' : ''}
}
`;
  
  return wgslCode;
}

/**
 * JavaScript関数をWGSLのフラグメントシェーダーに変換する
 * @param {{name: string, params: string[], body: string}} functionInfo 関数情報
 * @returns {string} WGSLコード
 */
function convertToFragmentWGSL(functionInfo) {
  // パラメータを解析
  const params = [];
  for (const param of functionInfo.params) {
    const paramInfo = parseParamType(param);
    if (paramInfo) {
      params.push(paramInfo);
    }
  }
  
  // バッファパラメータを抽出
  const bufferParams = params.filter(p => p.kind === 'buffer');
  
  // バッファバインディングを生成
  let bufferBindings = '';
  for (let i = 0; i < bufferParams.length; i++) {
    const { name, access, type } = bufferParams[i];
    const storageAccess = access === 'read' ? 'read' : 'read_write';
    bufferBindings += `@group(0) @binding(${i}) var<storage, ${storageAccess}> ${name}: array<${type}>;\n`;
  }
  
  // 入力パラメータを生成
  const inputParams = params.filter(p => ['builtin', 'location', 'normal'].includes(p.kind));
  let inputDeclarations = '';
  for (const param of inputParams) {
    if (param.kind === 'builtin') {
      inputDeclarations += `@builtin(${param.builtin}) ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n  `;
    } else if (param.kind === 'location') {
      inputDeclarations += `@location(${param.location}) ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n  `;
    } else {
      inputDeclarations += `${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''},\n  `;
    }
  }
  
  // 出力パラメータを生成
  const outputParams = params.filter(p => ['out_builtin', 'out_location'].includes(p.kind));
  let outputDeclarations = '';
  
  if (outputParams.length > 0) {
    outputDeclarations = ') {\n  ';
    for (const param of outputParams) {
      if (param.kind === 'out_builtin') {
        outputDeclarations += `var ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''};\n  `;
      } else if (param.kind === 'out_location') {
        outputDeclarations += `var ${param.name}: ${param.type}${param.templateType ? `<${param.templateType}>` : ''};\n  `;
      }
    }
  } else {
    outputDeclarations = ') {\n  ';
  }
  
  // WGSLコードを生成
  const wgslCode = `${bufferBindings}
@fragment
fn ${functionInfo.name}(
  ${inputDeclarations}${outputDeclarations}${functionInfo.body.replace(/@out\s+(\w+)/g, '$1')}
}
`;
  
  return wgslCode;
}

/**
 * コンピュートシェーダー用のラッパー関数を生成する
 * @param {string} funcName 関数名
 * @param {Array<{name: string, access: string, type: string}>} bufferParams バッファパラメータ
 * @returns {string} ラッパー関数のコード
 */
function generateComputeWrapperFunction(funcName, bufferParams) {
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

/**
 * 頂点シェーダー用のラッパー関数を生成する
 * @param {string} funcName 関数名
 * @param {Array<Object>} params パラメータ情報
 * @returns {string} ラッパー関数のコード
 */
function generateVertexWrapperFunction(funcName, params) {
  // バッファパラメータの名前を取得
  const bufferParams = params.filter(p => p.kind === 'buffer');
  const paramNames = bufferParams.map(param => param.name);
  
  // バッファタイプの配列を生成
  const bufferTypes = bufferParams.map(param => 
    param.access === 'read' ? 'read-only-storage' : 'storage'
  );
  
  return `
// 頂点シェーダーラッパー関数
function ${funcName}(${paramNames.join(', ')}) {
  // シェーダー情報を返す（実行はしない）
  return {
    type: 'vertex',
    name: '${funcName}',
    code: shaderCode.${funcName},
    buffers: [${paramNames.join(', ')}],
    bufferTypes: [${bufferTypes.map(type => `'${type}'`).join(', ')}]
  };
}
`;
}

/**
 * フラグメントシェーダー用のラッパー関数を生成する
 * @param {string} funcName 関数名
 * @param {Array<Object>} params パラメータ情報
 * @returns {string} ラッパー関数のコード
 */
function generateFragmentWrapperFunction(funcName, params) {
  // バッファパラメータの名前を取得
  const bufferParams = params.filter(p => p.kind === 'buffer');
  const paramNames = bufferParams.map(param => param.name);
  
  // バッファタイプの配列を生成
  const bufferTypes = bufferParams.map(param => 
    param.access === 'read' ? 'read-only-storage' : 'storage'
  );
  
  return `
// フラグメントシェーダーラッパー関数
function ${funcName}(${paramNames.join(', ')}) {
  // シェーダー情報を返す（実行はしない）
  return {
    type: 'fragment',
    name: '${funcName}',
    code: shaderCode.${funcName},
    buffers: [${paramNames.join(', ')}],
    bufferTypes: [${bufferTypes.map(type => `'${type}'`).join(', ')}]
  };
}
`;
}

/**
 * レンダリングパイプライン作成関数を生成する
 * @returns {string} レンダリングパイプライン作成関数のコード
 */
function generateCreateRenderPipelineFunction() {
  return `
// レンダリングパイプライン作成関数
function createRenderPipeline(vertexShader, fragmentShader, options = {}) {
  return {
    type: 'render_pipeline',
    vertexShader,
    fragmentShader,
    primitiveTopology: options.primitiveTopology || 'triangle-list',
    cullMode: options.cullMode || 'none',
    format: options.format || 'bgra8unorm'
  };
}
`;
}

/**
 * レンダリング実行関数を生成する
 * @returns {string} レンダリング実行関数のコード
 */
function generateRenderFunction() {
  return `
// レンダリング実行関数
async function render(renderPipeline, options = {}) {
  if (!renderPipeline || renderPipeline.type !== 'render_pipeline') {
    throw new Error('Invalid render pipeline');
  }
  
  return AxRuntime.executeRenderPipeline(
    renderPipeline.vertexShader,
    renderPipeline.fragmentShader,
    {
      vertexCount: options.vertexCount || 0,
      instanceCount: options.instanceCount || 1,
      firstVertex: options.firstVertex || 0,
      firstInstance: options.firstInstance || 0,
      primitiveTopology: renderPipeline.primitiveTopology,
      cullMode: renderPipeline.cullMode,
      format: renderPipeline.format
    }
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
 * ソースコードを変換し、シェーダー関数をWGSLに変換してJSに埋め込む
 * @param {string} source JavaScriptのソースコード
 * @returns {string} 変換後のJavaScriptコード
 */
function transpile(source) {
  console.log('source:', source);

  // 1. 前処理: シェーダー関数を抽出
  const { jsCode, computeFunctions, vertexFunctions, fragmentFunctions } = preprocess(source);
  console.log('jsCode:', jsCode);
  console.log('computeFunctions:', computeFunctions);
  console.log('vertexFunctions:', vertexFunctions);
  console.log('fragmentFunctions:', fragmentFunctions);
  
  // 2. 残りのJSコードをASTに変換
  const ast = parser.parse(jsCode, {
    sourceType: 'module',
    plugins: ['decorators-legacy']
  });
  
  // 3. ASTをJavaScriptに変換
  let result = generate(ast).code;
  
  // 4. 各シェーダー関数をWGSLに変換
  const wgslShaders = {};
  const wrapperFunctions = [];
  let hasRenderingFunctions = false;
  
  // コンピュートシェーダーの変換
  for (const funcInfo of computeFunctions) {
    // WGSLコードを生成
    wgslShaders[funcInfo.name] = convertToWGSL(funcInfo);
    
    // バッファパラメータを解析
    const bufferParams = [];
    for (const param of funcInfo.params) {
      const bufferInfo = parseParamType(param);
      if (bufferInfo && bufferInfo.kind === 'buffer') {
        bufferParams.push(bufferInfo);
      }
    }
    
    // ラッパー関数を生成
    wrapperFunctions.push(generateComputeWrapperFunction(funcInfo.name, bufferParams));
  }
  
  // 頂点シェーダーの変換
  for (const funcInfo of vertexFunctions) {
    // WGSLコードを生成
    wgslShaders[funcInfo.name] = convertToVertexWGSL(funcInfo);
    
    // パラメータを解析
    const params = [];
    for (const param of funcInfo.params) {
      const paramInfo = parseParamType(param);
      if (paramInfo) {
        params.push(paramInfo);
      }
    }
    
    // ラッパー関数を生成
    wrapperFunctions.push(generateVertexWrapperFunction(funcInfo.name, params));
    hasRenderingFunctions = true;
  }
  
  // フラグメントシェーダーの変換
  for (const funcInfo of fragmentFunctions) {
    // WGSLコードを生成
    wgslShaders[funcInfo.name] = convertToFragmentWGSL(funcInfo);
    
    // パラメータを解析
    const params = [];
    for (const param of funcInfo.params) {
      const paramInfo = parseParamType(param);
      if (paramInfo) {
        params.push(paramInfo);
      }
    }
    
    // ラッパー関数を生成
    wrapperFunctions.push(generateFragmentWrapperFunction(funcInfo.name, params));
    hasRenderingFunctions = true;
  }
  
  // 5. シェーダーコードをJSに埋め込む
  if (Object.keys(wgslShaders).length > 0) {
    // ランタイムライブラリのインポート文を追加
    result = generateImports() + result;
    
    // ラッパー関数を追加
    result += '\n\n// WebGPU Wrapper Functions\n';
    result += wrapperFunctions.join('\n');
    
    // レンダリング関連の関数を追加（頂点またはフラグメントシェーダーがある場合）
    if (hasRenderingFunctions) {
      result += '\n\n// Rendering Functions\n';
      result += generateCreateRenderPipelineFunction();
      result += generateRenderFunction();
    }

    // シェーダーコードを追加
    result += '\n\n// Generated WGSL Shader Code\n';
    result += 'const shaderCode = {\n';
    
    // コンピュートシェーダーコード
    const computeEntries = Object.entries(wgslShaders).filter(([name]) => 
      computeFunctions.some(func => func.name === name)
    );
    
    for (let i = 0; i < computeEntries.length; i++) {
      const [name, codes] = computeEntries[i];
      // 1次元シェーダーコード
      result += `  ${name}_1d: \`${codes['1d']}\`,\n`;
      // 2次元シェーダーコード
      result += `  ${name}_2d: \`${codes['2d']}\`${i < computeEntries.length - 1 || vertexFunctions.length > 0 || fragmentFunctions.length > 0 ? ',' : ''}\n`;
    }
    
    // 頂点シェーダーコード
    for (let i = 0; i < vertexFunctions.length; i++) {
      const name = vertexFunctions[i].name;
      result += `  ${name}: \`${wgslShaders[name]}\`${i < vertexFunctions.length - 1 || fragmentFunctions.length > 0 ? ',' : ''}\n`;
    }
    
    // フラグメントシェーダーコード
    for (let i = 0; i < fragmentFunctions.length; i++) {
      const name = fragmentFunctions[i].name;
      result += `  ${name}: \`${wgslShaders[name]}\`${i < fragmentFunctions.length - 1 ? ',' : ''}\n`;
    }
    
    result += '};\n';
  }
  
  return result;
}

module.exports = {
  preprocess,
  parseParamType,
  convertToWGSL,
  convertToVertexWGSL,
  convertToFragmentWGSL,
  transpile
};
