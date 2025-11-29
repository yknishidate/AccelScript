import { TypedArray, TypedArrayConstructor, TypeSpec, f32 } from './types';

export class SharedArray<T = any> {
    [index: number]: any;
    private hostData: TypedArray;
    private deviceBuffer: GPUBuffer | null = null;
    private device: GPUDevice | null = null;

    public readonly shape: number[];
    public readonly ndim: number;
    public readonly type: TypeSpec<any>;

    constructor(
        typeOrData: TypeSpec<any> | number | number[] | TypedArray,
        shapeOrSizeOrData?: number | number[] | TypedArray
    ) {
        // Handle overload: constructor(type: TypeSpec, data: number[])
        // or constructor(type: TypeSpec, size: number)
        if (typeof typeOrData === 'function' && 'kind' in typeOrData) {
            this.type = typeOrData as TypeSpec<any>;
            const dataOrSize = shapeOrSizeOrData!;

            if (Array.isArray(dataOrSize)) {
                // new SharedArray(vec2f, [height, width]) -> Shape
                this.shape = dataOrSize;
                this.ndim = dataOrSize.length;
                const elementCount = dataOrSize.reduce((a, b) => a * b, 1);
                const totalFloats = elementCount * this.type.components;
                this.hostData = new this.type.TypedArray(totalFloats);
            } else if (typeof dataOrSize === 'number') {
                // new SharedArray(vec2f, 10) -> 10 vectors
                this.shape = [dataOrSize];
                this.ndim = 1;
                const totalFloats = dataOrSize * this.type.components;
                this.hostData = new this.type.TypedArray(totalFloats);
            } else if (ArrayBuffer.isView(dataOrSize)) {
                // new SharedArray(vec2f, new Float32Array([...])) -> Data
                this.hostData = dataOrSize;
                this.shape = [this.hostData.length / this.type.components];
                this.ndim = 1;
            } else {
                throw new Error("Invalid data for SharedArray");
            }
        } else {
            // Old behavior: default to f32
            this.type = f32 as any as TypeSpec<any>;
            const shapeOrSizeOrData = typeOrData as number | number[] | TypedArray;

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

        // Return a Proxy to handle index access
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                // Check if prop is an integer index
                if (typeof prop === 'string' && !isNaN(Number(prop))) {
                    const index = Number(prop);
                    if (Number.isInteger(index) && index >= 0 && index < target.size) {
                        const start = index * target.type.components;
                        const end = start + target.type.components;
                        return target.hostData.subarray(start, end);
                    }
                }
                return Reflect.get(target, prop, receiver);
            },
            set: (target, prop, value, receiver) => {
                // Check if prop is an integer index
                if (typeof prop === 'string' && !isNaN(Number(prop))) {
                    const index = Number(prop);
                    if (Number.isInteger(index) && index >= 0 && index < target.size) {
                        const start = index * target.type.components;

                        // Handle TypedArray (e.g. vec3f) or Array
                        if (value.length !== undefined && value.length === target.type.components) {
                            target.hostData.set(value, start);
                            return true;
                        } else {
                            console.warn(`Invalid value for SharedArray assignment at index ${index}. Expected length ${target.type.components}, got ${value.length}`);
                        }
                    }
                }
                return Reflect.set(target, prop, value, receiver);
            }
        }) as any as SharedArray<T>;
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
