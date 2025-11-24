import { SharedArray } from './shared-array';

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
            } else if (arg instanceof Float32Array) {
                // Create temporary buffer for plain Float32Array
                const buffer = device.createBuffer({
                    size: arg.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    mappedAtCreation: true
                });
                new Float32Array(buffer.getMappedRange()).set(arg);
                buffer.unmap();

                buffersToDestroy.push(buffer);
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
                    mappedAtCreation: true
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
                        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        mappedAtCreation: true
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
                    loadOp: "clear",
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

    // Circle rendering infrastructure
    private circlePipeline: GPURenderPipeline | null = null;

    private async getCirclePipeline(): Promise<GPURenderPipeline> {
        if (this.circlePipeline) return this.circlePipeline;

        await this.init();
        const device = this.device!;

        const shaderCode = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) center: vec2<f32>,
    @location(1) radius: f32,
    @location(2) color: vec4<f32>,
    @location(3) localPos: vec2<f32>,
}

struct Circle {
    center: vec2<f32>,
    radius: f32,
    color: vec4<f32>,
}

@group(0) @binding(0) var<storage, read> circles: array<Circle>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let circle = circles[instanceIndex];
    
    // Generate quad vertices (-1 to 1 in local space)
    var positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, 1.0)
    );
    
    let localPos = positions[vertexIndex];
    output.localPos = localPos;
    
    // Transform to NDC space
    let worldPos = circle.center + localPos * circle.radius;
    output.position = vec4<f32>(worldPos, 0.0, 1.0);
    
    output.center = circle.center;
    output.radius = circle.radius;
    output.color = circle.color;
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Discard fragments outside circle
    let dist = length(input.localPos);
    if (dist > 1.0) {
        discard;
    }
    
    return input.color;
}
`;

        const shaderModule = device.createShaderModule({ code: shaderCode });

        this.circlePipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{
                    format: this.presentationFormat,
                    blend: {
                        color: {
                            srcFactor: "src-alpha",
                            dstFactor: "one-minus-src-alpha",
                            operation: "add",
                        },
                        alpha: {
                            srcFactor: "one",
                            dstFactor: "one-minus-src-alpha",
                            operation: "add",
                        },
                    },
                }],
            },
            primitive: {
                topology: "triangle-list",
            },
        });

        return this.circlePipeline;
    }

    async circle(center: [number, number], radius: number, color: [number, number, number, number]) {
        return this.circles(
            new Float32Array([center[0], center[1]]),
            new Float32Array([radius]),
            new Float32Array(color)
        );
    }

    async circles(centers: Float32Array, radii: Float32Array, colors: Float32Array) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();
        const device = this.device!;

        const numCircles = radii.length;

        // Pack circle data: [center.x, center.y, radius, padding, color.r, color.g, color.b, color.a]
        // Each circle is 8 floats (32 bytes) for alignment
        const circleData = new Float32Array(numCircles * 8);
        for (let i = 0; i < numCircles; i++) {
            circleData[i * 8 + 0] = centers[i * 2 + 0];
            circleData[i * 8 + 1] = centers[i * 2 + 1];
            circleData[i * 8 + 2] = radii[i];
            circleData[i * 8 + 3] = 0; // padding
            circleData[i * 8 + 4] = colors[i * 4 + 0];
            circleData[i * 8 + 5] = colors[i * 4 + 1];
            circleData[i * 8 + 6] = colors[i * 4 + 2];
            circleData[i * 8 + 7] = colors[i * 4 + 3];
        }

        const circleBuffer = device.createBuffer({
            size: circleData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Float32Array(circleBuffer.getMappedRange()).set(circleData);
        circleBuffer.unmap();

        const pipeline = await this.getCirclePipeline();
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: circleBuffer },
            }],
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store",
            }],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(6, numCircles); // 6 vertices per quad, numCircles instances
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

        circleBuffer.destroy();
    }

    // Display a 2D SharedArray as an image on the canvas
    // array shape should be [height, width, channels] where channels is 3 (RGB) or 4 (RGBA)
    async showImage(array: SharedArray) {
        if (!this.context) throw new Error("Canvas not setup");
        if (array.ndim !== 3) throw new Error("Image must be 3D array [height, width, channels]");

        const [height, width, channels] = array.shape;
        if (channels !== 3 && channels !== 4) {
            throw new Error("Image must have 3 (RGB) or 4 (RGBA) channels");
        }

        await this.init();
        const device = this.device!;

        // Create texture
        const texture = device.createTexture({
            size: { width, height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        // Convert array data to RGBA8 format
        const rgbaData = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + x) * channels;
                const dstIdx = (y * width + x) * 4;

                // Copy RGB channels (values assumed to be in [0, 1] range)
                rgbaData[dstIdx + 0] = Math.floor(array.data[srcIdx + 0] * 255);
                rgbaData[dstIdx + 1] = Math.floor(array.data[srcIdx + 1] * 255);
                rgbaData[dstIdx + 2] = Math.floor(array.data[srcIdx + 2] * 255);
                rgbaData[dstIdx + 3] = channels === 4 ? Math.floor(array.data[srcIdx + 3] * 255) : 255;
            }
        }

        // Upload to texture
        device.queue.writeTexture(
            { texture },
            rgbaData,
            { bytesPerRow: width * 4 },
            { width, height }
        );

        // Create simple fullscreen quad shader
        const shaderCode = `
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0)
    );
    return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}

@group(0) @binding(0) var imgTexture: texture_2d<f32>;
@group(0) @binding(1) var imgSampler: sampler;

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = textureDimensions(imgTexture);
    let uv = vec2<f32>(pos.x / f32(texSize.x), 1.0 - pos.y / f32(texSize.y));
    return textureSample(imgTexture, imgSampler, uv);
}
        `;

        const shaderModule = device.createShaderModule({ code: shaderCode });
        const sampler = device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });

        const pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main'
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.presentationFormat }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: sampler }
            ]
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(6);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

        texture.destroy();
    }

    /**
     * Pack a struct object into an ArrayBuffer following WGSL alignment rules
     * WGSL uniform buffer alignment:
     * - f32/i32/u32: 4-byte alignment
     * - struct: 16-byte alignment (minimum)
     */
    private packStructData(obj: any): ArrayBuffer {
        const size = this.getStructSize(obj);
        const buffer = new ArrayBuffer(size);
        const view = new DataView(buffer);

        let offset = 0;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];

                // Handle ScalarWrapper
                if (typeof value === 'object' && value !== null && 'type' in value && 'value' in value) {
                    const actualValue = value.value;
                    const type = value.type;

                    if (type === 'u32') {
                        view.setUint32(offset, actualValue, true);
                    } else if (type === 'i32') {
                        view.setInt32(offset, actualValue, true);
                    } else {
                        view.setFloat32(offset, actualValue, true);
                    }
                    offset += 4;
                } else if (typeof value === 'number') {
                    // Default to f32 for plain numbers
                    view.setFloat32(offset, value, true);
                    offset += 4;
                }
            }
        }

        return buffer;
    }

    /**
     * Calculate the size of a struct with proper alignment
     * Minimum struct size is 16 bytes for uniform buffers
     */
    private getStructSize(obj: any): number {
        let size = 0;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                size += 4; // All scalar types are 4 bytes
            }
        }
        // Round up to multiple of 16 bytes (WGSL uniform buffer requirement)
        return Math.max(16, Math.ceil(size / 16) * 16);
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
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
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
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
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
}
