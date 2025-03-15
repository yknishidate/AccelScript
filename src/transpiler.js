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
 * @returns {string} WGSLコード
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
  
  // バッファバインディングを生成
  let bufferBindings = '';
  for (let i = 0; i < bufferParams.length; i++) {
    const { name, access, type } = bufferParams[i];
    const storageAccess = access === 'read' ? 'read' : 'read_write';
    bufferBindings += `@group(0) @binding(${i}) var<storage, ${storageAccess}> ${name}: array<${type}>;\n`;
  }
  
  // WGSLコードを生成
  const wgslCode = `${bufferBindings}
@compute @workgroup_size(64)  // 一般的なワークグループサイズ（GPUによって最適値は異なる）
fn ${functionInfo.name}(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // グローバルインボケーションIDからインデックスを取得
  let index = global_id.x;
  
  // インデックスが配列の範囲内かチェック（バッファオーバーランを防止）
  // 最初のバッファがある場合、そのサイズをチェックに使用
  ${bufferParams.length > 0 ? `if (index < arrayLength(&${bufferParams[0].name})) {` : ''}
    ${functionInfo.body}
  ${bufferParams.length > 0 ? '}' : ''}
}
`;
  
  return wgslCode;
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
  
  return `
// WebGPUラッパー関数
async function ${funcName}(${paramNames.join(', ')}) {
  // グローバルデバイスが初期化されているか確認
  if (!globalThis.__JSS_DEVICE__) {
    throw new Error('WebGPU device not initialized. Call initJSS() first.');
  }
  const device = globalThis.__JSS_DEVICE__;
  
  // 関数固有のリソースを初期化
  if (!${funcName}.__resources__) {
    // シェーダーモジュールを作成
    const shaderModule = device.createShaderModule({
      code: shaderCode.${funcName}
    });
    
    // バインドグループレイアウトを作成
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        ${bufferParams.map((param, i) => `{
          binding: ${i},
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: '${param.access === 'read' ? 'read-only-storage' : 'storage'}' }
        }`).join(',\n        ')}
      ]
    });
    
    // パイプラインレイアウトを作成
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });
    
    // コンピュートパイプラインを作成
    const pipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: '${funcName}'
      }
    });
    
    // リソースを保存
    ${funcName}.__resources__ = {
      bindGroupLayout,
      pipeline
    };
  }
  
  // バインドグループを作成
  const bindGroup = device.createBindGroup({
    layout: ${funcName}.__resources__.bindGroupLayout,
    entries: [
      ${bufferParams.map((param, i) => `{
        binding: ${i},
        resource: {
          buffer: ${param.name}
        }
      }`).join(',\n      ')}
    ]
  });
  
  // コマンドエンコーダを作成
  const commandEncoder = device.createCommandEncoder();
  
  // コンピュートパスを作成
  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(${funcName}.__resources__.pipeline);
  computePass.setBindGroup(0, bindGroup);
  
  // ワークグループ数を計算（ワークグループサイズ64に合わせて調整）
  // 最初のバッファのサイズを基準にする
  const workgroupSize = 64;
  const bufferSize = ${bufferParams.length > 0 ? `${bufferParams[0].name}.size` : '0'};
  const elementSize = ${bufferParams.length > 0 ? `${bufferParams[0].name}.constructor.BYTES_PER_ELEMENT || 4` : '4'};
  const elementCount = bufferSize / elementSize;
  const workgroupCount = Math.ceil(elementCount / workgroupSize);
  
  computePass.dispatchWorkgroups(workgroupCount);
  computePass.end();
  
  // コマンドをキューに送信
  const commands = commandEncoder.finish();
  device.queue.submit([commands]);
  
  // 処理完了を待機（非同期）
  return Promise.resolve();
}
`;
}

/**
 * WebGPU初期化関数を生成する
 * @returns {string} 初期化関数のコード
 */
function generateInitFunction() {
  return `
// WebGPU初期化関数
async function initJSS() {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser');
  }
  
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to get GPU adapter');
  }
  
  const device = await adapter.requestDevice();
  globalThis.__JSS_DEVICE__ = device;
  
  return device;
}
`;
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
    // 初期化関数を追加
    result += '\n\n// JSS WebGPU Initialization\n';
    result += generateInitFunction();
    
    // ラッパー関数を追加
    result += '\n\n// JSS WebGPU Wrapper Functions\n';
    result += wrapperFunctions.join('\n');
    
    // シェーダーコードを追加
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
