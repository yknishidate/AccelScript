import { SharedArray } from '../shared-array';

export class CircleRenderer {
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
        radii: SharedArray,
        colors: SharedArray,
        options: { aspect?: number } = {}
    ) {
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

        const circleBuffer = this.device.createBuffer({
            size: circleData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Circle buffer",
        });
        new Float32Array(circleBuffer.getMappedRange()).set(circleData);
        circleBuffer.unmap();

        // Aspect ratio uniform
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
                    resource: { buffer: circleBuffer },
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
        passEncoder.draw(6, numCircles); // 6 vertices per quad, numCircles instances
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);

        circleBuffer.destroy();
        uniformBuffer.destroy();
    }
}
