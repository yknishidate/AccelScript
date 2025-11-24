import { useRef, useEffect, useState } from 'react';
import { runtime } from "@accelscript/runtime";

export function useCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const init = async () => {
            if (canvasRef.current) {
                await runtime.setupCanvas(canvasRef.current);
                setIsReady(true);
            }
        };
        init();
    }, []);

    return { canvasRef, isReady };
}
