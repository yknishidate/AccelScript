/// <reference types="@webgpu/types" />

export type TypedArray = Float32Array | Int32Array | Uint32Array | Int16Array | Uint16Array | Int8Array | Uint8Array;

export type TypedArrayConstructor<T extends TypedArray> =
    T extends Float32Array ? Float32ArrayConstructor :
    T extends Int32Array ? Int32ArrayConstructor :
    T extends Uint32Array ? Uint32ArrayConstructor :
    T extends Int16Array ? Int16ArrayConstructor :
    T extends Uint16Array ? Uint16ArrayConstructor :
    T extends Int8Array ? Int8ArrayConstructor :
    T extends Uint8Array ? Uint8ArrayConstructor :
    never;

declare global {
    type u32 = number;
    type i32 = number;
    type f32 = number;

    // Vector/Matrix types as any to allow arithmetic in TS
    type vec2 = any;
    type vec3 = any;
    type vec4 = any;
    type mat2x2 = any;
    type mat3x3 = any;
    type mat4x4 = any;

    var global_invocation_id: { x: number, y: number, z: number };
    var global_id: { x: number, y: number, z: number };
    var vertex_index: number;
    var instance_index: number;
    function u32(v: number): number;
    function i32(v: number): number;
    function f32(v: number): number;

    function vec2(x: number, y: number): vec2;
    function vec3(x: number, y: number, z: number): vec3;
    function vec4(x: number, y: number, z: number, w: number): vec4;

    function mat2x2(...args: number[]): mat2x2;
    function mat3x3(...args: number[]): mat3x3;
    function mat4x4(...args: number[]): mat4x4;

    function sin(v: number): number;
    function cos(v: number): number;
    function sqrt(v: number): number;
}

export interface ScalarWrapper {
    type: 'u32' | 'i32' | 'f32';
    value: number;
}

export const u32 = (v: number): any => ({ type: 'u32', value: v });
export const i32 = (v: number): any => ({ type: 'i32', value: v });
export const f32 = (v: number): any => ({ type: 'f32', value: v });

// Expose to global scope for user convenience
(globalThis as any).u32 = u32;
(globalThis as any).i32 = i32;
(globalThis as any).f32 = f32;
