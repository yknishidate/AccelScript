import React, { useEffect } from 'react';
import { runtime, SharedArray } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';


export default function Circles() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            const numLines = 50;
            const begins = new SharedArray(numLines * 2);
            const ends = new SharedArray(numLines * 2);
            const widths = new Float32Array(numLines);
            const colors = new Float32Array(numLines * 4);

            for (let i = 0; i < numLines; i++) {
                begins.data[i * 2 + 0] = Math.random() * 2.0 - 1.0;
                begins.data[i * 2 + 1] = Math.random() * 2.0 - 1.0;
                ends.data[i * 2 + 0] = Math.random() * 2.0 - 1.0;
                ends.data[i * 2 + 1] = Math.random() * 2.0 - 1.0;
                widths[i] = 0.05;
                colors[i * 4 + 0] = Math.random() * 0.25 + 0.75;
                colors[i * 4 + 1] = Math.random() * 0.25 + 0.75;
                colors[i * 4 + 2] = Math.random() * 0.25 + 0.75;
                colors[i * 4 + 3] = 1.0;
            }

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                // @ts-ignore
                await runtime.lines(begins.data, ends.data, widths, colors);
                // await runtime.line([0.0, 0.0], [1.0, 1.0], 0.05, [1.0, 0.0, 0.0, 1.0]);

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
