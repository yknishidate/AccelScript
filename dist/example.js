/**
 * JSS - JavaScript Shader Extension の実用例
 * WebGPUを使用して@compute関数を実行する例
 */

// @compute属性を持つ関数（WGSLのcompute shaderに変換される）
// バッファの型情報を引数に指定することで、自動的にバインディングが生成されます

// 新しいシンプルな使用例
async function runSimpleExample() {
  // WebGPUを初期化
  await initJSS();

  // 入力データを準備
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);

  // GPUバッファを作成
  const device = globalThis.__JSS_DEVICE__;
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

  // 入力データをGPUバッファにコピー
  device.queue.writeBuffer(inputABuffer, 0, data);
  device.queue.writeBuffer(inputBBuffer, 0, data);

  // 計算を実行（自動生成されたラッパー関数を使用）
  await addVectors(inputABuffer, inputBBuffer, outputBuffer);

  // 結果を読み取るためのステージングバッファを作成
  const stagingBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });

  // 結果をステージングバッファにコピー
  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, data.byteLength);
  device.queue.submit([commandEncoder.finish()]);

  // 結果を読み取り
  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const resultData = new Float32Array(stagingBuffer.getMappedRange());

  // 結果を表示
  console.log('Input A:', data);
  console.log('Input B:', data);
  console.log('Result:', resultData);

  // リソースを解放
  stagingBuffer.unmap();
}

// 計算を実行
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    runSimpleExample().catch(console.error);
  });
}

// Node.jsでの実行用（WebGPUがサポートされていない場合はスキップ）
if (typeof module !== 'undefined') {
  module.exports = {
    runSimpleExample
  };
}

// JSS WebGPU Initialization

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


// JSS WebGPU Wrapper Functions

// WebGPUラッパー関数
async function addVectors(inputA, inputB, output) {
  // グローバルデバイスが初期化されているか確認
  if (!globalThis.__JSS_DEVICE__) {
    throw new Error('WebGPU device not initialized. Call initJSS() first.');
  }
  const device = globalThis.__JSS_DEVICE__;
  
  // 関数固有のリソースを初期化
  if (!addVectors.__resources__) {
    // シェーダーモジュールを作成
    const shaderModule = device.createShaderModule({
      code: shaderCode.addVectors
    });
    
    // バインドグループレイアウトを作成
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' }
        }
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
        entryPoint: 'addVectors'
      }
    });
    
    // リソースを保存
    addVectors.__resources__ = {
      bindGroupLayout,
      pipeline
    };
  }
  
  // バインドグループを作成
  const bindGroup = device.createBindGroup({
    layout: addVectors.__resources__.bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: inputA
        }
      },
      {
        binding: 1,
        resource: {
          buffer: inputB
        }
      },
      {
        binding: 2,
        resource: {
          buffer: output
        }
      }
    ]
  });
  
  // コマンドエンコーダを作成
  const commandEncoder = device.createCommandEncoder();
  
  // コンピュートパスを作成
  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(addVectors.__resources__.pipeline);
  computePass.setBindGroup(0, bindGroup);
  
  // ワークグループ数を計算（ワークグループサイズ64に合わせて調整）
  // 最初のバッファのサイズを基準にする
  const workgroupSize = 64;
  const bufferSize = inputA.size;
  const elementSize = inputA.constructor.BYTES_PER_ELEMENT || 4;
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


// Generated WGSL Shader Code
const shaderCode = {
  addVectors: `@group(0) @binding(0) var<storage, read> inputA: array<f32>;
@group(0) @binding(1) var<storage, read> inputB: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64)  // 一般的なワークグループサイズ（GPUによって最適値は異なる）
fn addVectors(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // グローバルインボケーションIDからインデックスを取得
  let index = global_id.x;
  
  // インデックスが配列の範囲内かチェック（バッファオーバーランを防止）
  // 最初のバッファがある場合、そのサイズをチェックに使用
  if (index < arrayLength(&inputA)) {
    
  // 入力バッファからデータを読み取り
  // indexはglobal_id.xから自動的に取得されます
  let a = inputA[index];
  let b = inputB[index];
  
  // 計算結果を出力バッファに書き込み
  output[index] = a + b;

  }
}
`
};
