import React, { useEffect } from 'react';
import { runtime, SharedArray } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';

interface Params {
    time: f32;
    width: u32;
    height: u32;
}

/** @kernel @workgroup_size(8, 8) */
async function generateImage(image: Float32Array, params: Params) {
    const x = global_invocation_id.x;
    const y = global_invocation_id.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    const idx = (y * params.width + x) * 4;

    // Generate colorful pattern
    const fx = f32(x) / f32(params.width);
    const fy = f32(y) / f32(params.height);

    const uv = vec2(fx, fy);

    image[idx + 0] = 0.5 + 0.5 * sin(uv.x * 10.0 + params.time);
    image[idx + 1] = 0.5 + 0.5 * sin(uv.y * 10.0 + params.time * 1.3);
    image[idx + 2] = 0.5 + 0.5 * sin((uv.x + uv.y) * 5.0 + params.time * 0.7);
    image[idx + 3] = 1.0;
}

export default function ImageDemo() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            const width = 640;
            const height = 480;

            const params = {
                time: 0.0,
                width: u32(width),
                height: u32(height),
            };
            const image = new SharedArray([height, width, 4]); // RGBA

            const startTime = performance.now();

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                params.time = (performance.now() - startTime) / 1000.0;

                // Dispatch kernel
                // 640 / 8 = 80, 480 / 8 = 60
                // @ts-ignore
                await generateImage<[80, 60, 1]>(image, params);

                // Display image
                // @ts-ignore
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
        <div style={{ padding: 20 }}>
            <h2>Image Generation Demo</h2>
            <p>Generating image on GPU with compute shader</p>
            <canvas ref={canvasRef} width={640} height={480} />
        </div>
    );
}
