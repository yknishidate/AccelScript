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

    // Numeric Built-in Functions
    // 17.5.1abs
    // 17.5.2acos
    // 17.5.3acosh
    // 17.5.4asin
    // 17.5.5asinh
    // 17.5.6atan
    // 17.5.7atanh
    // 17.5.8atan2
    // 17.5.9ceil
    // 17.5.10clamp
    // 17.5.11cos
    // 17.5.12cosh
    // 17.5.13countLeadingZeros
    // 17.5.14countOneBits
    // 17.5.15countTrailingZeros
    // 17.5.16cross
    // 17.5.17degrees
    // 17.5.18determinant
    // 17.5.19distance
    // 17.5.20dot
    // 17.5.21dot4U8Packed
    // 17.5.22dot4I8Packed
    // 17.5.23exp
    // 17.5.24exp2
    // 17.5.25extractBits (signed)
    // 17.5.26extractBits (unsigned)
    // 17.5.27faceForward
    // 17.5.28firstLeadingBit (signed)
    // 17.5.29firstLeadingBit (unsigned)
    // 17.5.30firstTrailingBit
    // 17.5.31floor
    // 17.5.32fma
    // 17.5.33fract
    // 17.5.34frexp
    // 17.5.35insertBits
    // 17.5.36inverseSqrt
    // 17.5.37ldexp
    // 17.5.38length
    // 17.5.39log
    // 17.5.40log2
    // 17.5.41max
    // 17.5.42min
    // 17.5.43mix
    // 17.5.44modf
    // 17.5.45normalize
    // 17.5.46pow
    // 17.5.47quantizeToF16
    // 17.5.48radians
    // 17.5.49reflect
    // 17.5.50refract
    // 17.5.51reverseBits
    // 17.5.52round
    // 17.5.53saturate
    // 17.5.54sign
    // 17.5.55sin
    // 17.5.56sinh
    // 17.5.57smoothstep
    // 17.5.58sqrt
    // 17.5.59step
    // 17.5.60tan
    // 17.5.61tanh
    // 17.5.62transpose
    // 17.5.63trunc

    function abs(v: number): number;
    function acos(v: number): number;
    function acosh(v: number): number;
    function asin(v: number): number;
    function asinh(v: number): number;
    function atan(v: number): number;
    function atan2(v: number, w: number): number;
    function atanh(v: number): number;
    function ceil(v: number): number;
    function clamp(v: number, min: number, max: number): number;
    function cos(v: number): number;
    function cosh(v: number): number;
    function countLeadingZeros(v: number): number;
    function countOneBits(v: number): number;
    function countTrailingZeros(v: number): number;
    function cross(v: vec3, w: vec3): vec3;
    function degrees(v: number): number;
    function determinant(v: mat2x2 | mat3x3 | mat4x4): number;
    function distance(v: vec2 | vec3 | vec4, w: vec2 | vec3 | vec4): number;
    function dot(v: vec2 | vec3 | vec4, w: vec2 | vec3 | vec4): number;
    function dot4U8Packed(v: vec2 | vec3 | vec4, w: vec2 | vec3 | vec4): number;
    function dot4I8Packed(v: vec2 | vec3 | vec4, w: vec2 | vec3 | vec4): number;
    function exp(v: number): number;
    function exp2(v: number): number;
    function extractBits(v: number, offset: number, count: number): number;
    function extractBitsU(v: number, offset: number, count: number): number;
    function faceForward(v: vec3, w: vec3, x: vec3): vec3;
    function firstLeadingBit(v: number): number;
    function firstLeadingBitU(v: number): number;
    function firstTrailingBit(v: number): number;
    function floor(v: number): number;
    function fma(v: number, w: number, x: number): number;
    function fract(v: number): number;
    function frexp(v: number): { x: number, y: number };
    function insertBits(v: number, offset: number, count: number, x: number): number;
    function insertBitsU(v: number, offset: number, count: number, x: number): number;
    function inverseSqrt(v: number): number;
    function ldexp(v: number, w: number): number;
    // function length(v: vec2 | vec3 | vec4): number;
    function log(v: number): number;
    function log2(v: number): number;
    function max(a: number, b: number): number;
    function min(a: number, b: number): number;
    function mix(v: number, w: number, x: number): number;
    function modf(v: number): { x: number, y: number };
    function normalize(v: vec2 | vec3 | vec4): vec2 | vec3 | vec4;
    function pow(v: number, w: number): number;
    function quantizeToF16(v: number): number;
    function radians(v: number): number;
    function reflect(v: vec3, w: vec3): vec3;
    function refract(v: vec3, w: vec3, x: number): vec3;
    function reverseBits(v: number): number;
    function round(v: number): number;
    function saturate(v: number): number;
    function sign(v: number): number;
    function sin(v: number): number;
    function sinh(v: number): number;
    function smoothstep(v: number, w: number, x: number): number;
    function sqrt(v: number): number;
    function step(v: number, w: number): number;
    function tan(v: number): number;
    function tanh(v: number): number;
    function transpose(v: mat2x2 | mat3x3 | mat4x4): mat2x2 | mat3x3 | mat4x4;
    function trunc(v: number): number;
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
