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
    // ========================================================================
    // Primitive Types
    // ========================================================================
    type u32 = number;
    type i32 = number;
    type f32 = number;

    // ========================================================================
    // Vector & Matrix Types
    // ========================================================================
    // Defined as 'any' to allow arithmetic operations in TypeScript without strict type checking

    // Float vectors
    type vec2f = any;
    type vec3f = any;
    type vec4f = any;
    type vec2 = vec2f; // Alias
    type vec3 = vec3f; // Alias
    type vec4 = vec4f; // Alias

    // Integer vectors
    type vec2i = any;
    type vec3i = any;
    type vec4i = any;

    // Unsigned integer vectors
    type vec2u = any;
    type vec3u = any;
    type vec4u = any;

    // Matrices (float only for now)
    type mat2x2f = any;
    type mat3x3f = any;
    type mat4x4f = any;
    type mat2x2 = mat2x2f; // Alias
    type mat3x3 = mat3x3f; // Alias
    type mat4x4 = mat4x4f; // Alias

    // ========================================================================
    // Shader Built-in Variables
    // ========================================================================
    var global_invocation_id: vec3u;
    var global_id: vec3u;
    var vertex_index: u32;
    var instance_index: u32;

    // ========================================================================
    // Type Constructors
    // ========================================================================
    function u32(v: number): u32;
    function i32(v: number): i32;
    function f32(v: number): f32;

    // Float vectors
    function vec2f(x: number, y: number): vec2f;
    function vec3f(x: number, y: number, z: number): vec3f;
    function vec4f(x: number, y: number, z: number, w: number): vec4f;
    // Aliases
    function vec2(x: number, y: number): vec2f;
    function vec3(x: number, y: number, z: number): vec3f;
    function vec4(x: number, y: number, z: number, w: number): vec4f;

    // Integer vectors
    function vec2i(x: number, y: number): vec2i;
    function vec3i(x: number, y: number, z: number): vec3i;
    function vec4i(x: number, y: number, z: number, w: number): vec4i;

    // Unsigned integer vectors
    function vec2u(x: number, y: number): vec2u;
    function vec3u(x: number, y: number, z: number): vec3u;
    function vec4u(x: number, y: number, z: number, w: number): vec4u;

    // Matrices
    function mat2x2f(...args: number[]): mat2x2f;
    function mat3x3f(...args: number[]): mat3x3f;
    function mat4x4f(...args: number[]): mat4x4f;
    // Aliases
    function mat2x2(...args: number[]): mat2x2f;
    function mat3x3(...args: number[]): mat3x3f;
    function mat4x4(...args: number[]): mat4x4f;

    // ========================================================================
    // Math Functions
    // ========================================================================

    // --- Common ---
    function abs(v: number): number;
    function ceil(v: number): number;
    function clamp(v: number, min: number, max: number): number;
    function floor(v: number): number;
    function fract(v: number): number;
    function max(a: number, b: number): number;
    function min(a: number, b: number): number;
    function mix(v: number, w: number, x: number): number;
    function modf(v: number): { x: number, y: number };
    function round(v: number): number;
    function saturate(v: number): number;
    function sign(v: number): number;
    function smoothstep(v: number, w: number, x: number): number;
    function step(v: number, w: number): number;
    function trunc(v: number): number;

    // --- Trigonometry ---
    function acos(v: number): number;
    function acosh(v: number): number;
    function asin(v: number): number;
    function asinh(v: number): number;
    function atan(v: number): number;
    function atan2(v: number, w: number): number;
    function atanh(v: number): number;
    function cos(v: number): number;
    function cosh(v: number): number;
    function degrees(v: number): number;
    function radians(v: number): number;
    function sin(v: number): number;
    function sinh(v: number): number;
    function tan(v: number): number;
    function tanh(v: number): number;

    // --- Exponential & Logarithmic ---
    function exp(v: number): number;
    function exp2(v: number): number;
    function log(v: number): number;
    function log2(v: number): number;
    function pow(v: number, w: number): number;
    function sqrt(v: number): number;
    function inverseSqrt(v: number): number;

    // --- Geometric ---
    function cross(v: vec3f, w: vec3f): vec3f;
    function distance(v: vec2f | vec3f | vec4f, w: vec2f | vec3f | vec4f): number;
    function dot(v: vec2f | vec3f | vec4f, w: vec2f | vec3f | vec4f): number;
    function faceForward(v: vec3f, w: vec3f, x: vec3f): vec3f;
    // function length(v: vec2f | vec3f | vec4f): number; // Conflicts with Window.length
    function normalize(v: vec2f | vec3f | vec4f): vec2f | vec3f | vec4f;
    function reflect(v: vec3f, w: vec3f): vec3f;
    function refract(v: vec3f, w: vec3f, x: number): vec3f;

    // --- Matrix ---
    function determinant(v: mat2x2f | mat3x3f | mat4x4f): number;
    function transpose(v: mat2x2f | mat3x3f | mat4x4f): mat2x2f | mat3x3f | mat4x4f;

    // --- Bits & Integers ---
    function countLeadingZeros(v: number): number;
    function countOneBits(v: number): number;
    function countTrailingZeros(v: number): number;
    function extractBits(v: number, offset: number, count: number): number;
    function extractBitsU(v: number, offset: number, count: number): number;
    function firstLeadingBit(v: number): number;
    function firstLeadingBitU(v: number): number;
    function firstTrailingBit(v: number): number;
    function insertBits(v: number, offset: number, count: number, x: number): number;
    function insertBitsU(v: number, offset: number, count: number, x: number): number;
    function reverseBits(v: number): number;

    // --- Other ---
    function dot4U8Packed(v: vec2f | vec3f | vec4f, w: vec2f | vec3f | vec4f): number;
    function dot4I8Packed(v: vec2f | vec3f | vec4f, w: vec2f | vec3f | vec4f): number;
    function fma(v: number, w: number, x: number): number;
    function frexp(v: number): { x: number, y: number };
    function ldexp(v: number, w: number): number;
    function quantizeToF16(v: number): number;
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
