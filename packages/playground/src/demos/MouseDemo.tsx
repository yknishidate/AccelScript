import { useEffect, useRef } from "react";
import { Runtime, vec2f } from "@accelscript/runtime";

declare var mouse: vec2f;
declare var mouseDown: boolean;
declare var mouseClick: boolean;

export default function MouseDemo() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const runtime = new Runtime();

        let animationId: number;
        let hue = 0;
        let isMounted = true;

        const init = async () => {
            await runtime.setupCanvas(canvas);
            if (!isMounted) return;

            // Clear initially
            await runtime.clear(0.1, 0.1, 0.1, 1);

            const loop = () => {
                if (!isMounted) return;

                // If clicked, clear canvas
                if (mouseClick) {
                    runtime.clear(0.1, 0.1, 0.1, 1);
                }

                // If mouse down, draw
                if (mouseDown) {
                    const aspect = canvas.width / canvas.height;

                    // Rainbow color
                    hue = (hue + 1) % 360;
                    const s = 1, l = 0.5;
                    const c = (1 - Math.abs(2 * l - 1)) * s;
                    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
                    const m = l - c / 2;
                    let r = 0, g = 0, b = 0;

                    if (0 <= hue && hue < 60) { r = c; g = x; b = 0; }
                    else if (60 <= hue && hue < 120) { r = x; g = c; b = 0; }
                    else if (120 <= hue && hue < 180) { r = 0; g = c; b = x; }
                    else if (180 <= hue && hue < 240) { r = 0; g = x; b = c; }
                    else if (240 <= hue && hue < 300) { r = x; g = 0; b = c; }
                    else if (300 <= hue && hue < 360) { r = c; g = 0; b = x; }

                    const color: [number, number, number, number] = [r + m, g + m, b + m, 1.0];

                    runtime.circle([mouse[0], mouse[1]], 0.05, color, { aspect });
                }

                animationId = requestAnimationFrame(loop);
            };
            loop();
        };

        init();

        return () => {
            isMounted = false;
            cancelAnimationFrame(animationId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{ width: "100%", height: "100%", display: "block" }}
        />
    );
}
