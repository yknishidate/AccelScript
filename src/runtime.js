/**
 * AxFloat32Array - Float32配列とGPUバッファをラップするクラス
 * JS側の配列とGPUバッファの両方を内部に持ち、自動的に同期を行う
 */
export class AxFloat32Array {
  dirty;         // JS側のデータが変更されたかどうか
  needsReadback; // GPUからのreadbackが必要かどうか
  size;          // バッファのサイズ（バイト単位）
  
  /**
   * コンストラクタ
   * @param {number|Array|Float32Array} lengthOrArray 配列の長さまたは初期値
   */
  constructor(lengthOrArray) {
    if (typeof lengthOrArray === 'number') {
      this.array = new Float32Array(lengthOrArray);
    } else {
      this.array = new Float32Array(lengthOrArray);
    }
    
    this.size = this.array.byteLength;
    this.dirty = true;
    this.needsReadback = false;
    this.buffer = null;
    
    // プロキシを使用して配列のようにアクセスできるようにする
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'length') {
          return target.array.length;
        }
        
        const index = parseInt(prop);
        if (!isNaN(index)) {
          return target.get(index);
        }
        
        return target[prop];
      },
      set: (target, prop, value) => {
        const index = parseInt(prop);
        if (!isNaN(index)) {
          target.set(index, value);
          return true;
        }
        
        target[prop] = value;
        return true;
      }
    });
  }
  
  /**
   * 指定したインデックスの値を取得する
   * @param {number} index インデックス
   * @returns {number} 値
   */
  get(index) {
    if (this.needsReadback) {
      console.warn('GPUバッファからの読み取りが必要ですが、まだ同期されていません。古い値を返します。');
    }
    return this.array[index];
  }
  
  /**
   * 指定したインデックスに値を設定する
   * @param {number} index インデックス
   * @param {number} value 値
   */
  set(index, value) {
    this.array[index] = value;
    this.dirty = true;
  }
  
  /**
   * GPUバッファを取得する（内部的に使用）
   * @returns {GPUBuffer} GPUバッファ
   */
  getBuffer() {
    if (this.buffer === null || this.dirty) {
      this.syncToGPU();
    }
    this.needsReadback = true;
    return this.buffer;
  }
  
  /**
   * JS側のデータをGPUバッファに転送する
   */
  syncToGPU() {
    const device = AxRuntime.getDevice();
    
    // 既存のバッファがあれば破棄
    if (this.buffer !== null) {
      // WebGPUには明示的なバッファ破棄メソッドはないが、
      // 参照を削除することでガベージコレクションの対象になる
      this.buffer = null;
    }
    
    // 新しいバッファを作成
    this.buffer = device.createBuffer({
      size: this.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    
    // データをバッファにコピー
    new Float32Array(this.buffer.getMappedRange()).set(this.array);
    this.buffer.unmap();
    
    this.dirty = false;
  }
  
  /**
   * GPUバッファのデータをJS側に転送する
   */
  async syncFromGPU() {
    if (this.buffer === null) return;
    
    // バッファからデータを読み取る
    const data = await AxRuntime.readBuffer(this.buffer, this.size);
    this.array.set(data);
    
    this.needsReadback = false;
  }
  
  /**
   * ディスパッチ後に呼び出される
   */
  async afterDispatch() {
    if (this.needsReadback) {
      await this.syncFromGPU();
    }
  }
}

/**
 * AxInt32Array - Int32配列とGPUバッファをラップするクラス
 * JS側の配列とGPUバッファの両方を内部に持ち、自動的に同期を行う
 */
export class AxInt32Array {
  array;         // JS側の配列データ（Int32Array）
  buffer;        // GPUバッファ
  dirty;         // JS側のデータが変更されたかどうか
  needsReadback; // GPUからのreadbackが必要かどうか
  size;          // バッファのサイズ（バイト単位）
  
  /**
   * コンストラクタ
   * @param {number|Array|Int32Array} lengthOrArray 配列の長さまたは初期値
   */
  constructor(lengthOrArray) {
    if (typeof lengthOrArray === 'number') {
      this.array = new Int32Array(lengthOrArray);
    } else {
      this.array = new Int32Array(lengthOrArray);
    }
    
    this.size = this.array.byteLength;
    this.dirty = true;
    this.needsReadback = false;
    this.buffer = null;
    
    // プロキシを使用して配列のようにアクセスできるようにする
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'length') {
          return target.array.length;
        }
        
        const index = parseInt(prop);
        if (!isNaN(index)) {
          return target.get(index);
        }
        
        return target[prop];
      },
      set: (target, prop, value) => {
        const index = parseInt(prop);
        if (!isNaN(index)) {
          target.set(index, value);
          return true;
        }
        
        target[prop] = value;
        return true;
      }
    });
  }
  
  /**
   * 指定したインデックスの値を取得する
   * @param {number} index インデックス
   * @returns {number} 値
   */
  get(index) {
    if (this.needsReadback) {
      console.warn('GPUバッファからの読み取りが必要ですが、まだ同期されていません。古い値を返します。');
    }
    return this.array[index];
  }
  
  /**
   * 指定したインデックスに値を設定する
   * @param {number} index インデックス
   * @param {number} value 値
   */
  set(index, value) {
    this.array[index] = value;
    this.dirty = true;
  }
  
  /**
   * GPUバッファを取得する（内部的に使用）
   * @returns {GPUBuffer} GPUバッファ
   */
  getBuffer() {
    if (this.buffer === null || this.dirty) {
      this.syncToGPU();
    }
    this.needsReadback = true;
    return this.buffer;
  }
  
  /**
   * JS側のデータをGPUバッファに転送する
   */
  syncToGPU() {
    const device = AxRuntime.getDevice();
    
    // 既存のバッファがあれば破棄
    if (this.buffer !== null) {
      // WebGPUには明示的なバッファ破棄メソッドはないが、
      // 参照を削除することでガベージコレクションの対象になる
      this.buffer = null;
    }
    
    // 新しいバッファを作成
    this.buffer = device.createBuffer({
      size: this.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    
    // データをバッファにコピー
    new Int32Array(this.buffer.getMappedRange()).set(this.array);
    this.buffer.unmap();
    
    this.dirty = false;
  }
  
  /**
   * GPUバッファのデータをJS側に転送する
   */
  async syncFromGPU() {
    if (this.buffer === null) return;
    
    // バッファからデータを読み取る
    const device = AxRuntime.getDevice();
    
    // ステージングバッファを作成
    const stagingBuffer = device.createBuffer({
      size: this.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    
    // コマンドエンコーダを作成
    const commandEncoder = device.createCommandEncoder();
    
    // バッファをコピー
    commandEncoder.copyBufferToBuffer(
      this.buffer, 0,
      stagingBuffer, 0,
      this.size
    );
    
    // コマンドをキューに送信
    device.queue.submit([commandEncoder.finish()]);
    
    // 結果を読み取り
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Int32Array(stagingBuffer.getMappedRange());
    
    // コピーを作成（バッファをunmapした後もデータを保持するため）
    this.array.set(resultData);
    
    // リソースを解放
    stagingBuffer.unmap();
    
    this.needsReadback = false;
  }
  
  /**
   * ディスパッチ後に呼び出される
   */
  async afterDispatch() {
    if (this.needsReadback) {
      await this.syncFromGPU();
    }
  }
}

/**
 * AxUint32Array - Uint32配列とGPUバッファをラップするクラス
 * JS側の配列とGPUバッファの両方を内部に持ち、自動的に同期を行う
 */
export class AxUint32Array {
  array;         // JS側の配列データ（Uint32Array）
  buffer;        // GPUバッファ
  dirty;         // JS側のデータが変更されたかどうか
  needsReadback; // GPUからのreadbackが必要かどうか
  size;          // バッファのサイズ（バイト単位）
  
  /**
   * コンストラクタ
   * @param {number|Array|Uint32Array} lengthOrArray 配列の長さまたは初期値
   */
  constructor(lengthOrArray) {
    if (typeof lengthOrArray === 'number') {
      this.array = new Uint32Array(lengthOrArray);
    } else {
      this.array = new Uint32Array(lengthOrArray);
    }
    
    this.size = this.array.byteLength;
    this.dirty = true;
    this.needsReadback = false;
    this.buffer = null;
    
    // プロキシを使用して配列のようにアクセスできるようにする
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'length') {
          return target.array.length;
        }
        
        const index = parseInt(prop);
        if (!isNaN(index)) {
          return target.get(index);
        }
        
        return target[prop];
      },
      set: (target, prop, value) => {
        const index = parseInt(prop);
        if (!isNaN(index)) {
          target.set(index, value);
          return true;
        }
        
        target[prop] = value;
        return true;
      }
    });
  }
  
  /**
   * 指定したインデックスの値を取得する
   * @param {number} index インデックス
   * @returns {number} 値
   */
  get(index) {
    if (this.needsReadback) {
      console.warn('GPUバッファからの読み取りが必要ですが、まだ同期されていません。古い値を返します。');
    }
    return this.array[index];
  }
  
  /**
   * 指定したインデックスに値を設定する
   * @param {number} index インデックス
   * @param {number} value 値
   */
  set(index, value) {
    this.array[index] = value;
    this.dirty = true;
  }
  
  /**
   * GPUバッファを取得する（内部的に使用）
   * @returns {GPUBuffer} GPUバッファ
   */
  getBuffer() {
    if (this.buffer === null || this.dirty) {
      this.syncToGPU();
    }
    this.needsReadback = true;
    return this.buffer;
  }
  
  /**
   * JS側のデータをGPUバッファに転送する
   */
  syncToGPU() {
    const device = AxRuntime.getDevice();
    
    // 既存のバッファがあれば破棄
    if (this.buffer !== null) {
      // WebGPUには明示的なバッファ破棄メソッドはないが、
      // 参照を削除することでガベージコレクションの対象になる
      this.buffer = null;
    }
    
    // 新しいバッファを作成
    this.buffer = device.createBuffer({
      size: this.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    
    // データをバッファにコピー
    new Uint32Array(this.buffer.getMappedRange()).set(this.array);
    this.buffer.unmap();
    
    this.dirty = false;
  }
  
  /**
   * GPUバッファのデータをJS側に転送する
   */
  async syncFromGPU() {
    if (this.buffer === null) return;
    
    // バッファからデータを読み取る
    const device = AxRuntime.getDevice();
    
    // ステージングバッファを作成
    const stagingBuffer = device.createBuffer({
      size: this.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    
    // コマンドエンコーダを作成
    const commandEncoder = device.createCommandEncoder();
    
    // バッファをコピー
    commandEncoder.copyBufferToBuffer(
      this.buffer, 0,
      stagingBuffer, 0,
      this.size
    );
    
    // コマンドをキューに送信
    device.queue.submit([commandEncoder.finish()]);
    
    // 結果を読み取り
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Uint32Array(stagingBuffer.getMappedRange());
    
    // コピーを作成（バッファをunmapした後もデータを保持するため）
    this.array.set(resultData);
    
    // リソースを解放
    stagingBuffer.unmap();
    
    this.needsReadback = false;
  }
  
  /**
   * ディスパッチ後に呼び出される
   */
  async afterDispatch() {
    if (this.needsReadback) {
      await this.syncFromGPU();
    }
  }
}

/**
 * WebGPUの初期化と管理を行う
 */
export class AxRuntime {
  // プライベート静的フィールド
  static #device = null;
  static #initialized = false;
  static #shaderModules = new Map();
  static #computePipelines = new Map();
  static #renderPipelines = new Map();
  static #canvas = null;
  static #context = null;
  static #format = 'bgra8unorm';
  
  /**
   * WebGPUを初期化する
   * @returns {Promise<GPUDevice>} 初期化されたGPUデバイス
   */
  static async init(canvas = null) {
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

    if (canvas) {
      this.#canvas = canvas;
      this.#context = canvas.getContext('webgpu');
      // this.#format = this.#context.getPreferredFormat(adapter);
      this.#format = navigator.gpu.getPreferredCanvasFormat();
      this.#context.configure({
        device: this.#device,
        format: this.#format,
      });
    }
    
    return this.#device;
  }
  
  /**
   * 現在のGPUデバイスを取得する
   * @returns {GPUDevice} GPUデバイス
   */
  static getDevice() {
    if (!this.#initialized) {
      throw new Error('AxRuntime not initialized. Call AxRuntime.init() first.');
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
   * @param {Array<string>} bufferTypes バッファタイプの配列
   * @returns {{pipeline: GPUComputePipeline, bindGroupLayout: GPUBindGroupLayout}} パイプラインとバインドグループレイアウト
   */
  static getComputePipeline(name, shaderModule, bufferTypes) {
    // パイプライン名に次元情報が含まれているか確認
    const pipelineName = name;
    
    if (!this.#computePipelines.has(pipelineName)) {
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
      
      // シェーダー名からエントリーポイント名を抽出
      // 例: "add_1d" -> "add"
      const entryPoint = name.split('_')[0];
      
      // コンピュートパイプラインを作成
      const pipeline = device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: entryPoint
        }
      });
      
      this.#computePipelines.set(pipelineName, { pipeline, bindGroupLayout });
    }
    
    return this.#computePipelines.get(pipelineName);
  }
  
  /**
   * レンダリングパイプラインを作成または取得する
   * @param {string} vertexShaderName 頂点シェーダー名
   * @param {GPUShaderModule} vertexShaderModule 頂点シェーダーモジュール
   * @param {string} fragmentShaderName フラグメントシェーダー名
   * @param {GPUShaderModule} fragmentShaderModule フラグメントシェーダーモジュール
   * @param {Array<string>} vertexBufferTypes 頂点シェーダーのバッファタイプの配列
   * @param {Array<string>} fragmentBufferTypes フラグメントシェーダーのバッファタイプの配列
   * @param {Object} options レンダリングパイプラインのオプション
   * @returns {{pipeline: GPURenderPipeline, bindGroupLayout: GPUBindGroupLayout}} パイプラインとバインドグループレイアウト
   */
  static getRenderPipeline(
    vertexShaderName, 
    vertexShaderModule, 
    fragmentShaderName, 
    fragmentShaderModule, 
    vertexBufferTypes, 
    fragmentBufferTypes,
    options = {}
  ) {
    const pipelineName = `${vertexShaderName}_${fragmentShaderName}`;
    
    if (!this.#renderPipelines.has(pipelineName)) {
      const device = this.getDevice();
      
      // 頂点シェーダーのバインドグループレイアウトを作成
      const vertexEntries = vertexBufferTypes.map((type, i) => ({
        binding: i,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type }
      }));
      
      // フラグメントシェーダーのバインドグループレイアウトを作成
      const fragmentEntries = fragmentBufferTypes.map((type, i) => ({
        binding: i + vertexBufferTypes.length,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type }
      }));
      
      // 両方のエントリーを結合
      const entries = [...vertexEntries, ...fragmentEntries];
      
      const bindGroupLayout = device.createBindGroupLayout({
        entries
      });
      
      // パイプラインレイアウトを作成
      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
      });
      
      // レンダリングパイプラインを作成
      const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
          module: vertexShaderModule,
          entryPoint: vertexShaderName,
        },
        fragment: {
          module: fragmentShaderModule,
          entryPoint: fragmentShaderName,
          targets: [
            {
              format: this.#format,
            },
          ],
        },
        primitive: {
          topology: options.primitiveTopology || 'triangle-list',
          cullMode: options.cullMode || 'none',
        },
      });
      
      this.#renderPipelines.set(pipelineName, { pipeline, bindGroupLayout });
    }
    
    return this.#renderPipelines.get(pipelineName);
  }

  /**
   * シェーダーをディスパッチする
   * @param {Object} shaderInfo シェーダー情報
   * @param {number|Array|Object} threadCount スレッド数または{width, height}オブジェクト
   * @returns {Promise<void>}
   */
  static async dispatch(shaderInfo, threadCount) {
    if (threadCount === undefined) {
      throw new Error('threadCount must be specified');
    }
    
    // threadCountの型に基づいて次元を判定
    const is2D = (Array.isArray(threadCount) && threadCount.length === 2) || 
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
    
    return this.executeShader(
      shaderInfo.name,
      code,
      [uniformData, ...shaderInfo.buffers],
      shaderInfo.bufferTypes,
      threadCount
    );
  }
  
  /**
   * シェーダーを実行する
   * @param {string} name シェーダー名
   * @param {string} code WGSLコード
   * @param {Array<Object|GPUBuffer|AxFloat32Array|AxInt32Array|AxUint32Array>} buffers バッファの配列（最初はユニフォームデータ）
   * @param {Array<string>} bufferTypes バッファタイプの配列（'uniform', 'read-only-storage' または 'storage'）
   * @param {number|Array|Object} threadCount スレッド数または{width, height}オブジェクト
   * @returns {Promise<void>}
   */
  static async executeShader(name, code, buffers, bufferTypes, threadCount) {
    const device = this.getDevice();
    
    // threadCountの型に基づいて次元を判定
    const is2D = (Array.isArray(threadCount) && threadCount.length === 2) || 
                 (typeof threadCount === 'object' && threadCount !== null && 
                  'width' in threadCount && 'height' in threadCount);
    
    // 2次元の場合、幅と高さを取得
    let width, height;
    if (is2D) {
      if (Array.isArray(threadCount)) {
        [width, height] = threadCount;
      } else {
        width = threadCount.width;
        height = threadCount.height;
      }
    }
    
    // AxArray型のバッファをGPUバッファに変換
    const gpuBuffers = buffers.map((buffer, index) => {
      if (buffer instanceof AxFloat32Array || 
          buffer instanceof AxInt32Array || 
          buffer instanceof AxUint32Array) {
        return buffer.getBuffer();
      }
      
      // 最初のバッファはユニフォームバッファ
      if (index === 0 && bufferTypes[0] === 'uniform') {
        // ユニフォームバッファを作成
        const uniformBuffer = device.createBuffer({
          size: 12, // 3つのu32（thread_count, height, is_2d）
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        // ユニフォームデータを書き込む
        const uniformData = new Uint32Array([
          buffer.width,
          buffer.height,
          buffer.is_2d
        ]);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);
        
        return uniformBuffer;
      }
      
      return buffer;
    });
    
    // シェーダーモジュールを取得
    const shaderModule = this.getShaderModule(name, code);
    
    // パイプラインを取得
    const { pipeline, bindGroupLayout } = this.getComputePipeline(name, shaderModule, bufferTypes);
    
    // バインドグループを作成
    const entries = gpuBuffers.map((buffer, i) => ({
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
    
    // ワークグループ数を計算
    if (is2D) {
      // 2次元の場合（ワークグループサイズ 8x8）
      const workgroupSizeX = 8;
      const workgroupSizeY = 8;
      const workgroupCountX = Math.ceil(width / workgroupSizeX);
      const workgroupCountY = Math.ceil(height / workgroupSizeY);
      
      computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
    } else {
      // 1次元の場合（ワークグループサイズ 64）
      const workgroupSize = 64;
      const workgroupCount = Math.ceil(threadCount / workgroupSize);
      
      computePass.dispatchWorkgroups(workgroupCount);
    }
    
    computePass.end();
    
    // コマンドをキューに送信
    const commands = commandEncoder.finish();
    device.queue.submit([commands]);
    
    // 実行後、AxArray型のバッファを同期
    for (let i = 1; i < buffers.length; i++) {
      const buffer = buffers[i];
      if (buffer instanceof AxFloat32Array || 
          buffer instanceof AxInt32Array || 
          buffer instanceof AxUint32Array) {
        await buffer.afterDispatch();
      }
    }
    
    // 処理完了を待機（非同期）
    return Promise.resolve();
  }
  
  /**
   * レンダリングパイプラインを実行する
   * @param {Object} vertexShaderInfo 頂点シェーダー情報
   * @param {Object} fragmentShaderInfo フラグメントシェーダー情報
   * @param {Object} options レンダリングオプション
   * @returns {Promise<void>}
   */
  static async executeRenderPipeline(vertexShaderInfo, fragmentShaderInfo, options = {}) {
    if (!this.#context) {
      throw new Error('Canvas context not initialized. Call AxRuntime.init(canvas) first.');
    }
    
    const device = this.getDevice();
    
    // 頂点シェーダーのGPUバッファを取得
    const vertexGpuBuffers = vertexShaderInfo.buffers.map(buffer => {
      if (buffer instanceof AxFloat32Array || 
          buffer instanceof AxInt32Array || 
          buffer instanceof AxUint32Array) {
        return buffer.getBuffer();
      }
      return buffer;
    });
    
    // フラグメントシェーダーのGPUバッファを取得
    const fragmentGpuBuffers = fragmentShaderInfo.buffers.map(buffer => {
      if (buffer instanceof AxFloat32Array || 
          buffer instanceof AxInt32Array || 
          buffer instanceof AxUint32Array) {
        return buffer.getBuffer();
      }
      return buffer;
    });
    
    // シェーダーモジュールを取得
    const vertexShaderModule = this.getShaderModule(vertexShaderInfo.name, vertexShaderInfo.code);
    const fragmentShaderModule = this.getShaderModule(fragmentShaderInfo.name, fragmentShaderInfo.code);
    
    // レンダリングパイプラインを取得
    const { pipeline, bindGroupLayout } = this.getRenderPipeline(
      vertexShaderInfo.name,
      vertexShaderModule,
      fragmentShaderInfo.name,
      fragmentShaderModule,
      vertexShaderInfo.bufferTypes,
      fragmentShaderInfo.bufferTypes,
      {
        primitiveTopology: options.primitiveTopology || 'triangle-list',
        cullMode: options.cullMode || 'none',
        format: options.format || this.#format
      }
    );
    
    // バインドグループを作成
    const entries = [
      ...vertexGpuBuffers.map((buffer, i) => ({
        binding: i,
        resource: { buffer }
      })),
      ...fragmentGpuBuffers.map((buffer, i) => ({
        binding: i + vertexGpuBuffers.length,
        resource: { buffer }
      }))
    ];
    
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries
    });
    
    // コマンドエンコーダを作成
    const commandEncoder = device.createCommandEncoder();
    
    // レンダーパスを作成
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        },
      ],
    };
    
    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    
    // 描画コマンドを発行
    renderPass.draw(
      options.vertexCount,
      options.instanceCount || 1,
      options.firstVertex || 0,
      options.firstInstance || 0
    );
    
    renderPass.end();
    
    // コマンドをキューに送信
    const commands = commandEncoder.finish();
    device.queue.submit([commands]);
    
    // 実行後、AxArray型のバッファを同期
    for (const buffer of [...vertexShaderInfo.buffers, ...fragmentShaderInfo.buffers]) {
      if (buffer instanceof AxFloat32Array || 
          buffer instanceof AxInt32Array || 
          buffer instanceof AxUint32Array) {
        await buffer.afterDispatch();
      }
    }
    
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
  
  /**
   * Int32バッファから結果を読み取る
   * @param {GPUBuffer} buffer 読み取り元のバッファ
   * @param {number} size 読み取るサイズ（バイト単位）
   * @returns {Promise<Int32Array>} 読み取ったデータ
   */
  static async readInt32Buffer(buffer, size) {
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
    const resultData = new Int32Array(stagingBuffer.getMappedRange());
    
    // コピーを作成（バッファをunmapした後もデータを保持するため）
    const resultCopy = new Int32Array(resultData.length);
    resultCopy.set(resultData);
    
    // リソースを解放
    stagingBuffer.unmap();
    
    return resultCopy;
  }
  
  /**
   * Uint32バッファから結果を読み取る
   * @param {GPUBuffer} buffer 読み取り元のバッファ
   * @param {number} size 読み取るサイズ（バイト単位）
   * @returns {Promise<Uint32Array>} 読み取ったデータ
   */
  static async readUint32Buffer(buffer, size) {
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
    const resultData = new Uint32Array(stagingBuffer.getMappedRange());
    
    // コピーを作成（バッファをunmapした後もデータを保持するため）
    const resultCopy = new Uint32Array(resultData.length);
    resultCopy.set(resultData);
    
    // リソースを解放
    stagingBuffer.unmap();
    
    return resultCopy;
  }
}
