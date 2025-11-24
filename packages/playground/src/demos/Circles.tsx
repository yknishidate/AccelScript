import React, { useEffect } from 'react';
import { runtime, SharedArray } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';



/** @kernel */
async function updatePositions(centers: Float32Array, velocities: Float32Array) {
    const i = global_invocation_id.x;
    const idx = i * 2;

    // Update positions
    let pos = vec2(centers[idx + 0], centers[idx + 1]);
    let vel = vec2(velocities[idx + 0], velocities[idx + 1]);

    pos = (pos + vel * 0.01) as any;

    // Bounce off edges
    if (pos.x > 1.0 || pos.x < -1.0) {
        vel.x = -vel.x;
    }
    if (pos.y > 1.0 || pos.y < -1.0) {
        vel.y = -vel.y;
    }

    centers[idx + 0] = pos.x;
    centers[idx + 1] = pos.y;
    velocities[idx + 0] = vel.x;
    velocities[idx + 1] = vel.y;
}

export default function Circles() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            // Initialize SharedArrays directly
            const numCircles = 50;
            const centers = new SharedArray(numCircles * 2);
            const velocities = new SharedArray(numCircles * 2);
            const radii = new Float32Array(numCircles);
            const colors = new Float32Array(numCircles * 4);

            for (let i = 0; i < numCircles; i++) {
                centers.data[i * 2 + 0] = Math.random() * 2 - 1;
                centers.data[i * 2 + 1] = Math.random() * 2 - 1;
                velocities.data[i * 2 + 0] = (Math.random() - 0.5) * 2;
                velocities.data[i * 2 + 1] = (Math.random() - 0.5) * 2;
                radii[i] = Math.random() * 0.05 + 0.03;
                colors[i * 4 + 0] = Math.random();
                colors[i * 4 + 1] = Math.random();
                colors[i * 4 + 2] = Math.random();
                colors[i * 4 + 3] = 0.8;
            }

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                // @ts-ignore
                await updatePositions(centers, velocities);
                // @ts-ignore
                await runtime.circles(centers.data, radii, colors);

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
            <h2>Animated Circles</h2>
            <p>Using SharedArray for efficient GPU/CPU buffer reuse</p>
            <canvas ref={canvasRef} width={640} height={480} style={{ border: '1px solid #ccc' }} />
        </div>
    );
}
