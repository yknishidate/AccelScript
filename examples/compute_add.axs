// Buffer addition sample
compute Add(input1: Buffer<f32>, input2: Buffer<f32>, output: Buffer<f32>) {
    let id = gl_GlobalInvocationID.x;
    output[id] = input1[id] + input2[id];
}

// Initialize buffers
const SIZE = 1024;
const input1 = new Float32Array(SIZE).fill(1.0);
const input2 = new Float32Array(SIZE).fill(2.0);
const output = new Float32Array(SIZE);

// Create GPU buffers
const gpuInput1 = ax.createBuffer(input1);
const gpuInput2 = ax.createBuffer(input2);
const gpuOutput = ax.createBuffer(output);

// Initialize runtime
ax.init();

// Dispatch compute shader
ax.dispatch(Add, {
    workgroups: [32, 1, 1],
    bindings: [gpuInput1, gpuInput2, gpuOutput],
    options: {
        localSize: [32, 1, 1]
    }
});

// Read back results
ax.readBuffer(gpuOutput, output);
console.log("Result:", output[0]); // Should print 3.0
