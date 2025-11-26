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

struct Globals {
    aspect: f32,
}

@group(0) @binding(0) var<storage, read> circles: array<Circle>;
@group(0) @binding(1) var<uniform> globals: Globals;

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
    
    // Transform to NDC space with aspect ratio correction
    // We scale the x-offset by 1/aspect to keep the circle round
    let aspectCorrection = vec2<f32>(1.0 / globals.aspect, 1.0);
    let worldPos = circle.center + localPos * circle.radius * aspectCorrection;
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

struct Globals {
    aspect: f32,
}

@group(0) @binding(0) var<storage, read> linesData: array<Line>;
@group(0) @binding(1) var<uniform> globals: Globals;

@vertex
fn vs_main(
    @builtin(vertex_index)  vertexIndex:  u32,
    @builtin(instance_index) instanceIndex: u32
) -> LineVertexOutput {
    var output: LineVertexOutput;

    let line = linesData[instanceIndex];

    let p0 = line.begin;
    let p1 = line.end;

    // Adjust direction for aspect ratio to calculate correct normal
    let aspect = globals.aspect;
    let p0_screen = p0 * vec2<f32>(aspect, 1.0);
    let p1_screen = p1 * vec2<f32>(aspect, 1.0);

    let dir_screen = p1_screen - p0_screen;
    let len_screen = length(dir_screen);
    
    // avoid NaN if begin == end
    var tangent_screen = vec2<f32>(1.0, 0.0);
    if (len_screen > 0.0) {
        tangent_screen = dir_screen / len_screen;
    }
    let normal_screen = vec2<f32>(-tangent_screen.y, tangent_screen.x);
    
    // Convert normal back to NDC offset
    // We want the width to be constant, so we apply width in screen space logic?
    // If width is 0.1, we want 0.1 units in Y-space (height).
    // So the offset in screen space (relative to height) is width * 0.5.
    // The offset vector in screen space is normal_screen * halfWidth.
    // Then convert back to NDC: divide X by aspect.
    
    let halfWidth = line.width * 0.5;
    let offset_screen = normal_screen * halfWidth;
    let offset_ndc = offset_screen * vec2<f32>(1.0 / aspect, 1.0);

    // 2D quad for the line (two triangles)
    var positions = array<vec2<f32>, 6>(
        p0 - offset_ndc,
        p1 - offset_ndc,
        p1 + offset_ndc,
        p0 - offset_ndc,
        p1 + offset_ndc,
        p0 + offset_ndc
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

    async circle(center: [number, number], radius: number, color: [number, number, number, number], options: { aspect?: number } = {}) {
        const c = new SharedArray(2); c.data.set(center);
        const r = new SharedArray(1); r.data[0] = radius;
        const col = new SharedArray(4); col.data.set(color);
        return this.circles(c, r, col, options);
    }

    async circles(centers: SharedArray, radii: SharedArray, colors: SharedArray, options: { aspect?: number } = {}) {
        if (!this.context) throw new Error("Canvas not setup");
        await this.init();
        const device = this.device!;

        const numCircles = radii.data.length;

        // Pack circle data: [center.x, center.y, radius, padding, color.r, color.g, color.b, color.a]
        // Each circle is 8 floats (32 bytes) for alignment
        const circleData = new Float32Array(numCircles * 8);
        for (let i = 0; i < numCircles; i++) {
            circleData[i * 8 + 0] = centers.data[i * 2 + 0];
            circleData[i * 8 + 1] = centers.data[i * 2 + 1];
            circleData[i * 8 + 2] = radii.data[i];
            circleData[i * 8 + 3] = 0; // padding
            circleData[i * 8 + 4] = colors.data[i * 4 + 0];
            circleData[i * 8 + 5] = colors.data[i * 4 + 1];
            circleData[i * 8 + 6] = colors.data[i * 4 + 2];
            circleData[i * 8 + 7] = colors.data[i * 4 + 3];
        }

        const circleBuffer = device.createBuffer({
            size: circleData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Circle buffer",
        });
        new Float32Array(circleBuffer.getMappedRange()).set(circleData);
        circleBuffer.unmap();

        // Aspect ratio uniform
        const aspect = options.aspect ?? (this.context.canvas.width / this.context.canvas.height);
        const uniformBuffer = device.createBuffer({
            size: 16, // Minimum uniform size
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Globals buffer",
        });
        new Float32Array(uniformBuffer.getMappedRange())[0] = aspect;
        uniformBuffer.unmap();

        const pipeline = await this.getCirclePipeline();
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: circleBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: uniformBuffer },
                }
            ],
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "load",
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
        uniformBuffer.destroy();
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
        const device = this.device!;

        const beginArray = begin.data;
        const endArray = end.data;
        const widthArray = width.data;
        const colorArray = color.data;

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

        // Aspect ratio uniform
        const aspect = options.aspect ?? (this.context.canvas.width / this.context.canvas.height);
        const uniformBuffer = device.createBuffer({
            size: 16, // Minimum uniform size
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Globals buffer",
        });
        new Float32Array(uniformBuffer.getMappedRange())[0] = aspect;
        uniformBuffer.unmap();

        const pipeline = await this.getLinePipeline();
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: lineBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: uniformBuffer },
                }
            ],
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "load",
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
        uniformBuffer.destroy();
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
     * Get WGSL alignment for a value
     */
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
}
