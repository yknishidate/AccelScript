import { useRef, useCallback } from 'react';

export function useFps() {
    const fpsRef = useRef<HTMLDivElement>(null);
    const lastFpsTimeRef = useRef(performance.now());
    const frameCountRef = useRef(0);

    const trackFrame = useCallback(() => {
        const now = performance.now();
        frameCountRef.current++;
        if (now - lastFpsTimeRef.current >= 1000) {
            const fps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
            if (fpsRef.current) {
                fpsRef.current.innerText = `FPS: ${fps}`;
            }
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
        }
    }, []);

    const style: React.CSSProperties = {
        position: 'absolute',
        top: '10px',
        left: '10px',
        color: 'white',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: '5px 10px',
        borderRadius: '4px',
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: '14px',
        zIndex: 10
    };

    return { fpsRef, trackFrame, style };
}
