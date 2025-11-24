import React, { useEffect, useState } from 'react';
import { runtime } from "@accelscript/runtime";

// Mock types for compilation
declare global {
    var global_invocation_id: { x: number, y: number, z: number };
    var vertex_index: number;
    function vec4(x: number, y: number, z: number, w: number): Float32Array;
}

// --- Test Kernels ---

/** @kernel */
function testAdd(a: Float32Array, b: Float32Array, out: Float32Array) {
    let i = global_invocation_id.x;
    out[i] = a[i] + b[i];
}

/** @vertex */
function testVert() {
    return vec4(0.0, 0.0, 0.0, 1.0);
}

/** @fragment */
function testFrag() {
    return vec4(1.0, 0.0, 0.0, 1.0);
}

// --- Test Runner ---

export default function Tests() {
    const [results, setResults] = useState<{ name: string, passed: boolean, message: string }[]>([]);
    const [running, setRunning] = useState(false);

    const runTests = async () => {
        setRunning(true);
        setResults([]);
        const newResults = [];

        try {
            await runtime.init();

            // Test 1: Compute (Vector Add)
            try {
                const size = 64;
                const a = new Float32Array(size).fill(1);
                const b = new Float32Array(size).fill(2);
                const out = new Float32Array(size);

                const tAdd = testAdd as any; // Transformed
                // Note: The compiler transforms the function call to runtime.dispatch
                // But here we are calling the transformed function which returns a Promise
                await tAdd(a, b, out);

                if (out[0] === 3 && out[63] === 3) {
                    newResults.push({ name: "Compute: Vector Add", passed: true, message: "Output correct" });
                } else {
                    newResults.push({ name: "Compute: Vector Add", passed: false, message: `Expected 3, got ${out[0]}` });
                }
            } catch (e: any) {
                newResults.push({ name: "Compute: Vector Add", passed: false, message: e.message });
            }

            // Test 2: Graphics Pipeline Creation
            try {
                const v = testVert() as any;
                const f = testFrag() as any;

                const pipeline = await runtime.createRenderPipeline({
                    vertex: v.code,
                    vertexEntryPoint: v.entryPoint,
                    fragment: f.code,
                    fragmentEntryPoint: f.entryPoint
                });

                if (pipeline) {
                    newResults.push({ name: "Graphics: Create Pipeline", passed: true, message: "Pipeline created" });
                } else {
                    newResults.push({ name: "Graphics: Create Pipeline", passed: false, message: "Pipeline is null" });
                }
            } catch (e: any) {
                newResults.push({ name: "Graphics: Create Pipeline", passed: false, message: e.message });
            }

        } catch (e: any) {
            newResults.push({ name: "Global Init", passed: false, message: e.message });
        }

        setResults(newResults);
        setRunning(false);
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Integration Tests</h2>
            <button onClick={runTests} disabled={running}>
                {running ? "Running..." : "Run Tests"}
            </button>
            <ul style={{ marginTop: 20 }}>
                {results.map((r, i) => (
                    <li key={i} style={{ color: r.passed ? 'green' : 'red', marginBottom: 5 }}>
                        <strong>{r.name}</strong>: {r.passed ? "PASS" : "FAIL"} - {r.message}
                    </li>
                ))}
            </ul>
        </div>
    );
}
