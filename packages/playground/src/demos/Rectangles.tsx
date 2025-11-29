import React, { useEffect } from 'react';
import { runtime, SharedArray, vec2f, f32 } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';

/** @kernel */
async function updateRects(centers: SharedArray<vec2f>, velocities: SharedArray<vec2f>) {
    const i = global_invocation_id.x;

    // Update positions
    // @ts-ignore
    let pos = centers[i];
    // @ts-ignore
    let vel = velocities[i];

    pos = pos + vel * 0.01;

    // Bounce off edges
    if (pos.x > 1.0 || pos.x < -1.0) {
        vel.x = -vel.x;
    }
    if (pos.y > 1.0 || pos.y < -1.0) {
        vel.y = -vel.y;
    }

    // @ts-ignore
    centers[i] = pos;
    // @ts-ignore
    velocities[i] = vel;
}

export default function Rectangles() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            // Initialize SharedArrays directly
            const numRects = 50;
            const centers = new SharedArray(vec2f, numRects);
            const velocities = new SharedArray(vec2f, numRects);
            const sizes = new SharedArray(vec2f, numRects);
            const colors = new SharedArray(f32, numRects * 4);

            for (let i = 0; i < numRects; i++) {
                centers.data[i * 2 + 0] = Math.random() * 2 - 1;
                centers.data[i * 2 + 1] = Math.random() * 2 - 1;
                velocities.data[i * 2 + 0] = (Math.random() - 0.5) * 2;
                velocities.data[i * 2 + 1] = (Math.random() - 0.5) * 2;

                // Random width and height
                sizes.data[i * 2 + 0] = Math.random() * 0.1 + 0.05;
                sizes.data[i * 2 + 1] = Math.random() * 0.1 + 0.05;

                colors.data[i * 4 + 0] = Math.random();
                colors.data[i * 4 + 1] = Math.random();
                colors.data[i * 4 + 2] = Math.random();
                colors.data[i * 4 + 3] = 0.8;
            }

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                // @ts-ignore
                await updateRects(centers, velocities);
                // @ts-ignore
                await runtime.clear([0.2, 0.2, 0.2, 1.0]);
                // @ts-ignore
                await runtime.rects(centers, sizes, colors);

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
