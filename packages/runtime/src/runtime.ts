import { SharedArray } from './shared-array';
import { CircleRenderer } from './renderer/circle-renderer';
import { LineRenderer } from './renderer/line-renderer';
import { ImageRenderer } from './renderer/image-renderer';
import { RectangleRenderer } from './renderer/rectangle-renderer';
import { PrimitiveRenderer, PrimitiveType } from './renderer/primitive-renderer';
import { Camera } from './camera';

export class Runtime {
    device: GPUDevice | null = null;

    async init() {
        if (this.device) return;
        if (!navigator.gpu) throw new Error("WebGPU not supported");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No adapter found");
        this.device = await adapter.requestDevice();
    }

    context: GPUCanvasContext | null = null;
    presentationFormat: GPUTextureFormat = "bgra8unorm";

    async setupCanvas(canvas: HTMLCanvasElement) {
        await this.init();
        this.context = canvas.getContext("webgpu");
        if (!this.context) throw new Error("WebGPU context not found");
        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device!,
            format: this.presentationFormat,
            alphaMode: "premultiplied",
        });

        // Initialize globals
        const g = globalThis as any;
        if (!g.mouse) g.mouse = g.vec2f(0, 0);
        if (g.mouseDown === undefined) g.mouseDown = false;
        if (g.mouseClick === undefined) g.mouseClick = false;

        // Add event listeners
        const updateMouse = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width * 2 - 1;
            const y = 1 - (e.clientY - rect.top) / rect.height * 2;
            g.mouse[0] = x;
            g.mouse[1] = y;
        };

        canvas.addEventListener("mousemove", updateMouse);
        canvas.addEventListener("mousedown", (e) => {
            updateMouse(e);
            g.mouseDown = true;
        });
        canvas.addEventListener("mouseup", (e) => {
            updateMouse(e);
            g.mouseDown = false;
        });
        canvas.addEventListener("click", (e) => {
            updateMouse(e);
            g.mouseClick = true;
            // Reset click after a short delay or next frame? 
            // For now, let's just set it. User might need to reset it.
            setTimeout(() => { g.mouseClick = false; }, 100);
        });
    }

    async clear(r: number, g: number, b: number, a: number = 1.0) {
        if (!this.context) throw new Error("Canvas not setup");
        const device = this.device!;

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r, g, b, a },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
    }

    async createRenderPipeline(desc: { vertex: string, fragment: string, vertexEntryPoint: string, fragmentEntryPoint: string }) {
        await this.init();
        const device = this.device!;

        const vertexModule = device.createShaderModule({ code: desc.vertex });
        const fragmentModule = device.createShaderModule({ code: desc.fragment });

        return device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: vertexModule,
                entryPoint: desc.vertexEntryPoint,
            },
            fragment: {
                module: fragmentModule,
                entryPoint: desc.fragmentEntryPoint,
                targets: [{ format: this.presentationFormat }],
            },
            primitive: {
                topology: "triangle-list",
            },
        });
    }

    private async createBindGroupEntries(device: GPUDevice, args: any[], buffersToDestroy: GPUBuffer[], sharedArrays: SharedArray[]): Promise<GPUBindGroupEntry[]> {
        const entries: GPUBindGroupEntry[] = [];

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            if (arg instanceof SharedArray) {
                // Reuse existing buffer from SharedArray
                const buffer = await arg.ensureBuffer(device);
                await arg.syncToDevice(device);
                sharedArrays.push(arg);
                entries.push({
                    binding: i,
                    resource: { buffer }
                });
            } else if (typeof arg === 'number' || (typeof arg === 'object' && arg !== null && 'type' in arg && 'value' in arg)) {
                // Handle scalar values (number or ScalarWrapper)
                const isWrapper = typeof arg === 'object';
                const value = isWrapper ? arg.value : arg;
                const type = isWrapper ? arg.type : 'f32'; // Default to f32 for plain numbers

                let bufferSize = 16; // Uniform alignment

                const buffer = device.createBuffer({
                    size: bufferSize,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                    mappedAtCreation: true,
                    label: "Scalar buffer",
                });

                const mapping = buffer.getMappedRange();
                if (type === 'u32') {
                    new Uint32Array(mapping)[0] = value;
                } else if (type === 'i32') {
                    new Int32Array(mapping)[0] = value;
                } else {
                    new Float32Array(mapping)[0] = value;
                }
                buffer.unmap();

                buffersToDestroy.push(buffer);
                entries.push({
                    binding: i,
                    resource: { buffer }
                });
            } else if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
                // Handle struct objects
                if (!('type' in arg && 'value' in arg)) {
                    const packedData = this.packStructData(arg);

                    const buffer = device.createBuffer({
                        size: packedData.byteLength,
                        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                        mappedAtCreation: true,
                        label: "Struct buffer",
                    });

                    new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(packedData));
                    buffer.unmap();

                    buffersToDestroy.push(buffer);
                    entries.push({
                        binding: i,
                        resource: { buffer }
                    });
                }
            }
        }
        return entries;
    }

    async draw(pipeline: GPURenderPipeline, vertexCount: number, args: any[] = []) {
        if (!this.context) throw new Error("Canvas not setup");
        const device = this.device!;

        const buffersToDestroy: GPUBuffer[] = [];
        const sharedArrays: SharedArray[] = [];

        const entries = await this.createBindGroupEntries(device, args, buffersToDestroy, sharedArrays);

        let bindGroup;
        if (entries.length > 0) {
            bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries
            });
        }

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "load",
                    storeOp: "store",
                },
            ],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        if (bindGroup) {
            passEncoder.setBindGroup(0, bindGroup);
        }
        passEncoder.draw(vertexCount);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

        // Destroy temporary buffers
        for (const buffer of buffersToDestroy) {
            buffer.destroy();
        }
    }

    private getAlignment(value: any): number {
        if (typeof value === 'number') return 4;
        if (value && typeof value === 'object') {
            if ('type' in value && 'value' in value) return 4; // ScalarWrapper
            if (value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array) {
                switch (value.length) {
                    case 2: return 8;  // vec2
                    case 3: return 16; // vec3
                    case 4: return 16; // vec4
                    case 16: return 16; // mat4x4
                }
            }
        }
        return 4; // Default
    }

    /**
     * Get byte size of a value
     */
    private getSize(value: any): number {
        if (typeof value === 'number') return 4;
        if (value && typeof value === 'object') {
            if ('type' in value && 'value' in value) return 4; // ScalarWrapper
            if (value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array) {
                return value.byteLength;
            }
        }
        return 4; // Default
    }

    /**
     * Pack a struct object into an ArrayBuffer following WGSL alignment rules
     */
    private packStructData(obj: any): ArrayBuffer {
        const totalSize = this.getStructSize(obj);
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);

        let offset = 0;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const align = this.getAlignment(value);
                const size = this.getSize(value);

                // Padding for alignment
                const padding = (align - (offset % align)) % align;
                offset += padding;

                if (typeof value === 'number') {
                    view.setFloat32(offset, value, true);
                } else if (value && typeof value === 'object') {
                    if ('type' in value && 'value' in value) {
                        const v = value.value;
                        if (value.type === 'u32') view.setUint32(offset, v, true);
                        else if (value.type === 'i32') view.setInt32(offset, v, true);
                        else view.setFloat32(offset, v, true);
                    } else if (value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array) {
                        // Copy array data
                        const srcBytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                        uint8View.set(srcBytes, offset);
                    }
                }

                offset += size;
            }
        }

        return buffer;
    }

    /**
     * Calculate the size of a struct with proper alignment
     */
    private getStructSize(obj: any): number {
        let offset = 0;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const align = this.getAlignment(value);
                const size = this.getSize(value);

                // Padding for alignment
                const padding = (align - (offset % align)) % align;
                offset += padding;
                offset += size;
            }
        }
        // Round up to multiple of 16 bytes (WGSL uniform buffer requirement)
        return Math.max(16, Math.ceil(offset / 16) * 16);
    }

    async dispatch(wgsl: string, entryPoint: string, args: any[], workgroupCount: [number, number, number] = [1, 1, 1]) {
        await this.init();
        const device = this.device!;

        // Create Shader Module
        const shaderModule = device.createShaderModule({
            code: wgsl
        });

        // Create Pipeline
        const pipeline = device.createComputePipeline({
            layout: "auto",
            compute: {
                module: shaderModule,
                entryPoint: entryPoint
            }
        });

        // Create Buffers and BindGroup
        const buffersToDestroy: GPUBuffer[] = [];
        const sharedArrays: SharedArray[] = [];
        const entries = await this.createBindGroupEntries(device, args, buffersToDestroy, sharedArrays);

        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries
        });

        // Encode commands
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);

        passEncoder.dispatchWorkgroups(...workgroupCount);
        passEncoder.end();

        // For SharedArrays, sync back to host
        for (const sharedArray of sharedArrays) {
            if (sharedArray.buffer) {
                const readBuffer = device.createBuffer({
                    size: sharedArray.buffer.size,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                    label: "SharedArray read buffer",
                });
                commandEncoder.copyBufferToBuffer(sharedArray.buffer, 0, readBuffer, 0, sharedArray.buffer.size);
                buffersToDestroy.push(readBuffer);
            }
        }

        // For plain Float32Arrays, read back results
        const readBuffers: GPUBuffer[] = [];
        const readBufferMapping: Map<number, number> = new Map(); // maps arg index to readBuffer index
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            // Only read back plain Float32Arrays, not scalars or SharedArrays
            if (arg instanceof Float32Array && !(arg instanceof SharedArray)) {
                // Find the corresponding buffer in buffersToDestroy
                // We need to find which buffer corresponds to this arg
                let bufferIndex = 0;
                for (let j = 0; j < i; j++) {
                    if (args[j] instanceof Float32Array || typeof args[j] === 'number' ||
                        (typeof args[j] === 'object' && args[j] !== null && 'type' in args[j])) {
                        if (!(args[j] instanceof SharedArray)) {
                            bufferIndex++;
                        }
                    }
                }

                const buffer = buffersToDestroy[bufferIndex];
                const readBuffer = device.createBuffer({
                    size: buffer.size,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                    label: "Float32Array read buffer",
                });
                commandEncoder.copyBufferToBuffer(buffer, 0, readBuffer, 0, buffer.size);
                readBufferMapping.set(i, readBuffers.length);
                readBuffers.push(readBuffer);
            }
        }

        device.queue.submit([commandEncoder.finish()]);

        // Sync SharedArrays to host
        for (const sharedArray of sharedArrays) {
            await sharedArray.syncToHost(device);
        }

        // Map and read plain Float32Arrays
        await Promise.all(readBuffers.map(b => b.mapAsync(GPUMapMode.READ)));

        for (let i = 0; i < args.length; i++) {
            if (readBufferMapping.has(i)) {
                const readBufferIndex = readBufferMapping.get(i)!;
                const result = new Float32Array(readBuffers[readBufferIndex].getMappedRange());
                args[i].set(result);
                readBuffers[readBufferIndex].destroy();
            }
        }

        // Destroy temporary buffers
        for (const buffer of buffersToDestroy) {
            buffer.destroy();
        }
    }

    // Primitive rendering infrastructure
    private circleRenderer: CircleRenderer | null = null;
    private lineRenderer: LineRenderer | null = null;
    private imageRenderer: ImageRenderer | null = null;
    private rectangleRenderer: RectangleRenderer | null = null;
    private primitiveRenderer: PrimitiveRenderer | null = null;

    async circle(center: [number, number], radius: number, color: [number, number, number, number], options: { aspect?: number } = {}) {
        const c = new SharedArray(2); c.data.set(center);
        const r = new SharedArray(1); r.data[0] = radius;
        const col = new SharedArray(4); col.data.set(color);
        return this.circles(c, r, col, options);
    }

    async circles(centers: SharedArray, radii: SharedArray, colors: SharedArray, options: { aspect?: number } = {}) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();

        if (!this.circleRenderer) {
            this.circleRenderer = new CircleRenderer(this.device!, this.presentationFormat);
        }

        await this.circleRenderer.draw(this.context, centers, radii, colors, options);
    }

    async line(
        begin: [number, number],
        end: [number, number],
        width: number,
        color: [number, number, number, number],
        options: { aspect?: number } = {}
    ) {
        // Helper to create temporary SharedArrays for single line drawing
        // This is inefficient but keeps the API consistent
        const b = new SharedArray(2); b.data.set(begin);
        const e = new SharedArray(2); e.data.set(end);
        const w = new SharedArray(1); w.data[0] = width;
        const c = new SharedArray(4); c.data.set(color);

        return this.lines(b, e, w, c, options);
    }

    async lines(
        begin: SharedArray,
        end: SharedArray,
        width: SharedArray,
        color: SharedArray,
        options: { aspect?: number } = {}
    ) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();

        if (!this.lineRenderer) {
            this.lineRenderer = new LineRenderer(this.device!, this.presentationFormat);
        }

        await this.lineRenderer.draw(this.context, begin, end, width, color, options);
    }

    async rect(
        center: [number, number],
        size: [number, number],
        color: [number, number, number, number],
        options: { aspect?: number } = {}
    ) {
        const c = new SharedArray(2); c.data.set(center);
        const s = new SharedArray(2); s.data.set(size);
        const col = new SharedArray(4); col.data.set(color);
        return this.rects(c, s, col, options);
    }

    async rects(
        centers: SharedArray,
        sizes: SharedArray,
        colors: SharedArray,
        options: { aspect?: number } = {}
    ) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();

        if (!this.rectangleRenderer) {
            this.rectangleRenderer = new RectangleRenderer(this.device!, this.presentationFormat);
        }

        await this.rectangleRenderer.draw(this.context, centers, sizes, colors, options);
    }

    async sphere(
        center: [number, number, number],
        radius: number,
        color: [number, number, number, number] | [number, number, number],
        options: { aspect?: number, camera?: Camera } = {}
    ) {
        const c = new SharedArray(3); c.data.set(center);
        const r = new SharedArray(1); r.data[0] = radius;
        const col = new SharedArray(color.length); col.data.set(color);
        return this.spheres(c, r, col, options);
    }

    async spheres(
        centers: SharedArray,
        radii: SharedArray,
        colors: SharedArray,
        options: { aspect?: number, camera?: Camera } = {}
    ) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();

        if (!this.primitiveRenderer) {
            this.primitiveRenderer = new PrimitiveRenderer(this.device!, this.presentationFormat);
        }

        await this.primitiveRenderer.draw(this.context, centers, radii, colors, PrimitiveType.Sphere, options);
    }

    async box(
        center: [number, number, number],
        size: [number, number, number],
        color: [number, number, number, number] | [number, number, number],
        options: { aspect?: number, camera?: Camera } = {}
    ) {
        const c = new SharedArray(3); c.data.set(center);
        const s = new SharedArray(3); s.data.set(size);
        const col = new SharedArray(color.length); col.data.set(color);
        return this.boxes(c, s, col, options);
    }

    async boxes(
        centers: SharedArray,
        sizes: SharedArray,
        colors: SharedArray,
        options: { aspect?: number, camera?: Camera } = {}
    ) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();

        if (!this.primitiveRenderer) {
            this.primitiveRenderer = new PrimitiveRenderer(this.device!, this.presentationFormat);
        }

        await this.primitiveRenderer.draw(this.context, centers, sizes, colors, PrimitiveType.Box, options);
    }

    async plane(
        center: [number, number, number],
        size: [number, number, number],
        color: [number, number, number, number] | [number, number, number],
        options: { aspect?: number, camera?: Camera } = {}
    ) {
        const c = new SharedArray(3); c.data.set(center);
        const s = new SharedArray(3); s.data.set(size);
        const col = new SharedArray(color.length); col.data.set(color);
        return this.planes(c, s, col, options);
    }

    async planes(
        centers: SharedArray,
        sizes: SharedArray,
        colors: SharedArray,
        options: { aspect?: number, camera?: Camera } = {}
    ) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();

        if (!this.primitiveRenderer) {
            this.primitiveRenderer = new PrimitiveRenderer(this.device!, this.presentationFormat);
        }

        await this.primitiveRenderer.draw(this.context, centers, sizes, colors, PrimitiveType.Plane, options);
    }

    // Display a 2D SharedArray as an image on the canvas
    // Supports:
    // 1. 3D array: [height, width, channels] (channels = 3 or 4)
    // 2. 2D array of vectors: [height, width] (vec3 or vec4)
    async showImage(array: SharedArray) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();

        if (!this.imageRenderer) {
            this.imageRenderer = new ImageRenderer(this.device!, this.presentationFormat);
        }

        await this.imageRenderer.draw(this.context, array);
    }
}
