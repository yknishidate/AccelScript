// Triangle rendering sample
struct Vertex {
    position: vec3;
    color: vec3;
}

struct Uniforms {
    modelViewProj: mat4;
}

struct VertexOutput {
    position: vec4;  // Built-in position output (automatically recognized)
    color: vec3;     // Other outputs are automatically assigned locations
}

vertex SimpleVertex(vertex: Vertex, uniforms: Uniforms) -> VertexOutput {
    var output: VertexOutput;
    output.position = uniforms.modelViewProj * vec4(vertex.position, 1.0);
    output.color = vertex.color;
    return output;
}

fragment SimpleFragment(input: VertexOutput) -> vec4 {
    return vec4(input.color, 1.0);
}

// Create canvas
const canvas = document.getElementById('canvas');
const width = canvas.width = 800;
const height = canvas.height = 600;

// Initialize runtime
ax.init(canvas);

// Create vertex data
const vertices = [
    // position           // color
    0.0,  0.5,  0.0,     1.0, 0.0, 0.0,  // top
   -0.5, -0.5,  0.0,     0.0, 1.0, 0.0,  // left
    0.5, -0.5,  0.0,     0.0, 0.0, 1.0   // right
];

// Create uniform data
const uniforms = {
    modelViewProj: mat4.identity()
};

// Create GPU buffers
const gpuVertices = ax.createBuffer(new Float32Array(vertices));
const gpuUniforms = ax.createBuffer(uniforms);

// Main render loop
function render() {
    // Update uniforms if needed
    // ...

    // Draw triangle
    ax.draw([SimpleVertex, SimpleFragment], {
        vertexCount: 3,
        bindings: [gpuVertices, gpuUniforms],
        options: {
            cullMode: 'none',
            depthWrite: true,
            topology: 'triangle-list'
        }
    });

    requestAnimationFrame(render);
}

// Start render loop
render();
