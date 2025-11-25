import { describe, it, expect } from 'vitest';
import { SharedArray } from '../src/shared-array';
import { f32, vec2f, vec3f, vec4f, i32, u32 } from '../src/types';

describe('SharedArray', () => {
    it('should initialize with f32 (default)', () => {
        const arr = new SharedArray(10);
        expect(arr.size).toBe(10);
        expect(arr.data).toBeInstanceOf(Float32Array);
        expect(arr.data.length).toBe(10);
    });

    it('should initialize with explicit f32', () => {
        const arr = new SharedArray(f32, 10);
        expect(arr.size).toBe(10);
        expect(arr.data).toBeInstanceOf(Float32Array);
        expect(arr.data.length).toBe(10);
    });

    it('should initialize with vec2f', () => {
        const arr = new SharedArray(vec2f, 5);
        expect(arr.size).toBe(5); // 5 vectors
        expect(arr.data).toBeInstanceOf(Float32Array);
        expect(arr.data.length).toBe(10); // 5 * 2 floats
    });

    it('should initialize with vec3f', () => {
        const arr = new SharedArray(vec3f, 2);
        expect(arr.size).toBe(2);
        expect(arr.data).toBeInstanceOf(Float32Array);
        expect(arr.data.length).toBe(6); // 2 * 3 floats
    });

    it('should initialize with vec4f', () => {
        const arr = new SharedArray(vec4f, 2);
        expect(arr.size).toBe(2);
        expect(arr.data).toBeInstanceOf(Float32Array);
        expect(arr.data.length).toBe(8); // 2 * 4 floats
    });

    it('should initialize with i32', () => {
        const arr = new SharedArray(i32, 4);
        expect(arr.size).toBe(4);
        expect(arr.data).toBeInstanceOf(Int32Array);
    });

    it('should initialize with u32', () => {
        const arr = new SharedArray(u32, 4);
        expect(arr.size).toBe(4);
        expect(arr.data).toBeInstanceOf(Uint32Array);
    });

    it('should initialize with shape (f32)', () => {
        const arr = new SharedArray(f32, [2, 3]);
        expect(arr.ndim).toBe(2);
        expect(arr.shape).toEqual([2, 3]);
        expect(arr.size).toBe(6);
    });

    it('should initialize with shape (vec2f)', () => {
        // [10, 20] -> shape [10, 20]
        const arr = new SharedArray(vec2f, [10, 20]);
        expect(arr.ndim).toBe(2);
        expect(arr.shape).toEqual([10, 20]);
        expect(arr.size).toBe(200); // 10 * 20 elements
        expect(arr.data.length).toBe(400); // 200 * 2 floats
    });
});
