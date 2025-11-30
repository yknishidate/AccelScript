import React, { useEffect } from 'react';
import { runtime, SharedArray, vec2f, vec4f, f32 } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';

/** @kernel */
async function updatePositions(centers: SharedArray<vec2f>, velocities: SharedArray<vec2f>) {
    const i = global_invocation_id.x;

    // Update positions
    let pos = centers[i];
    let vel = velocities[i];

    pos = pos + vel * 0.01;

    // Bounce off edges
    if (pos.x > 1.0 || pos.x < -1.0) {
        vel.x = -vel.x;
    }
    if (pos.y > 1.0 || pos.y < -1.0) {
        vel.y = -vel.y;
    }

    centers[i] = pos;
    velocities[i] = vel;
}

export default function Circles() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            // Initialize SharedArrays directly
            const numCircles = 50;
            const centers = new SharedArray(vec2f, numCircles);
            const velocities = new SharedArray(vec2f, numCircles);
            const radii = new SharedArray(f32, numCircles);
            const colors = new SharedArray(vec4f, numCircles);

            for (let i = 0; i < numCircles; i++) {
                centers.set(i, [Math.random() * 2 - 1, Math.random() * 2 - 1]);
                velocities.set(i, [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2]);
                radii.data[i] = Math.random() * 0.05 + 0.03;
                colors.set(i, [Math.random(), Math.random(), Math.random(), 0.8]);
            }

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                await updatePositions(centers, velocities);
                await runtime.clear([0.2, 0.2, 0.2, 1.0]);
                await runtime.circles(centers, radii, colors);

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
