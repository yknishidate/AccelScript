import { useEffect, useRef } from 'react';
import { runtime, SharedArray, vec3f, Camera } from '@accelscript/runtime';

export function PrimitiveDemo() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        let animationId: number;
        let isMounted = true;

        const init = async () => {
            await runtime.setupCanvas(canvas);
            if (!isMounted) return;

            // Cornell Box Geometry
            // Room size: 10x10x10 (-5 to 5)

            // Walls (Boxes flattened)
            const wallCenters = new SharedArray(vec3f, 5);
            const wallSizes = new SharedArray(vec3f, 5);
            const wallColors = new SharedArray(vec3f, 5);

            // 0: Floor (White)
            wallCenters.set(0, [0, -5.1, 0]);
            wallSizes.set(0, [5, 0.1, 5]); // Half-extents
            wallColors.set(0, [1, 1, 1]);

            // 1: Ceiling (White)
            wallCenters.set(1, [0, 5.1, 0]);
            wallSizes.set(1, [5, 0.1, 5]);
            wallColors.set(1, [1, 1, 1]);

            // 2: Back Wall (White)
            wallCenters.set(2, [0, 0, -5.1]);
            wallSizes.set(2, [5, 5, 0.1]);
            wallColors.set(2, [1, 1, 1]);

            // 3: Left Wall (Red)
            wallCenters.set(3, [-5.1, 0, 0]);
            wallSizes.set(3, [0.1, 5, 5]);
            wallColors.set(3, [1, 0, 0]);

            // 4: Right Wall (Green)
            wallCenters.set(4, [5.1, 0, 0]);
            wallSizes.set(4, [0.1, 5, 5]);
            wallColors.set(4, [0, 1, 0]);

            // Objects
            // Tall Box (White-ish) - Rotated in real Cornell box, but axis aligned here
            const boxCenters = new SharedArray(vec3f, 2);
            const boxSizes = new SharedArray(vec3f, 2);
            const boxColors = new SharedArray(vec3f, 2);

            // Tall Box
            boxCenters.set(0, [-2, -2, -2]);
            boxSizes.set(0, [1.5, 3, 1.5]);
            boxColors.set(0, [0.9, 0.9, 0.9]);

            // Short Box
            boxCenters.set(1, [2, -3.5, 2]);
            boxSizes.set(1, [1.5, 1.5, 1.5]);
            boxColors.set(1, [0.9, 0.9, 0.9]);

            // Sphere
            const sphereCenters = new SharedArray(vec3f, 1);
            const sphereSizes = new SharedArray(vec3f, 1);
            const sphereColors = new SharedArray(vec3f, 1);

            sphereCenters.set(0, [0, -3.5, 0]);
            sphereSizes.set(0, [1.5, 1.5, 1.5]); // Radius 1.5
            sphereColors.set(0, [1, 1, 1]); // White sphere (glass/mirror in real one usually)

            // Light (Box on ceiling)
            const lightCenter = new SharedArray(vec3f, 1);
            const lightSize = new SharedArray(vec3f, 1);
            const lightColor = new SharedArray(vec3f, 1);

            lightCenter.set(0, [0, 4.9, 0]);
            lightSize.set(0, [1, 0.1, 1]);
            lightColor.set(0, [1, 1, 1]);

            const camera = new Camera();
            camera.distance = 18;
            camera.elevation = 0;
            camera.azimuth = 0;
            camera.center = new Float32Array([0, 0, 0]);
            camera.update();
            camera.attach(canvas);

            const render = async () => {
                if (!isMounted) return;
                camera.update();

                runtime.clear([0.5, 0.5, 0.5, 1.0], 1.0);

                // Draw Walls
                await runtime.boxes(wallCenters, wallSizes, wallColors, { camera });

                // Draw Objects
                await runtime.boxes(boxCenters, boxSizes, boxColors, { camera });
                await runtime.spheres(sphereCenters, sphereSizes, sphereColors, { camera });

                // Draw Light
                await runtime.boxes(lightCenter, lightSize, lightColor, { camera });

                // Draw Gizmo
                await runtime.drawGizmo(camera);

                animationId = requestAnimationFrame(render);
            };

            render();
        };

        init();

        return () => {
            isMounted = false;
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, []);

    return <canvas ref={canvasRef} width={800} height={600} style={{ width: '100%', height: '100%' }} />;
}
