import { SharedArray } from '../shared-array';

export class RectangleRenderer {
    private pipeline: GPURenderPipeline | null = null;
    private device: GPUDevice;
    private presentationFormat: GPUTextureFormat;

    constructor(device: GPUDevice, presentationFormat: GPUTextureFormat) {
        this.device = device;
        this.presentationFormat = presentationFormat;
    }

    private async getPipeline(): Promise<GPURenderPipeline> {
        if (this.pipeline) return this.pipeline;

        const shaderCode = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

struct Rectangle {
    center: vec2<f32>,
    size: vec2<f32>,
    color: vec4<f32>,
}

struct Globals {
    aspect: f32,
}

@group(0) @binding(0) var<storage, read> rects: array<Rectangle>;
@group(0) @binding(1) var<uniform> globals: Globals;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let rect = rects[instanceIndex];
    
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
    
    // Transform to NDC space
    // size is the full width/height, so we multiply by 0.5
    let worldPos = rect.center + localPos * rect.size * 0.5;
    
    // Apply aspect ratio correction
    // We want to keep the height fixed and adjust width
    // Or usually, we adjust x by dividing by aspect ratio if we want square pixels
    // globals.aspect is width / height.
    // So if width > height (aspect > 1), x range [-1, 1] covers more pixels.
    // To make a square look square, we need to shrink x or expand y.
    // Let's assume we want to draw in "square" coordinates where Y is [-1, 1].
    // Then X should be scaled by 1/aspect.
    
    var finalPos = worldPos;
    finalPos.x = finalPos.x / globals.aspect;

    output.position = vec4<f32>(finalPos, 0.0, 1.0);
    output.color = rect.color;
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
`;

        const shaderModule = this.device.createShaderModule({ code: shaderCode });

        this.pipeline = this.device.createRenderPipeline({
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

        return this.pipeline;
    }

    async draw(
        context: GPUCanvasContext,
        centers: SharedArray,
        sizes: SharedArray,
        colors: SharedArray,
        options: { aspect?: number } = {}
    ) {
        const numRects = centers.data.length / 2; // centers is vec2

        if (sizes.data.length !== numRects * 2) {
            throw new Error(`sizes length (${sizes.data.length}) must be 2 * numRects (${numRects})`);
        }
        if (colors.data.length !== numRects * 4) {
            throw new Error(`colors length (${colors.data.length}) must be 4 * numRects (${numRects})`);
        }

        // Pack rectangle data: [center.x, center.y, size.x, size.y, color.r, color.g, color.b, color.a]
        // 8 floats (32 bytes)
        const rectData = new Float32Array(numRects * 8);
        for (let i = 0; i < numRects; i++) {
            rectData[i * 8 + 0] = centers.data[i * 2 + 0];
            rectData[i * 8 + 1] = centers.data[i * 2 + 1];
            rectData[i * 8 + 2] = sizes.data[i * 2 + 0];
            rectData[i * 8 + 3] = sizes.data[i * 2 + 1];
            rectData[i * 8 + 4] = colors.data[i * 4 + 0];
            rectData[i * 8 + 5] = colors.data[i * 4 + 1];
            rectData[i * 8 + 6] = colors.data[i * 4 + 2];
            rectData[i * 8 + 7] = colors.data[i * 4 + 3];
        }

        const rectBuffer = this.device.createBuffer({
            size: rectData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Rectangle buffer",
        });
        new Float32Array(rectBuffer.getMappedRange()).set(rectData);
        rectBuffer.unmap();

        // Aspect ratio uniform (unused in current shader but kept for consistency/future use)
        const aspect = options.aspect ?? (context.canvas.width / context.canvas.height);
        const uniformBuffer = this.device.createBuffer({
            size: 16, // Minimum uniform size
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Globals buffer",
        });
        new Float32Array(uniformBuffer.getMappedRange())[0] = aspect;
        uniformBuffer.unmap();

        const pipeline = await this.getPipeline();
        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: rectBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: uniformBuffer },
                }
            ],
        });

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();

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
        passEncoder.draw(6, numRects); // 6 vertices per quad, numRects instances
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);

        rectBuffer.destroy();
        uniformBuffer.destroy();
    }
}
