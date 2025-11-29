import React, { useEffect } from 'react';
import { runtime, SharedArray, vec2f, vec4f, f32 } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';


export default function Lines() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            const numLines = 50;
            const begins = new SharedArray(vec2f, numLines);
            const ends = new SharedArray(vec2f, numLines);
            const widths = new SharedArray(f32, numLines);
            const colors = new SharedArray(vec4f, numLines);

            for (let i = 0; i < numLines; i++) {
                begins.set(i, [Math.random() * 2.0 - 1.0, Math.random() * 2.0 - 1.0]);
                ends.set(i, [Math.random() * 2.0 - 1.0, Math.random() * 2.0 - 1.0]);
                widths.data[i] = 0.05;
                colors.set(i, [
                    Math.random() * 0.25 + 0.75,
                    Math.random() * 0.25 + 0.75,
                    Math.random() * 0.25 + 0.75,
                    1.0
                ]);
            }

            const startTime = performance.now();

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                const time = (performance.now() - startTime) / 1000;

                for (let i = 0; i < numLines; i++) {
                    // Lissajous-like movement
                    begins.set(i, [
                        Math.sin(time * 0.5 + i * 0.1) * 0.8,
                        Math.cos(time * 0.3 + i * 0.1) * 0.8
                    ]);

                    ends.set(i, [
                        Math.sin(time * 0.7 + i * 0.1 + Math.PI) * 0.8,
                        Math.cos(time * 0.6 + i * 0.1 + Math.PI) * 0.8
                    ]);

                    // Dynamic colors
                    colors.set(i, [
                        0.5 + 0.5 * Math.sin(time + i * 0.2),
                        0.5 + 0.5 * Math.cos(time * 1.2 + i * 0.3),
                        0.5 + 0.5 * Math.sin(time * 0.8 + i * 0.4),
                        1.0
                    ]);
                }

                // @ts-ignore
                await runtime.clear([0.2, 0.2, 0.2, 1.0]);
                // @ts-ignore
                await runtime.lines(begins, ends, widths, colors);

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
