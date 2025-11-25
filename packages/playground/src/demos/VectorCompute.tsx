import React, { useState } from 'react';
import { runtime, SharedArray, f32 } from "@accelscript/runtime";

/** @device */
function sigmoid(x: number): number {
    return 1.0 / (1.0 + exp(-x));
}

/** @kernel @workgroup_size(64) */
async function compute(a: SharedArray<f32>, b: SharedArray<f32>, out: SharedArray<f32>) {
    const i = global_id.x;
    // @ts-ignore
    out[i] = sigmoid(a[i] + b[i]);
}

export default function VectorCompute() {
    const [result, setResult] = useState<string>("Ready");

    const run = async () => {
        setResult("Running...");
        try {
            const size = 1024;
            const a = new SharedArray(f32, size);
            const b = new SharedArray(f32, size);
            const out = new SharedArray(f32, size);

            // Fill with some data
            for (let i = 0; i < size; i++) {
                a.data[i] = (i - size / 2) * 0.01; // Range approx -5 to 5
                b.data[i] = 0;
            }

            // @ts-ignore
            await compute<[16, 1, 1]>(a, b, out);

            setResult(`Done. out[0] = ${out.data[0].toFixed(4)}, out[512] = ${out.data[512].toFixed(4)}, out[1023] = ${out.data[1023].toFixed(4)}`);
        } catch (e: any) {
            setResult(`Error: ${e.message}`);
            console.error(e);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Vector Compute Demo</h2>
            <p>Apply Sigmoid function on GPU using @device function</p>
            <button onClick={run}>Run GPU Kernel</button>
            <p>{result}</p>
        </div>
    );
}
