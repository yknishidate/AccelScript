import { Camera } from '../camera';
import { lookAt, perspective } from '../math';

export class GizmoRenderer {
    private pipeline: GPURenderPipeline | null = null;
    private device: GPUDevice;
    private presentationFormat: GPUTextureFormat;
    private vertexBuffer: GPUBuffer | null = null;

    constructor(device: GPUDevice, presentationFormat: GPUTextureFormat) {
        this.device = device;
        this.presentationFormat = presentationFormat;
    }

    private createMesh() {
        if (this.vertexBuffer) return;

        // X (Red), Y (Green), Z (Blue) axes
        // Each axis is a line from 0 to 1
        const vertices = new Float32Array([
            // Position (3), Color (3)
            0, 0, 0, 1, 0, 0, // Origin (Red)
            1, 0, 0, 1, 0, 0, // X-axis end

            0, 0, 0, 0, 1, 0, // Origin (Green)
            0, 1, 0, 0, 1, 0, // Y-axis end

            0, 0, 0, 0, 0, 1, // Origin (Blue)
            0, 0, 1, 0, 0, 1, // Z-axis end
        ]);

        this.vertexBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
            label: "Gizmo Vertex Buffer"
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
        this.vertexBuffer.unmap();
    }

    private async getPipeline(): Promise<GPURenderPipeline> {
        if (this.pipeline) return this.pipeline;

        const shaderCode = `
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) color: vec3<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

struct Globals {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> globals: Globals;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = globals.projection * globals.view * vec4<f32>(input.position, 1.0);
    output.color = vec4<f32>(input.color, 1.0);
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
                buffers: [{
                    arrayStride: 6 * 4,
                    attributes: [
                        {
                            shaderLocation: 0,
                            offset: 0,
                            format: "float32x3",
                        },
                        {
                            shaderLocation: 1,
                            offset: 3 * 4,
                            format: "float32x3",
                        }
                    ]
                }]
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
                topology: "line-list",
            },
            depthStencil: {
                depthWriteEnabled: false, // Draw on top
                depthCompare: "always",
                format: "depth24plus",
            },
        });

        return this.pipeline;
    }

    async draw(
        context: GPUCanvasContext,
        camera: Camera,
        depthTexture: GPUTexture
    ) {
        this.createMesh();
        if (!this.vertexBuffer) return;

        // Viewport for top-right corner
        const canvasWidth = context.canvas.width;
        const canvasHeight = context.canvas.height;
        const size = 100; // Size of the gizmo widget
        const padding = 10;
        const x = canvasWidth - size - padding;
        const y = padding;

        // Camera for the widget
        // We want to rotate with the main camera, but stay at origin.
        const widgetDist = 3.0;

        // Calculate direction from center to camera
        const dx = camera.pos[0] - camera.center[0];
        const dy = camera.pos[1] - camera.center[1];
        const dz = camera.pos[2] - camera.center[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Normalize and scale by widgetDist
        const camPos = [
            (dx / len) * widgetDist,
            (dy / len) * widgetDist,
            (dz / len) * widgetDist
        ];

        const viewMatrix = lookAt(
            vec3f(camPos[0], camPos[1], camPos[2]),
            vec3f(0, 0, 0),
            vec3f(0, 1, 0)
        );
        const projectionMatrix = perspective(Math.PI / 4, 1, 0.1, 100.0);

        const uniformSize = 16 * 4 * 2;
        const uniformBuffer = this.device.createBuffer({
            size: uniformSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Gizmo Globals Buffer",
        });
        const uniformView = new Float32Array(uniformBuffer.getMappedRange());
        uniformView.set(viewMatrix, 0);
        uniformView.set(projectionMatrix, 16);
        uniformBuffer.unmap();

        const pipeline = await this.getPipeline();
        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: uniformBuffer },
                }
            ],
        });

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                loadOp: "load", // Draw on top of existing content
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "discard",
            },
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setViewport(x, y, size, size, 0, 1);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.setVertexBuffer(0, this.vertexBuffer);
        passEncoder.draw(6);
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);

        uniformBuffer.destroy();
    }
}
