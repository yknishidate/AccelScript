import { SharedArray } from '../shared-array';

export class ImageRenderer {
    private device: GPUDevice;
    private presentationFormat: GPUTextureFormat;

    constructor(device: GPUDevice, presentationFormat: GPUTextureFormat) {
        this.device = device;
        this.presentationFormat = presentationFormat;
    }

    async draw(context: GPUCanvasContext, array: SharedArray) {
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

        // Create texture
        const texture = this.device.createTexture({
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

                // Copy RGB channels
                rgbaData[dstIdx + 0] = Math.floor(Math.max(0.0, array.data[srcIdx + 0]) * 255);
                rgbaData[dstIdx + 1] = Math.floor(Math.max(0.0, array.data[srcIdx + 1]) * 255);
                rgbaData[dstIdx + 2] = Math.floor(Math.max(0.0, array.data[srcIdx + 2]) * 255);
                rgbaData[dstIdx + 3] = channels === 4 ? Math.floor(Math.max(0.0, array.data[srcIdx + 3]) * 255) : 255;
            }
        }

        // Upload to texture
        this.device.queue.writeTexture(
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

        const shaderModule = this.device.createShaderModule({ code: shaderCode });
        const sampler = this.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });

        const pipeline = this.device.createRenderPipeline({
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

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: texture.createView()
                },
                {
                    binding: 1,
                    resource: sampler
                }
            ]
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
        passEncoder.draw(6);
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }
}
