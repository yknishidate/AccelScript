import { add, sub, mul, normalize, cross } from './math';

export class Camera {
    azimuth = 0;
    elevation = 0.0;
    distance = 5.0;
    center = new Float32Array([0, 0, 0]);

    pos: Float32Array = new Float32Array([0, 0, 0]);
    dir: Float32Array = new Float32Array([0, 0, 0]);
    up: Float32Array = new Float32Array([0, 1, 0]);
    right: Float32Array = new Float32Array([1, 0, 0]);

    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;
    private canvas: HTMLElement | null = null;
    private onChangeCallbacks: (() => void)[] = [];

    constructor() {
        this.update();
    }

    attach(canvas: HTMLElement) {
        this.canvas = canvas;
        canvas.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
    }

    detach() {
        if (!this.canvas) return;
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas = null;
    }

    onChange(callback: () => void) {
        this.onChangeCallbacks.push(callback);
    }

    private handleMouseDown = (e: MouseEvent) => {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    private handleMouseMove = (e: MouseEvent) => {
        if (!this.isDragging) return;
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        this.azimuth -= deltaX * 0.01;
        this.elevation += deltaY * 0.01;
        this.elevation = Math.max(-1.5, Math.min(1.5, this.elevation));

        this.update();
        this.notifyChange();
    }

    private handleMouseUp = () => {
        this.isDragging = false;
    }

    update() {
        // Spherical to Cartesian
        const x = this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
        const y = this.distance * Math.sin(this.elevation);
        const z = this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);

        // Position relative to center
        const offset = new Float32Array([x, y, z]);
        this.pos = add(this.center, offset);

        // Direction (looking at center)
        this.dir = normalize(sub(this.center, this.pos));

        // Right vector
        const worldUp = new Float32Array([0, 1, 0]);
        this.right = normalize(cross(this.dir, worldUp));

        // Up vector
        this.up = cross(this.right, this.dir);
    }

    private notifyChange() {
        for (const cb of this.onChangeCallbacks) {
            cb();
        }
    }
}
