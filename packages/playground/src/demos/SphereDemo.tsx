import React, { useEffect, useRef } from 'react';
import { runtime, SharedArray, vec3f, Camera } from '@accelscript/runtime';

export const SphereDemo: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let animationId: number;
        const camera = new Camera();
        camera.attach(canvas);
        camera.distance = 2.0; // Set initial distance

        const init = async () => {
            await runtime.setupCanvas(canvas);

            const numSpheres = 50;
            const centers = new SharedArray(vec3f, numSpheres);
            const radii = new SharedArray(numSpheres); // f32 array
            const colors = new SharedArray(vec3f, numSpheres);
            const velocities = new SharedArray(vec3f, numSpheres);

            // Initialize
            for (let i = 0; i < numSpheres; i++) {
                centers.data.set([
                    (Math.random() * 2 - 1) * 0.8,
                    (Math.random() * 2 - 1) * 0.8,
                    (Math.random() * 2 - 1) * 0.5 // z depth
                ], i * 3);
                radii.data[i] = 0.05 + Math.random() * 0.1;
                colors.data.set([Math.random(), Math.random(), Math.random()], i * 3);
                velocities.data.set([
                    (Math.random() * 2 - 1) * 0.01,
                    (Math.random() * 2 - 1) * 0.01,
                    (Math.random() * 2 - 1) * 0.005
                ], i * 3);
            }

            const render = async () => {
                // Update positions
                for (let i = 0; i < numSpheres; i++) {
                    const c = centers.data.subarray(i * 3, i * 3 + 3);
                    const v = velocities.data.subarray(i * 3, i * 3 + 3);
                    const r = radii.data[i];

                    c[0] += v[0];
                    c[1] += v[1];
                    c[2] += v[2];

                    // Bounce off walls (approximate, box -1 to 1)
                    if (c[0] < -1 + r || c[0] > 1 - r) v[0] *= -1;
                    if (c[1] < -1 + r || c[1] > 1 - r) v[1] *= -1;
                    if (c[2] < -1 + r || c[2] > 1 - r) v[2] *= -1;
                }

                await runtime.clear(0.1, 0.1, 0.1, 1);
                await runtime.spheres(centers, radii, colors, { camera });

                animationId = requestAnimationFrame(render);
            };

            render();
        };

        init();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
            camera.detach();
        };
    }, []);

    return <canvas ref={canvasRef} width={800} height={600} style={{ width: '100%', height: '100%' }} />;
};
