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
                    mappedAtCreation: true,
                    label: "Float32Array buffer",
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

    // Primitive rendering infrastructure
    private circlePipeline: GPURenderPipeline | null = null;
    private linePipeline: GPURenderPipeline | null = null;

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

    private async getLinePipeline(): Promise<GPURenderPipeline> {
        if (this.linePipeline) return this.linePipeline;

        await this.init();
        const device = this.device!;

        const shaderCode = `
struct LineVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

struct Line {
    begin: vec2<f32>,
    end:   vec2<f32>,
    color: vec4<f32>,
    width: f32,
    _padding0: f32,
    _padding1: f32,
    _padding2: f32,
};

@group(0) @binding(0) var<storage, read> linesData: array<Line>;

@vertex
fn vs_main(
    @builtin(vertex_index)  vertexIndex:  u32,
    @builtin(instance_index) instanceIndex: u32
) -> LineVertexOutput {
    var output: LineVertexOutput;

    let line = linesData[instanceIndex];

    let p0 = line.begin;
    let p1 = line.end;

    let dir = p1 - p0;
    let len = length(dir);
    // avoid NaN if begin == end
    var tangent = vec2<f32>(1.0, 0.0);
    if (len > 0.0) {
        tangent = dir / len;
    }
    let normal = vec2<f32>(-tangent.y, tangent.x);
    let halfWidth = line.width * 0.5;

    // 2D quad for the line (two triangles)
    var positions = array<vec2<f32>, 6>(
        p0 - normal * halfWidth,
        p1 - normal * halfWidth,
        p1 + normal * halfWidth,
        p0 - normal * halfWidth,
        p1 + normal * halfWidth,
        p0 + normal * halfWidth
    );

    let worldPos = positions[vertexIndex];
    output.position = vec4<f32>(worldPos, 0.0, 1.0);
    output.color = line.color;

    return output;
}

@fragment
fn fs_main(input: LineVertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
`;

        const shaderModule = device.createShaderModule({ code: shaderCode });

        this.linePipeline = device.createRenderPipeline({
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

        return this.linePipeline;
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
            label: "Circle buffer",
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

    async line(
        begin: [number, number],
        end: [number, number],
        width: number,
        color: [number, number, number, number],
    ) {
        return this.lines(
            new Float32Array([begin[0], begin[1]]),
            new Float32Array([end[0], end[1]]),
            new Float32Array([width]),
            new Float32Array(color),
        );
    }

    async lines(
        begin: Float32Array | [number, number],
        end: Float32Array | [number, number],
        width: Float32Array | number,
        color: Float32Array | [number, number, number, number],
    ) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();
        const device = this.device!;

        // Normalize single element or array to Float32Array
        const beginArray = begin instanceof Float32Array
            ? begin
            : new Float32Array([begin[0], begin[1]]);

        const endArray = end instanceof Float32Array
            ? end
            : new Float32Array([end[0], end[1]]);

        const widthArray = width instanceof Float32Array
            ? width
            : new Float32Array([width]);

        const colorArray = color instanceof Float32Array
            ? color
            : new Float32Array(color);

        const numLines = widthArray.length;

        if (beginArray.length !== numLines * 2) {
            throw new Error(`begin length (${beginArray.length}) must be 2 * numLines (${numLines})`);
        }
        if (endArray.length !== numLines * 2) {
            throw new Error(`end length (${endArray.length}) must be 2 * numLines (${numLines})`);
        }
        if (colorArray.length !== numLines * 4) {
            throw new Error(`color length (${colorArray.length}) must be 4 * numLines (${numLines})`);
        }

        // Line struct layout (WGSL):
        // struct Line {
        //     begin: vec2<f32>,  // 2
        //     end:   vec2<f32>,  // 2  -> 4
        //     color: vec4<f32>,  // 4  -> 8
        //     width: f32,        // 1  -> 9
        //     _padding0: f32,    // 1  -> 10
        //     _padding1: f32,    // 1  -> 11
        //     _padding2: f32     // 1  -> 12 ( = 48 bytes )
        // }

        const floatsPerLine = 12;
        const lineData = new Float32Array(numLines * floatsPerLine);

        for (let i = 0; i < numLines; i++) {
            const base = i * floatsPerLine;

            // begin
            lineData[base + 0] = beginArray[i * 2 + 0];
            lineData[base + 1] = beginArray[i * 2 + 1];

            // end
            lineData[base + 2] = endArray[i * 2 + 0];
            lineData[base + 3] = endArray[i * 2 + 1];

            // color
            lineData[base + 4] = colorArray[i * 4 + 0];
            lineData[base + 5] = colorArray[i * 4 + 1];
            lineData[base + 6] = colorArray[i * 4 + 2];
            lineData[base + 7] = colorArray[i * 4 + 3];

            // width
            lineData[base + 8] = widthArray[i];

            // padding
            lineData[base + 9] = 0.0;
            lineData[base + 10] = 0.0;
            lineData[base + 11] = 0.0;
        }

        const lineBuffer = device.createBuffer({
            size: lineData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Line buffer",
        });
        new Float32Array(lineBuffer.getMappedRange()).set(lineData);
        lineBuffer.unmap();

        const pipeline = await this.getLinePipeline();
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: lineBuffer },
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
        passEncoder.draw(6, numLines); // 6 vertices per quad, numLines instances
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

        lineBuffer.destroy();
    }

    // Display a 2D SharedArray as an image on the canvas
    // Supports:
    // 1. 3D array: [height, width, channels] (channels = 3 or 4)
    // 2. 2D array of vectors: [height, width] (vec3 or vec4)
    async showImage(array: SharedArray) {
        if (!this.context) throw new Error("Canvas not setup");

        let width, height, channels;

        if (array.ndim === 3) {
            // [height, width, channels]
            [height, width, channels] = array.shape;
        } else if (array.ndim === 2 && array.type.components > 1) {
            // [height, width] of vectors (vec3, vec4)
            [height, width] = array.shape;
            channels = array.type.components;
        } else {
            throw new Error("Image must be 3D array [height, width, channels] or 2D array of vectors (vec3/vec4)");
        }

        if (channels !== 3 && channels !== 4) {
            throw new Error(`Image must have 3 (RGB) or 4 (RGBA) channels, got ${channels}`);
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
}
