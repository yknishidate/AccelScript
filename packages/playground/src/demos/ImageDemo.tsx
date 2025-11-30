import React, { useEffect } from 'react';
import { runtime, SharedArray, vec4f, f32 } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';

interface Params {
    time: f32;
    width: u32;
    height: u32;
}

/** @kernel @workgroup_size(8, 8) */
async function generateImage(image: SharedArray<vec4f>, params: Params) {
    const x = global_invocation_id.x;
    const y = global_invocation_id.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    const idx = y * params.width + x;

    // Generate colorful pattern
    const fx = f32(x) / f32(params.width);
    const fy = f32(y) / f32(params.height);

    const uv = vec2(fx, fy);

    const r = 0.5 + 0.5 * sin(uv.x * 10.0 + params.time);
    const g = 0.5 + 0.5 * sin(uv.y * 10.0 + params.time * 1.3);
    const b = 0.5 + 0.5 * sin((uv.x + uv.y) * 5.0 + params.time * 0.7);

    image[idx] = vec4(r, g, b, 1.0);
}

export default function ImageDemo() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            const width = 800;
            const height = 600;

            const params = {
                time: 0.0,
                width: u32(width),
                height: u32(height),
            };
            // SharedArray<vec4f> with shape [height, width]
            // The kernel uses 1D index: y * width + x.
            const image = new SharedArray(vec4f, [height, width]);

            const startTime = performance.now();

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                params.time = (performance.now() - startTime) / 1000.0;

                // Dispatch kernel
                // 800 / 8 = 100, 600 / 8 = 75
                await generateImage<[100, 75, 1]>(image, params);

                // Display image
                await runtime.showImage(image);

                requestAnimationFrame(animate);
            };

            animate();
        };

        init();

        return () => {
            animating = false;
        };
    }, [isReady]);

    return (
        <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{ width: "100%", height: "100%", display: "block" }}
        />
    );
}
