import { SharedArray, SyncMode } from '../shared-array';
import { Camera } from '../camera';
import { lookAt, perspective } from '../math';
import { vec3f } from '../types';

export enum PrimitiveType {
    Sphere = 0,
    Box = 1,
    Plane = 2,
}

export class PrimitiveRenderer {
    private pipeline: GPURenderPipeline | null = null;
    private device: GPUDevice;
    private presentationFormat: GPUTextureFormat;

    private sphereVertexBuffer: GPUBuffer | null = null;
    private sphereIndexBuffer: GPUBuffer | null = null;
    private sphereIndexCount: number = 0;

    private boxVertexBuffer: GPUBuffer | null = null;
    private boxIndexBuffer: GPUBuffer | null = null;
    private boxIndexCount: number = 0;

    private planeVertexBuffer: GPUBuffer | null = null;
    private planeIndexBuffer: GPUBuffer | null = null;
    private planeIndexCount: number = 0;

    private defaultRotationBuffer: GPUBuffer | null = null;

    constructor(device: GPUDevice, presentationFormat: GPUTextureFormat) {
        this.device = device;
        this.presentationFormat = presentationFormat;
    }

    private createSphereMesh() {
        if (this.sphereVertexBuffer && this.sphereIndexBuffer) return;

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

                indices.push(first, first + 1, second);
                indices.push(second, first + 1, second + 1);
            }
        }

        const vertexData = new Float32Array(vertices);
        this.sphereVertexBuffer = this.device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
            label: "Sphere Vertex Buffer"
        });
        new Float32Array(this.sphereVertexBuffer.getMappedRange()).set(vertexData);
        this.sphereVertexBuffer.unmap();

        const indexData = new Uint16Array(indices);
        this.sphereIndexBuffer = this.device.createBuffer({
            size: indexData.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
            label: "Sphere Index Buffer"
        });
        new Uint16Array(this.sphereIndexBuffer.getMappedRange()).set(indexData);
        this.sphereIndexBuffer.unmap();

        this.sphereIndexCount = indices.length;
    }

    private createBoxMesh() {
        if (this.boxVertexBuffer && this.boxIndexBuffer) return;

        // Unit cube centered at origin, from -1 to 1
        // 24 vertices (4 per face * 6 faces)
        const vertices = [
            // Front face
            -1, -1, 1, 0, 0, 1,
            1, -1, 1, 0, 0, 1,
            1, 1, 1, 0, 0, 1,
            -1, 1, 1, 0, 0, 1,
            // Back face
            -1, -1, -1, 0, 0, -1,
            -1, 1, -1, 0, 0, -1,
            1, 1, -1, 0, 0, -1,
            1, -1, -1, 0, 0, -1,
            // Top face
            -1, 1, -1, 0, 1, 0,
            -1, 1, 1, 0, 1, 0,
            1, 1, 1, 0, 1, 0,
            1, 1, -1, 0, 1, 0,
            // Bottom face
            -1, -1, -1, 0, -1, 0,
            1, -1, -1, 0, -1, 0,
            1, -1, 1, 0, -1, 0,
            -1, -1, 1, 0, -1, 0,
            // Right face
            1, -1, -1, 1, 0, 0,
            1, 1, -1, 1, 0, 0,
            1, 1, 1, 1, 0, 0,
            1, -1, 1, 1, 0, 0,
            // Left face
            -1, -1, -1, -1, 0, 0,
            -1, -1, 1, -1, 0, 0,
            -1, 1, 1, -1, 0, 0,
            -1, 1, -1, -1, 0, 0,
        ];

        const indices = [
            0, 1, 2, 0, 2, 3,    // Front
            4, 5, 6, 4, 6, 7,    // Back
            8, 9, 10, 8, 10, 11,   // Top
            12, 13, 14, 12, 14, 15,   // Bottom
            16, 17, 18, 16, 18, 19,   // Right
            20, 21, 22, 20, 22, 23,   // Left
        ];

        const vertexData = new Float32Array(vertices);
        this.boxVertexBuffer = this.device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
            label: "Box Vertex Buffer"
        });
        new Float32Array(this.boxVertexBuffer.getMappedRange()).set(vertexData);
        this.boxVertexBuffer.unmap();

        const indexData = new Uint16Array(indices);
        this.boxIndexBuffer = this.device.createBuffer({
            size: indexData.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
            label: "Box Index Buffer"
        });
        new Uint16Array(this.boxIndexBuffer.getMappedRange()).set(indexData);
        this.boxIndexBuffer.unmap();

        this.boxIndexCount = indices.length;
    }

    private createPlaneMesh() {
        if (this.planeVertexBuffer && this.planeIndexBuffer) return;

        // Unit plane centered at origin, on XZ plane, from -1 to 1
        const vertices = [
            -1, 0, 1, 0, 1, 0,
            1, 0, 1, 0, 1, 0,
            1, 0, -1, 0, 1, 0,
            -1, 0, -1, 0, 1, 0,
        ];

        const indices = [
            0, 1, 2, 0, 2, 3
        ];

        const vertexData = new Float32Array(vertices);
        this.planeVertexBuffer = this.device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
            label: "Plane Vertex Buffer"
        });
        new Float32Array(this.planeVertexBuffer.getMappedRange()).set(vertexData);
        this.planeVertexBuffer.unmap();

        const indexData = new Uint16Array(indices);
        this.planeIndexBuffer = this.device.createBuffer({
            size: indexData.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
            label: "Plane Index Buffer"
        });
        new Uint16Array(this.planeIndexBuffer.getMappedRange()).set(indexData);
        this.planeIndexBuffer.unmap();

        this.planeIndexCount = indices.length;
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

