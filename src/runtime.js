/**
 * JSS - JavaScript Shader Extension
 * ランタイムライブラリ
 */

/**
 * JSS（JavaScript Shader Extension）のランタイムクラス
 * WebGPUの初期化と管理を行う
 */
export class JSS {
  // プライベート静的フィールド
  static #device = null;
  static #initialized = false;
  static #shaderModules = new Map();
  static #pipelines = new Map();
  
  /**
   * WebGPUを初期化する
   * @returns {Promise<GPUDevice>} 初期化されたGPUデバイス
   */
  static async init() {
    if (this.#initialized) return this.#device;
    
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }
    
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get GPU adapter');
    }
    
    this.#device = await adapter.requestDevice();
    this.#initialized = true;
    
    return this.#device;
  }
  
  /**
   * 現在のGPUデバイスを取得する
   * @returns {GPUDevice} GPUデバイス
   */
  static getDevice() {
    if (!this.#initialized) {
      throw new Error('JSS not initialized. Call JSS.init() first.');
    }
    return this.#device;
  }
  
  /**
   * シェーダーモジュールを作成または取得する
   * @param {string} name シェーダー名
   * @param {string} code WGSLコード
   * @returns {GPUShaderModule} シェーダーモジュール
   */
  static getShaderModule(name, code) {
    if (!this.#shaderModules.has(name)) {
      const device = this.getDevice();
      const shaderModule = device.createShaderModule({
        code
      });
      this.#shaderModules.set(name, shaderModule);
    }
    return this.#shaderModules.get(name);
  }
  
  /**
   * コンピュートパイプラインを作成または取得する
   * @param {string} name シェーダー名
   * @param {GPUShaderModule} shaderModule シェーダーモジュール
   * @param {Array<{type: string, visibility: number}>} bufferTypes バッファタイプの配列
   * @returns {{pipeline: GPUComputePipeline, bindGroupLayout: GPUBindGroupLayout}} パイプラインとバインドグループレイアウト
   */
  static getPipeline(name, shaderModule, bufferTypes) {
    if (!this.#pipelines.has(name)) {
      const device = this.getDevice();
      
      // バインドグループレイアウトを作成
      const entries = bufferTypes.map((type, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type }
      }));
      
      const bindGroupLayout = device.createBindGroupLayout({
        entries
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
          entryPoint: name
        }
      });
      
      this.#pipelines.set(name, { pipeline, bindGroupLayout });
    }
    
    return this.#pipelines.get(name);
  }
  
  /**
   * シェーダーを実行する
   * @param {string} name シェーダー名
   * @param {string} code WGSLコード
   * @param {Array<GPUBuffer>} buffers GPUバッファの配列
   * @param {Array<string>} bufferTypes バッファタイプの配列（'read-only-storage' または 'storage'）
   * @returns {Promise<void>}
   */
  static async executeShader(name, code, buffers, bufferTypes) {
    const device = this.getDevice();
    
    // シェーダーモジュールを取得
    const shaderModule = this.getShaderModule(name, code);
    
    // パイプラインを取得
    const { pipeline, bindGroupLayout } = this.getPipeline(name, shaderModule, bufferTypes);
    
    // バインドグループを作成
    const entries = buffers.map((buffer, i) => ({
      binding: i,
      resource: {
        buffer
      }
    }));
    
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries
    });
    
    // コマンドエンコーダを作成
    const commandEncoder = device.createCommandEncoder();
    
    // コンピュートパスを作成
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    
    // ワークグループ数を計算（ワークグループサイズ64に合わせて調整）
    // 最初のバッファのサイズを基準にする
    const workgroupSize = 64;
    const bufferSize = buffers[0].size;
    const elementSize = 4; // Float32 = 4 bytes
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
  
  /**
   * バッファから結果を読み取る
   * @param {GPUBuffer} buffer 読み取り元のバッファ
   * @param {number} size 読み取るサイズ（バイト単位）
   * @returns {Promise<Float32Array>} 読み取ったデータ
   */
  static async readBuffer(buffer, size) {
    const device = this.getDevice();
    
    // ステージングバッファを作成
    const stagingBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    
    // コマンドエンコーダを作成
    const commandEncoder = device.createCommandEncoder();
    
    // バッファをコピー
    commandEncoder.copyBufferToBuffer(
      buffer, 0,
      stagingBuffer, 0,
      size
    );
    
    // コマンドをキューに送信
    device.queue.submit([commandEncoder.finish()]);
    
    // 結果を読み取り
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(stagingBuffer.getMappedRange());
    
    // コピーを作成（バッファをunmapした後もデータを保持するため）
    const resultCopy = new Float32Array(resultData.length);
    resultCopy.set(resultData);
    
    // リソースを解放
    stagingBuffer.unmap();
    
    return resultCopy;
  }
}
