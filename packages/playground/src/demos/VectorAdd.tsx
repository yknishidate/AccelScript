import React, { useState } from 'react';
import { runtime, SharedArray, f32 } from "@accelscript/runtime";

/** @kernel @workgroup_size(64) */
async function add(a: SharedArray<f32>, b: SharedArray<f32>, out: SharedArray<f32>) {
    const i = global_id.x;
    // @ts-ignore
    out[i] = a[i] + b[i];
}

export default function App() {
    const [result, setResult] = useState<string>("Ready");

    const run = async () => {
        setResult("Running...");
        try {
            const size = 1024;
            const a = new SharedArray(f32, size);
            const b = new SharedArray(f32, size);
            const out = new SharedArray(f32, size);

            a.data.fill(1);
            b.data.fill(2);

            // @ts-ignore
            await add<[16, 1, 1]>(a, b, out);

            setResult(`Done. out = [${out.data.slice(0, 5).join(', ')}, ...]`);
        } catch (e: any) {
            setResult(`Error: ${e.message}`);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>VectorAdd Demo</h2>
            <p>Add two vectors on GPU with compute shader</p>
            <button onClick={run}>Run GPU Kernel</button>
            <p>{result}</p>
        </div>
    );
}
