import { mat4x4f } from './types';

export function lookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Float32Array {
    const z0 = eye[0] - center[0];
    const z1 = eye[1] - center[1];
    const z2 = eye[2] - center[2];
    let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    const zx = z0 * len;
    const zy = z1 * len;
    const zz = z2 * len;

    const x0 = up[1] * zz - up[2] * zy;
    const x1 = up[2] * zx - up[0] * zz;
    const x2 = up[0] * zy - up[1] * zx;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        // degenerate
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    len = 1 / len;
    const xx = x0 * len;
    const xy = x1 * len;
    const xz = x2 * len;

    const y0 = zy * xz - zz * xy;
    const y1 = zz * xx - zx * xz;
    const y2 = zx * xy - zy * xx;
    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        // degenerate
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    len = 1 / len;
    const yx = y0 * len;
    const yy = y1 * len;
    const yz = y2 * len;

    return new Float32Array([
        xx, xy, xz, 0,
        yx, yy, yz, 0,
        zx, zy, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
        1
    ]);
}

export function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, (2 * far * near) * nf, 0
    ]);
}
