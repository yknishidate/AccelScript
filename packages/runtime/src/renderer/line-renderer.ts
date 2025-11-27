import { SharedArray } from '../shared-array';

export class LineRenderer {
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
        begin: SharedArray,
        end: SharedArray,
        width: SharedArray,
        color: SharedArray,
        options: { aspect?: number } = {}
    ) {
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

        const lineBuffer = this.device.createBuffer({
            size: lineData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Line buffer",
        });
        new Float32Array(lineBuffer.getMappedRange()).set(lineData);
        lineBuffer.unmap();

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
                    resource: { buffer: lineBuffer },
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
        passEncoder.draw(6, numLines); // 6 vertices per quad, numLines instances
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);

        lineBuffer.destroy();
        uniformBuffer.destroy();
    }
}
