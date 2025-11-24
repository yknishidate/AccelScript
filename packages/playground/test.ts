// Mock definitions for the compiler test
function kernel(target: any, propertyKey: string, descriptor: PropertyDescriptor) { }
const global_id = { x: 0, y: 0, z: 0 };

/** @kernel */
function add(a: Float32Array, b: Float32Array, out: Float32Array) {
    const i = global_id.x;
    out[i] = a[i] + b[i];
}
