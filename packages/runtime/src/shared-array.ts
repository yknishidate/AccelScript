import { TypedArray, TypedArrayConstructor, TypeSpec, f32 } from './types';

export class SharedArray<T extends TypedArray = Float32Array> {
    private hostData: T;
    private deviceBuffer: GPUBuffer | null = null;
    private device: GPUDevice | null = null;

    public readonly shape: number[];
    public readonly ndim: number;
    public readonly type: TypeSpec<T>;

    constructor(
        typeOrData: TypeSpec<T> | number | number[] | T,
        shapeOrSizeOrData?: number | number[] | T
    ) {
        // Handle overload: constructor(type: TypeSpec, data: number[])
        // or constructor(type: TypeSpec, size: number)
        if (typeof typeOrData === 'function' && 'kind' in typeOrData) {
            this.type = typeOrData as TypeSpec<T>;
            const dataOrSize = shapeOrSizeOrData!;

            if (Array.isArray(dataOrSize)) {
                // new SharedArray(vec2f, [height, width]) -> Shape
                this.shape = dataOrSize;
                this.ndim = dataOrSize.length;
                const elementCount = dataOrSize.reduce((a, b) => a * b, 1);
                const totalFloats = elementCount * this.type.components;
                this.hostData = new this.type.TypedArray(totalFloats) as T;
            } else if (typeof dataOrSize === 'number') {
                // new SharedArray(vec2f, 10) -> 10 vectors
                this.shape = [dataOrSize];
                this.ndim = 1;
                const totalFloats = dataOrSize * this.type.components;
                this.hostData = new this.type.TypedArray(totalFloats) as T;
            } else if (ArrayBuffer.isView(dataOrSize)) {
                // new SharedArray(vec2f, new Float32Array([...])) -> Data
                this.hostData = dataOrSize as T;
                this.shape = [this.hostData.length / this.type.components];
                this.ndim = 1;
            } else {
                throw new Error("Invalid data for SharedArray");
            }
        } else {
            // Old behavior: default to f32
            this.type = f32 as any as TypeSpec<T>;
            const shapeOrSizeOrData = typeOrData as number | number[] | T;

            if (Array.isArray(shapeOrSizeOrData)) {
                // Multi-dimensional array: new SharedArray([10, 20, 3])
                this.shape = shapeOrSizeOrData;
                this.ndim = shapeOrSizeOrData.length;
                const totalSize = shapeOrSizeOrData.reduce((a, b) => a * b, 1);
                this.hostData = new Float32Array(totalSize) as unknown as T;
            } else if (typeof shapeOrSizeOrData === 'number') {
                // 1D array: new SharedArray(100)
                this.shape = [shapeOrSizeOrData];
                this.ndim = 1;
                this.hostData = new Float32Array(shapeOrSizeOrData) as unknown as T;
            } else {
                // From existing TypedArray
                this.hostData = shapeOrSizeOrData;
                this.shape = [shapeOrSizeOrData.length];
                this.ndim = 1;
            }
        }
    }

    /**
     * Access the underlying TypedArray host data
     */
    get data(): T {
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
        return this.hostData.length / this.type.components;
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
