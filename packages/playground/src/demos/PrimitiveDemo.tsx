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
            wallCenters.data.set([0, -5.1, 0], 0);
            wallSizes.data.set([5, 0.1, 5], 0); // Half-extents
            wallColors.data.set([1, 1, 1], 0);

            // 1: Ceiling (White)
            wallCenters.data.set([0, 5.1, 0], 3);
            wallSizes.data.set([5, 0.1, 5], 3);
            wallColors.data.set([1, 1, 1], 3);

            // 2: Back Wall (White)
            wallCenters.data.set([0, 0, -5.1], 6);
            wallSizes.data.set([5, 5, 0.1], 6);
            wallColors.data.set([1, 1, 1], 6);

            // 3: Left Wall (Red)
            wallCenters.data.set([-5.1, 0, 0], 9);
            wallSizes.data.set([0.1, 5, 5], 9);
            wallColors.data.set([1, 0, 0], 9);

            // 4: Right Wall (Green)
            wallCenters.data.set([5.1, 0, 0], 12);
            wallSizes.data.set([0.1, 5, 5], 12);
            wallColors.data.set([0, 1, 0], 12);

            // Objects
            // Tall Box (White-ish) - Rotated in real Cornell box, but axis aligned here
            const boxCenters = new SharedArray(vec3f, 2);
            const boxSizes = new SharedArray(vec3f, 2);
            const boxColors = new SharedArray(vec3f, 2);

            // Tall Box
            boxCenters.data.set([-2, -2, -2], 0);
            boxSizes.data.set([1.5, 3, 1.5], 0);
            boxColors.data.set([0.9, 0.9, 0.9], 0);

            // Short Box
            boxCenters.data.set([2, -3.5, 2], 3);
            boxSizes.data.set([1.5, 1.5, 1.5], 3);
            boxColors.data.set([0.9, 0.9, 0.9], 3);

            // Sphere
            const sphereCenters = new SharedArray(vec3f, 1);
            const sphereSizes = new SharedArray(vec3f, 1);
            const sphereColors = new SharedArray(vec3f, 1);

            sphereCenters.data.set([0, -3.5, 0], 0);
            sphereSizes.data.set([1.5, 1.5, 1.5], 0); // Radius 1.5
            sphereColors.data.set([1, 1, 1], 0); // White sphere (glass/mirror in real one usually)

            // Light (Box on ceiling)
            const lightCenter = new SharedArray(vec3f, 1);
            const lightSize = new SharedArray(vec3f, 1);
            const lightColor = new SharedArray(vec3f, 1);

            lightCenter.data.set([0, 4.9, 0], 0);
            lightSize.data.set([1, 0.1, 1], 0);
            lightColor.data.set([1, 1, 1], 0);

            const camera = new Camera();
            camera.distance = 18;
            camera.elevation = 0;
            camera.azimuth = 0;
            camera.center = [0, 0, 0];
            camera.update();
            camera.attach(canvas);

            const render = async () => {
                if (!isMounted) return;
                camera.update();

                runtime.clear(0.5, 0.5, 0.5, 1.0);

                // Draw Walls
                await runtime.boxes(wallCenters, wallSizes, wallColors, { camera });

                // Draw Objects
                await runtime.boxes(boxCenters, boxSizes, boxColors, { camera, clearDepth: false });
                await runtime.spheres(sphereCenters, sphereSizes, sphereColors, { camera, clearDepth: false });

                // Draw Light
                await runtime.boxes(lightCenter, lightSize, lightColor, { camera, clearDepth: false });

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
