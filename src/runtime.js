/**
 * JSS - JavaScript Shader Extension
 * ランタイムライブラリ
 */

/**
 * JSSFloat32Array - Float32配列とGPUバッファをラップするクラス
 * JS側の配列とGPUバッファの両方を内部に持ち、自動的に同期を行う
 */
export class JSSFloat32Array {
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
    const device = JSS.getDevice();
    
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
    const data = await JSS.readBuffer(this.buffer, this.size);
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
 * JSSInt32Array - Int32配列とGPUバッファをラップするクラス
 * JS側の配列とGPUバッファの両方を内部に持ち、自動的に同期を行う
 */
export class JSSInt32Array {
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
    const device = JSS.getDevice();
    
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
    const device = JSS.getDevice();
    
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
 * JSSUint32Array - Uint32配列とGPUバッファをラップするクラス
 * JS側の配列とGPUバッファの両方を内部に持ち、自動的に同期を行う
 */
export class JSSUint32Array {
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
    const device = JSS.getDevice();
    
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
    const device = JSS.getDevice();
    
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
   * @param {Array<GPUBuffer|JSSFloat32Array|JSSInt32Array|JSSUint32Array>} buffers バッファの配列
   * @param {Array<string>} bufferTypes バッファタイプの配列（'read-only-storage' または 'storage'）
   * @param {number} threadCount スレッド数
   * @returns {Promise<void>}
   */
  static async executeShader(name, code, buffers, bufferTypes, threadCount) {
    const device = this.getDevice();
    
    // JSSArray型のバッファをGPUバッファに変換
    const gpuBuffers = buffers.map(buffer => {
      if (buffer instanceof JSSFloat32Array || 
          buffer instanceof JSSInt32Array || 
          buffer instanceof JSSUint32Array) {
        return buffer.getBuffer();
      }
      return buffer;
    });
    
    // シェーダーモジュールを取得
    const shaderModule = this.getShaderModule(name, code);
    
    // パイプラインを取得
    const { pipeline, bindGroupLayout } = this.getPipeline(name, shaderModule, bufferTypes);
    
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
    
    // ワークグループ数を計算（ワークグループサイズ64に合わせて調整）
    const workgroupSize = 64;
    const workgroupCount = Math.ceil(threadCount / workgroupSize);
    
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();
    
    // コマンドをキューに送信
    const commands = commandEncoder.finish();
    device.queue.submit([commands]);
    
    // 実行後、JSSArray型のバッファを同期
    for (const buffer of buffers) {
      if (buffer instanceof JSSFloat32Array || 
          buffer instanceof JSSInt32Array || 
          buffer instanceof JSSUint32Array) {
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
