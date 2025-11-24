import React, { useState } from 'react';



/** @kernel @workgroup_size(64) */
async function add(a: Float32Array, b: Float32Array, out: Float32Array) {
    const i = global_id.x;
    out[i] = a[i] + b[i];
}

export default function App() {
    const [result, setResult] = useState<string>("Ready");

    const run = async () => {
        setResult("Running...");
        try {
            const size = 1024;
            const a = new Float32Array(size).fill(1);
            const b = new Float32Array(size).fill(2);
            const out = new Float32Array(size);

            // @ts-ignore
            await add<[16, 1, 1]>(a, b, out);

            setResult(`Done. out = [${out.join(', ')}]`);
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
