export class Camera {
    azimuth = -1.57;
    elevation = 0.0;
    distance = 5.0;
    center = [0, 0, 0];

    pos = new Float32Array([0, 0, 0, 0]);
    dir = new Float32Array([0, 0, 0, 0]);

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

    private update() {
        const camX = this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);
        const camY = this.distance * Math.sin(this.elevation);
        const camZ = this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);

        this.pos[0] = camX + this.center[0];
        this.pos[1] = camY + this.center[1];
        this.pos[2] = camZ + this.center[2];

        this.dir[0] = -camX;
        this.dir[1] = -camY;
        this.dir[2] = -camZ;
    }

    private notifyChange() {
        for (const cb of this.onChangeCallbacks) {
            cb();
        }
    }
}
