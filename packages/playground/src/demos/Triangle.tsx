import React, { useEffect } from 'react';
import { runtime, f32 } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';

// Mock types removed as they are now in runtime


/** @vertex */
function vert(time: number) {
    // Hardcoded triangle
    let pos = vec2(0.0, 0.0);

    if (vertex_index == 0) {
        pos = vec2(0.0, 0.5);
    }
    if (vertex_index == 1) {
        pos = vec2(-0.5, -0.5);
    }
    if (vertex_index == 2) {
        pos = vec2(0.5, -0.5);
    }

    // Rotation
    const c = cos(time);
    const s = sin(time);

    // Rotation matrix (column-major)
    // [ c  -s ]
    // [ s   c ]
    const rot = mat2x2(c, s, -s, c);
    const rotatedPos = (rot * pos) as any;

    return vec4(rotatedPos.x, rotatedPos.y, 0.0, 1.0);
}

/** @fragment */
function frag() {
    return vec4(1.0, 0.0, 0.0, 1.0); // Red
}

export default function Triangle() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animationFrameId: number;

        const init = async () => {
            // Get shader info (transformed by compiler)
            const v = vert(0) as any;
            const f = frag() as any;

            const pipeline = await runtime.createRenderPipeline({
                vertex: v.code,
                vertexEntryPoint: v.entryPoint,
                fragment: f.code,
                fragmentEntryPoint: f.entryPoint
            });

            const startTime = performance.now();

            const render = async () => {
                const time = (performance.now() - startTime) / 1000;
                // @ts-ignore
                await runtime.clear(0.2, 0.2, 0.2);
                // @ts-ignore
                await runtime.draw(pipeline, 3, [f32(time)]);
                animationFrameId = requestAnimationFrame(render);
            };

            render();
        };
        init();

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [isReady]);

    return (
        <div style={{ padding: 20 }}>
            <h2>Triangle Demo</h2>
            <p>Rendering triangle on GPU with compute shader</p>
            <canvas ref={canvasRef} width={640} height={480} />
        </div>
    );
}
