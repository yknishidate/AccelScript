import { SharedArray } from '../shared-array';
import { Camera } from '../camera';
import { lookAt, perspective } from '../math';

export class SphereRenderer {
    private pipeline: GPURenderPipeline | null = null;
    private device: GPUDevice;
    private presentationFormat: GPUTextureFormat;
    private depthTexture: GPUTexture | null = null;

    private vertexBuffer: GPUBuffer | null = null;
    private indexBuffer: GPUBuffer | null = null;
    private indexCount: number = 0;

    constructor(device: GPUDevice, presentationFormat: GPUTextureFormat) {
        this.device = device;
        this.presentationFormat = presentationFormat;
    }

    private createSphereMesh() {
        if (this.vertexBuffer && this.indexBuffer) return;

        const radius = 1.0;
        const widthSegments = 32;
        const heightSegments = 16;

        const vertices: number[] = [];
        const indices: number[] = [];

        for (let y = 0; y <= heightSegments; y++) {
            const v = y / heightSegments;
            const phi = v * Math.PI;

            for (let x = 0; x <= widthSegments; x++) {
                const u = x / widthSegments;
                const theta = u * 2 * Math.PI;

                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);
                const sinTheta = Math.sin(theta);
                const cosTheta = Math.cos(theta);

                const ux = cosTheta * sinPhi;
                const uy = cosPhi;
                const uz = sinTheta * sinPhi;

                // Position
                vertices.push(ux * radius, uy * radius, uz * radius);
                // Normal (same as position for unit sphere)
                vertices.push(ux, uy, uz);
            }
        }

        for (let y = 0; y < heightSegments; y++) {
            for (let x = 0; x < widthSegments; x++) {
                const first = (y * (widthSegments + 1)) + x;
                const second = first + widthSegments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        const vertexData = new Float32Array(vertices);
        this.vertexBuffer = this.device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
            label: "Sphere Vertex Buffer"
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
        this.vertexBuffer.unmap();

        const indexData = new Uint16Array(indices);
        this.indexBuffer = this.device.createBuffer({
            size: indexData.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
            label: "Sphere Index Buffer"
        });
        new Uint16Array(this.indexBuffer.getMappedRange()).set(indexData);
        this.indexBuffer.unmap();

        this.indexCount = indices.length;
    }

    private async getPipeline(): Promise<GPURenderPipeline> {
        if (this.pipeline) return this.pipeline;

        const shaderCode = `
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) worldPos: vec3<f32>,
}

struct SphereInstance {
    center: vec3<f32>,
    radius: f32,
    color: vec4<f32>,
}

struct Globals {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

@group(0) @binding(0) var<storage, read> instances: array<SphereInstance>;
@group(0) @binding(1) var<uniform> globals: Globals;

@vertex
fn vs_main(input: VertexInput, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let instance = instances[instanceIndex];
    
    // Scale position by radius and translate by center
    let worldPos = instance.center + input.position * instance.radius;
    
    output.position = globals.projection * globals.view * vec4<f32>(worldPos, 1.0);
    output.color = instance.color;
    output.normal = input.normal; // Normal is same for uniform scaling
    output.worldPos = worldPos;
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Simple directional lighting
    let lightDir = normalize(vec3<f32>(0.5, 0.8, 1.0));
    let normal = normalize(input.normal);
    
    let diffuse = max(dot(normal, lightDir), 0.0);
    let ambient = 0.2;
    let lighting = min(diffuse + ambient, 1.0);
    
    return vec4<f32>(input.color.rgb * lighting, input.color.a);
}
`;

        const shaderModule = this.device.createShaderModule({ code: shaderCode });

        this.pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 6 * 4, // 3 pos + 3 normal = 6 floats
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
                topology: "triangle-list",
                cullMode: "back",
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
        });

        return this.pipeline;
    }

    async draw(
        context: GPUCanvasContext,
        centers: SharedArray,
        radii: SharedArray,
        colors: SharedArray,
        options: { aspect?: number, camera?: Camera } = {}
    ) {
        this.createSphereMesh();
        if (!this.vertexBuffer || !this.indexBuffer) return;

        const numSpheres = centers.data.length / 3;

        if (radii.data.length !== numSpheres && radii.data.length !== 1) {
            throw new Error(`radii length (${radii.data.length}) must be numSpheres (${numSpheres}) or 1`);
        }

        const isColorVec4 = colors.data.length === numSpheres * 4;
        const singleRadius = radii.data.length === 1 ? radii.data[0] : null;

        // Pack instance data: [center.x, center.y, center.z, radius, color.r, color.g, color.b, color.a]
        const instanceData = new Float32Array(numSpheres * 8);
        for (let i = 0; i < numSpheres; i++) {
            instanceData[i * 8 + 0] = centers.data[i * 3 + 0];
            instanceData[i * 8 + 1] = centers.data[i * 3 + 1];
            instanceData[i * 8 + 2] = centers.data[i * 3 + 2];
            instanceData[i * 8 + 3] = singleRadius !== null ? singleRadius : radii.data[i];

            if (isColorVec4) {
                instanceData[i * 8 + 4] = colors.data[i * 4 + 0];
                instanceData[i * 8 + 5] = colors.data[i * 4 + 1];
                instanceData[i * 8 + 6] = colors.data[i * 4 + 2];
                instanceData[i * 8 + 7] = colors.data[i * 4 + 3];
            } else {
                instanceData[i * 8 + 4] = colors.data[i * 3 + 0];
                instanceData[i * 8 + 5] = colors.data[i * 3 + 1];
                instanceData[i * 8 + 6] = colors.data[i * 3 + 2];
                instanceData[i * 8 + 7] = 1.0;
            }
        }

        const instanceBuffer = this.device.createBuffer({
            size: instanceData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Sphere Instance Buffer",
        });
        new Float32Array(instanceBuffer.getMappedRange()).set(instanceData);
        instanceBuffer.unmap();

        // Matrices
        const aspect = options.aspect ?? (context.canvas.width / context.canvas.height);
        let viewMatrix: Float32Array;
        let projectionMatrix: Float32Array;

        if (options.camera) {
            const cam = options.camera;
            viewMatrix = lookAt(
                vec3f(cam.pos[0], cam.pos[1], cam.pos[2]),
                vec3f(cam.center[0], cam.center[1], cam.center[2]),
                vec3f(0, 1, 0)
            );
            projectionMatrix = perspective(Math.PI / 4, aspect, 0.1, 100.0);
        } else {
            viewMatrix = lookAt(vec3f(0, 0, 2), vec3f(0, 0, 0), vec3f(0, 1, 0));
            projectionMatrix = perspective(Math.PI / 4, aspect, 0.1, 100.0);
        }

        const uniformSize = 16 * 4 * 2;
        const uniformBuffer = this.device.createBuffer({
            size: uniformSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Globals Buffer",
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
                    resource: { buffer: instanceBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: uniformBuffer },
                }
            ],
        });

        // Depth texture
        const canvasWidth = context.canvas.width;
        const canvasHeight = context.canvas.height;
        if (!this.depthTexture || this.depthTexture.width !== canvasWidth || this.depthTexture.height !== canvasHeight) {
            if (this.depthTexture) this.depthTexture.destroy();
            this.depthTexture = this.device.createTexture({
                size: [canvasWidth, canvasHeight],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "load",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.setVertexBuffer(0, this.vertexBuffer);
        passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
        passEncoder.drawIndexed(this.indexCount, numSpheres);
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);

        instanceBuffer.destroy();
        uniformBuffer.destroy();
    }
}
