import React, { useEffect } from 'react';
import { runtime, SharedArray, vec2f, f32 } from "@accelscript/runtime";
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
            const colors = new SharedArray(f32, numLines * 4);

            for (let i = 0; i < numLines; i++) {
                begins.data[i * 2 + 0] = Math.random() * 2.0 - 1.0;
                begins.data[i * 2 + 1] = Math.random() * 2.0 - 1.0;
                ends.data[i * 2 + 0] = Math.random() * 2.0 - 1.0;
                ends.data[i * 2 + 1] = Math.random() * 2.0 - 1.0;
                widths.data[i] = 0.05;
                colors.data[i * 4 + 0] = Math.random() * 0.25 + 0.75;
                colors.data[i * 4 + 1] = Math.random() * 0.25 + 0.75;
                colors.data[i * 4 + 2] = Math.random() * 0.25 + 0.75;
                colors.data[i * 4 + 3] = 1.0;
            }

            const startTime = performance.now();

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                const time = (performance.now() - startTime) / 1000;

                for (let i = 0; i < numLines; i++) {
                    // Lissajous-like movement
                    begins.data[i * 2 + 0] = Math.sin(time * 0.5 + i * 0.1) * 0.8;
                    begins.data[i * 2 + 1] = Math.cos(time * 0.3 + i * 0.1) * 0.8;

                    ends.data[i * 2 + 0] = Math.sin(time * 0.7 + i * 0.1 + Math.PI) * 0.8;
                    ends.data[i * 2 + 1] = Math.cos(time * 0.6 + i * 0.1 + Math.PI) * 0.8;

                    // Dynamic colors
                    colors.data[i * 4 + 0] = 0.5 + 0.5 * Math.sin(time + i * 0.2);
                    colors.data[i * 4 + 1] = 0.5 + 0.5 * Math.cos(time * 1.2 + i * 0.3);
                    colors.data[i * 4 + 2] = 0.5 + 0.5 * Math.sin(time * 0.8 + i * 0.4);
                }

                // @ts-ignore
                await runtime.clear(0.2, 0.2, 0.2);
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
        <div style={{ padding: 20 }}>
            <h2>Lines Demo</h2>
            <p>Lines are drawn using the lines kernel</p>
            <canvas ref={canvasRef} width={640} height={480} style={{ border: '1px solid #ccc' }} />
        </div>
    );
}
