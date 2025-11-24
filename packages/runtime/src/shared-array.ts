import { TypedArray, TypedArrayConstructor } from './types';

export class SharedArray<T extends TypedArray = Float32Array> {
    private hostData: T;
    private deviceBuffer: GPUBuffer | null = null;
    private device: GPUDevice | null = null;
    public readonly shape: number[];
    public readonly ndim: number;

    constructor(shapeOrSizeOrData: number | number[] | T, arrayType?: TypedArrayConstructor<T>) {
        if (Array.isArray(shapeOrSizeOrData)) {
            // Multi-dimensional array: new SharedArray([10, 20, 3])
            this.shape = shapeOrSizeOrData;
            this.ndim = shapeOrSizeOrData.length;
            const totalSize = shapeOrSizeOrData.reduce((a, b) => a * b, 1);
            const ArrayConstructor = arrayType || Float32Array as TypedArrayConstructor<T>;
            this.hostData = new ArrayConstructor(totalSize) as T;
        } else if (typeof shapeOrSizeOrData === 'number') {
            // 1D array: new SharedArray(100)
            this.shape = [shapeOrSizeOrData];
            this.ndim = 1;
            const ArrayConstructor = arrayType || Float32Array as TypedArrayConstructor<T>;
            this.hostData = new ArrayConstructor(shapeOrSizeOrData) as T;
        } else {
            // From existing TypedArray
            this.hostData = shapeOrSizeOrData;
            this.shape = [shapeOrSizeOrData.length];
            this.ndim = 1;
        }
    }

    get data(): T {
        return this.hostData;
    }

    get buffer(): GPUBuffer | null {
        return this.deviceBuffer;
    }

    get size(): number {
        return this.hostData.length;
    }

    // Helper to get element at multi-dimensional index
    at(...indices: number[]): number {
        if (indices.length !== this.ndim) {
            throw new Error(`Expected ${this.ndim} indices, got ${indices.length}`);
        }
        let index = 0;
        let stride = 1;
        for (let i = this.ndim - 1; i >= 0; i--) {
            index += indices[i] * stride;
            stride *= this.shape[i];
        }
        return this.hostData[index];
    }

    // Helper to set element at multi-dimensional index
    set(...args: [...number[], number]): void {
        const value = args[args.length - 1] as number;
        const indices = args.slice(0, -1) as number[];

        if (indices.length !== this.ndim) {
            throw new Error(`Expected ${this.ndim} indices, got ${indices.length}`);
        }
        let index = 0;
        let stride = 1;
        for (let i = this.ndim - 1; i >= 0; i--) {
            index += indices[i] * stride;
            stride *= this.shape[i];
        }
        this.hostData[index] = value;
    }

    async ensureBuffer(device: GPUDevice): Promise<GPUBuffer> {
        if (!this.deviceBuffer || this.device !== device) {
            this.device = device;
            this.deviceBuffer = device.createBuffer({
                size: this.hostData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });
            new (this.hostData.constructor as any)(this.deviceBuffer.getMappedRange()).set(this.hostData);
            this.deviceBuffer.unmap();
        }
        return this.deviceBuffer;
    }

    async syncToDevice(device: GPUDevice): Promise<void> {
        const buffer = await this.ensureBuffer(device);
        device.queue.writeBuffer(buffer, 0, this.hostData.buffer, this.hostData.byteOffset, this.hostData.byteLength);
    }

    async syncToHost(device: GPUDevice): Promise<void> {
        if (!this.deviceBuffer) return;

        const readBuffer = device.createBuffer({
            size: this.deviceBuffer.size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const commandEncoder = device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(this.deviceBuffer, 0, readBuffer, 0, this.deviceBuffer.size);
        device.queue.submit([commandEncoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ);
        const result = new (this.hostData.constructor as any)(readBuffer.getMappedRange());
        this.hostData.set(result);
        readBuffer.destroy();
    }

    destroy(): void {
        if (this.deviceBuffer) {
            this.deviceBuffer.destroy();
            this.deviceBuffer = null;
        }
    }
}