struct Globals {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

@group(0) @binding(0) var<storage, read> centers: array<vec3f>;
@group(0) @binding(1) var<storage, read> sizes: array<vec3f>;
@group(0) @binding(2) var<storage, read> rotations: array<vec3f>;
@group(0) @binding(3) var<storage, read> colors: array<vec3f>;
@group(0) @binding(4) var<uniform> globals: Globals;

@vertex
fn vs_main(input: VertexInput, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    // Read Center (vec3f)
    let center = centers[instanceIndex];

    // Read Size (vec3f)
    let size = sizes[instanceIndex];

    // Read Rotation (vec3f)
    let rotation = rotations[instanceIndex];

    // Read Color (vec3f)
    
    // Scale position by size
    var pos = input.position * size;

    // Apply rotation (Euler angles)
    let c = cos(rotation);
    let s = sin(rotation);

    // Rotate X
    let y1 = pos.y * c.x - pos.z * s.x;
    let z1 = pos.y * s.x + pos.z * c.x;
    pos.y = y1;
    pos.z = z1;

    // Rotate Y
    let x2 = pos.x * c.y + pos.z * s.y;
    let z2 = -pos.x * s.y + pos.z * c.y;
    pos.x = x2;
    pos.z = z2;

    // Rotate Z
    let x3 = pos.x * c.z - pos.y * s.z;
    let y3 = pos.x * s.z + pos.y * c.z;
    pos.x = x3;
    pos.y = y3;

    let worldPos = center + pos;
    
    output.position = globals.projection * globals.view * vec4<f32>(worldPos, 1.0);
    output.color = vec4<f32>(colors[instanceIndex], 1.0);
    
    // Rotate normal
    var norm = input.normal;
    // Rotate X
    let ny1 = norm.y * c.x - norm.z * s.x;
    let nz1 = norm.y * s.x + norm.z * c.x;
    norm.y = ny1;
    norm.z = nz1;
    // Rotate Y
    let nx2 = norm.x * c.y + norm.z * s.y;
    let nz2 = -norm.x * s.y + norm.z * c.y;
    norm.x = nx2;
    norm.z = nz2;
    // Rotate Z
    let nx3 = norm.x * c.z - norm.y * s.z;
    let ny3 = norm.x * s.z + norm.y * c.z;
    norm.x = nx3;
    norm.y = ny3;

    output.normal = norm; 
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
        centers: SharedArray<vec3f>,
        sizes: SharedArray<vec3f>,
        colors: SharedArray<vec3f>,
        type: PrimitiveType,
        depthTexture: GPUTexture,
        options: { aspect?: number, camera?: Camera, clearDepth?: boolean, rotations?: SharedArray<vec3f> } = {}
    ) {
        const clearDepth = options.clearDepth ?? false;
        const rotations = options.rotations;
        const numPrims = centers.size;

        // Ensure buffers exist
        const centerBuffer = await centers.ensureBuffer(this.device);
        if (centers.syncMode !== SyncMode.GpuToCpu && centers.syncMode !== SyncMode.None) {
            await centers.syncToDevice(this.device);
        }

        const sizeBuffer = await sizes.ensureBuffer(this.device);
        if (sizes.syncMode !== SyncMode.GpuToCpu && sizes.syncMode !== SyncMode.None) {
            await sizes.syncToDevice(this.device);
        }

        const colorBuffer = await colors.ensureBuffer(this.device);
        if (colors.syncMode !== SyncMode.GpuToCpu && colors.syncMode !== SyncMode.None) {
            await colors.syncToDevice(this.device);
        }

        let rotationBuffer: GPUBuffer;
        if (rotations) {
            rotationBuffer = await rotations.ensureBuffer(this.device);
            if (rotations.syncMode !== SyncMode.GpuToCpu && rotations.syncMode !== SyncMode.None) {
                await rotations.syncToDevice(this.device);
            }
        } else {
            // Create a default zero buffer if not present
            if (!this.defaultRotationBuffer || this.defaultRotationBuffer.size < numPrims * 4 * 4) {
                if (this.defaultRotationBuffer) this.defaultRotationBuffer.destroy();
                this.defaultRotationBuffer = this.device.createBuffer({
                    size: Math.max(16, numPrims * 4 * 4), // Ensure at least 16 bytes
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    label: "Default rotation buffer",
                });
                console.log("Create default rotation buffer.");
                // Zero initialized by default creation
            }
            rotationBuffer = this.defaultRotationBuffer;
        }

        // Matrices
        const aspect = options.aspect ?? (context.canvas.width / context.canvas.height);
        let viewMatrix: Float32Array;
        let projectionMatrix: Float32Array;

        if (options.camera) {
            const cam = options.camera;
            viewMatrix = lookAt(cam.pos, cam.center, cam.up);
            projectionMatrix = perspective(Math.PI / 4, aspect, 0.1, 100.0);
        } else {
            viewMatrix = lookAt(vec3f(0, 0, 2), vec3f(0, 0, 0), vec3f(0, 1, 0));
            projectionMatrix = perspective(Math.PI / 4, aspect, 0.1, 100.0);
        }

        const uniformSize = 16 * 4 * 2 + 16; // mat4 * 2 + pad
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
                { binding: 0, resource: { buffer: centerBuffer } },
                { binding: 1, resource: { buffer: sizeBuffer } },
                { binding: 2, resource: { buffer: rotationBuffer } },
                { binding: 3, resource: { buffer: colorBuffer } },
                { binding: 4, resource: { buffer: uniformBuffer } },
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
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: clearDepth ? "clear" : "load",
                depthStoreOp: "store",
            },
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);

        if (type === PrimitiveType.Sphere) {
            this.createSphereMesh();
            if (this.sphereVertexBuffer && this.sphereIndexBuffer) {
                passEncoder.setVertexBuffer(0, this.sphereVertexBuffer);
                passEncoder.setIndexBuffer(this.sphereIndexBuffer, "uint16");
                passEncoder.drawIndexed(this.sphereIndexCount, numPrims);
            }
        } else if (type === PrimitiveType.Box) {
            this.createBoxMesh();
            if (this.boxVertexBuffer && this.boxIndexBuffer) {
                passEncoder.setVertexBuffer(0, this.boxVertexBuffer);
                passEncoder.setIndexBuffer(this.boxIndexBuffer, "uint16");
                passEncoder.drawIndexed(this.boxIndexCount, numPrims);
            }
        } else if (type === PrimitiveType.Plane) {
            this.createPlaneMesh();
            if (this.planeVertexBuffer && this.planeIndexBuffer) {
                passEncoder.setVertexBuffer(0, this.planeVertexBuffer);
                passEncoder.setIndexBuffer(this.planeIndexBuffer, "uint16");
                passEncoder.drawIndexed(this.planeIndexCount, numPrims);
            }
        }

        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);

        uniformBuffer.destroy();
    }
}
