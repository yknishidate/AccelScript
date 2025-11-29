import { useEffect, useRef } from 'react';
import { runtime, SharedArray, vec3f, Camera } from '@accelscript/runtime';

export function PrimitiveDemo() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        let animationId: number;

        const init = async () => {
            await runtime.setupCanvas(canvas);

            const numSpheres = 50;
            const numBoxes = 50;

            // Spheres
            const sphereCenters = new SharedArray(vec3f, numSpheres);
            const sphereSizes = new SharedArray(vec3f, numSpheres);
            const sphereColors = new SharedArray(vec3f, numSpheres);
            const sphereVelocities = new Float32Array(numSpheres * 3);

            // Boxes
            const boxCenters = new SharedArray(vec3f, numBoxes);
            const boxSizes = new SharedArray(vec3f, numBoxes);
            const boxColors = new SharedArray(vec3f, numBoxes);
            const boxVelocities = new Float32Array(numBoxes * 3);

            // Initialize Spheres
            for (let i = 0; i < numSpheres; i++) {
                sphereCenters.data.set([
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10
                ], i * 3);

                const r = 0.2 + Math.random() * 0.3;
                sphereSizes.data.set([r, r, r], i * 3);

                sphereColors.data.set([
                    Math.random(),
                    Math.random(),
                    Math.random()
                ], i * 3);

                sphereVelocities[i * 3] = (Math.random() - 0.5) * 0.1;
                sphereVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
                sphereVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
            }

            // Initialize Boxes
            for (let i = 0; i < numBoxes; i++) {
                boxCenters.data.set([
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10
                ], i * 3);

                boxSizes.data.set([
                    0.2 + Math.random() * 0.3,
                    0.2 + Math.random() * 0.3,
                    0.2 + Math.random() * 0.3
                ], i * 3);

                boxColors.data.set([
                    Math.random(),
                    Math.random(),
                    Math.random()
                ], i * 3);

                boxVelocities[i * 3] = (Math.random() - 0.5) * 0.1;
                boxVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
                boxVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
            }

            const camera = new Camera();
            camera.attach(canvas);

            const render = async () => {
                // Update Spheres
                for (let i = 0; i < numSpheres; i++) {
                    for (let j = 0; j < 3; j++) {
                        let p = sphereCenters.data[i * 3 + j];
                        let v = sphereVelocities[i * 3 + j];
                        p += v;
                        if (p > 5 || p < -5) {
                            v = -v;
                            p += v;
                        }
                        sphereCenters.data[i * 3 + j] = p;
                        sphereVelocities[i * 3 + j] = v;
                    }
                }

                // Update Boxes
                for (let i = 0; i < numBoxes; i++) {
                    for (let j = 0; j < 3; j++) {
                        let p = boxCenters.data[i * 3 + j];
                        let v = boxVelocities[i * 3 + j];
                        p += v;
                        if (p > 5 || p < -5) {
                            v = -v;
                            p += v;
                        }
                        boxCenters.data[i * 3 + j] = p;
                        boxVelocities[i * 3 + j] = v;
                    }
                }

                camera.update();

                runtime.clear(0.1, 0.1, 0.1, 1.0);

                // Draw Spheres (clear depth = true by default)
                await runtime.spheres(sphereCenters, sphereSizes, sphereColors, { camera });

                // Draw Boxes (clear depth = false to composite)
                await runtime.boxes(boxCenters, boxSizes, boxColors, { camera, clearDepth: false });

                animationId = requestAnimationFrame(render);
            };

            render();
        };

        init();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
            // camera.detach(); // Camera instance is local, but listeners might persist if not careful. 
            // The Camera class should have a detach method.
        };
    }, []);

    return <canvas ref={canvasRef} width={800} height={600} className="w-full h-full block" />;
}
