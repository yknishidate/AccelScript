import { TypedArray, TypedArrayConstructor, TypeSpec, f32 } from './types';

export enum SyncMode {
    Auto = 0,      // Bidirectional sync (default)
    CpuToGpu = 1,  // Upload only (CPU -> GPU)
    GpuToCpu = 2,  // Download only (GPU -> CPU)
    None = 3       // No automatic sync
}

export class SharedArray<T = any> {
    private hostData: TypedArray;
    private deviceBuffer: GPUBuffer | null = null;
    private device: GPUDevice | null = null;

    public readonly shape: number[];
    public readonly ndim: number;
    public readonly type: TypeSpec<any>;
    public syncMode: SyncMode = SyncMode.Auto;

    constructor(
        typeOrData: TypeSpec<any> | number | number[] | TypedArray,
        shapeOrSizeOrData?: number | number[] | TypedArray,
        syncMode: SyncMode = SyncMode.Auto
    ) {
        // Handle overload: constructor(type: TypeSpec, data: number[], syncMode?)
        // or constructor(type: TypeSpec, size: number, syncMode?)
        if (typeof typeOrData === 'function' && 'kind' in typeOrData) {
            this.type = typeOrData as TypeSpec<any>;
            const dataOrSize = shapeOrSizeOrData!;
            this.syncMode = syncMode;

            if (Array.isArray(dataOrSize)) {
                // new SharedArray(vec2f, [height, width]) -> Shape
                this.shape = dataOrSize;
                this.ndim = dataOrSize.length;
                const elementCount = dataOrSize.reduce((a, b) => a * b, 1);
                const totalFloats = elementCount * this.type.stride;
                this.hostData = new this.type.TypedArray(totalFloats);
            } else if (typeof dataOrSize === 'number') {
                // new SharedArray(vec2f, 10) -> 10 vectors
                this.shape = [dataOrSize];
                this.ndim = 1;
                const totalFloats = dataOrSize * this.type.stride;
                this.hostData = new this.type.TypedArray(totalFloats);
            } else if (ArrayBuffer.isView(dataOrSize)) {
                // new SharedArray(vec2f, new Float32Array([...])) -> Data
                this.hostData = dataOrSize;
                this.shape = [this.hostData.length / this.type.stride];
                this.ndim = 1;
            } else {
                throw new Error("Invalid data for SharedArray");
            }
        } else {
            // Old behavior: default to f32
            this.type = f32 as any as TypeSpec<any>;
            const shapeOrSizeOrData = typeOrData as number | number[] | TypedArray;
            // Check if the last argument is actually SyncMode (if called with old signature + syncMode)
            // But old signature didn't have syncMode. Let's assume old signature users won't pass syncMode for now
            // or we need more complex checking.
            // Actually, let's just support syncMode for the new signature for now.

            if (Array.isArray(shapeOrSizeOrData)) {
                // Multi-dimensional array: new SharedArray([10, 20, 3])
                this.shape = shapeOrSizeOrData;
                this.ndim = shapeOrSizeOrData.length;
                const totalSize = shapeOrSizeOrData.reduce((a, b) => a * b, 1);
                this.hostData = new Float32Array(totalSize);
            } else if (typeof shapeOrSizeOrData === 'number') {
                // 1D array: new SharedArray(100)
                this.shape = [shapeOrSizeOrData];
                this.ndim = 1;
                this.hostData = new Float32Array(shapeOrSizeOrData);
            } else {
                // From existing TypedArray
                this.hostData = shapeOrSizeOrData;
                this.shape = [shapeOrSizeOrData.length];
                this.ndim = 1;
            }
        }
    }

    /**
     * Get a view of the vector at the specified index.
     */
    get(index: number): TypedArray {
        if (index < 0 || index >= this.size) {
            throw new Error(`Index out of bounds: ${index}`);
        }
        const start = index * this.type.stride;
        const end = start + this.type.components;
        return this.hostData.subarray(start, end);
    }

    /**
     * Set the vector at the specified index.
     */
    set(index: number, value: TypedArray | number[]): void {
        if (index < 0 || index >= this.size) {
            throw new Error(`Index out of bounds: ${index}`);
        }
        const start = index * this.type.stride;
        if (value.length !== this.type.components) {
            console.warn(`Invalid value for SharedArray assignment at index ${index}. Expected length ${this.type.components}, got ${value.length}`);
            return;
        }
        this.hostData.set(value, start);
    }

    /**
     * Access the underlying TypedArray host data
     */
    get data(): TypedArray {
        return this.hostData;
    }

    /**
     * Access the GPUBuffer (if created)
     */
    get buffer(): GPUBuffer | null {
        return this.deviceBuffer;
    }

    /**
     * Total number of elements (vectors if vector type, scalars if scalar type)
     */
    get size(): number {
        return this.hostData.length / this.type.stride;
    }

    /**
     * Ensure the GPU buffer exists and is up-to-date with host data.
     * If buffer doesn't exist, it creates one and uploads data.
     */
    async ensureBuffer(device: GPUDevice): Promise<GPUBuffer> {
        if (!this.deviceBuffer || this.device !== device) {
            this.device = device;
            this.deviceBuffer = device.createBuffer({
                size: this.hostData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });

            // Initialize buffer with current host data
            new (this.hostData.constructor as any)(this.deviceBuffer.getMappedRange()).set(this.hostData);
            this.deviceBuffer.unmap();
        }
        return this.deviceBuffer;
    }

    /**
     * Upload host data to the GPU buffer.
     * Creates the buffer if it doesn't exist.
     */
    async syncToDevice(device: GPUDevice): Promise<void> {
        const buffer = await this.ensureBuffer(device);
        device.queue.writeBuffer(buffer, 0, this.hostData.buffer, this.hostData.byteOffset, this.hostData.byteLength);
    }

    /**
     * Download data from GPU buffer to host memory.
     * Updates the underlying TypedArray.
     */
    async syncToHost(device: GPUDevice): Promise<void> {
        if (!this.deviceBuffer) return;

        // Create a temporary staging buffer for reading
        const readBuffer = device.createBuffer({
            size: this.deviceBuffer.size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const commandEncoder = device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(this.deviceBuffer, 0, readBuffer, 0, this.deviceBuffer.size);
        device.queue.submit([commandEncoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ);
        const result = new (this.hostData.constructor as any)(readBuffer.getMappedRange());

        // Update host data
        this.hostData.set(result);

        readBuffer.destroy();
    }

    /**
     * Destroy the GPU buffer to free memory.
     */
    destroy(): void {
        if (this.deviceBuffer) {
            this.deviceBuffer.destroy();
            this.deviceBuffer = null;
        }
    }
}
