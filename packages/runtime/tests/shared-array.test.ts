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
        expect(arr.data.length).toBe(8); // 2 * 4 floats (padding)
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

    it('should support direct vector assignment (vec3f)', () => {
        const arr = new SharedArray(vec3f, 2);

        // Assign using TypedArray
        const v1 = new Float32Array([1.0, 2.0, 3.0]);
        arr.set(0, v1);

        expect(arr.data[0]).toBe(1.0);
        expect(arr.data[1]).toBe(2.0);
        expect(arr.data[2]).toBe(3.0);

        // [3] is padding

        // Assign using Array
        arr.set(1, [4.0, 5.0, 6.0]);
        expect(arr.data[4]).toBe(4.0);
        expect(arr.data[5]).toBe(5.0);
        expect(arr.data[6]).toBe(6.0);

        // Assign using vec3f() constructor
        arr.set(0, vec3f(7.0, 8.0, 9.0));
        expect(arr.data[0]).toBe(7.0);
        expect(arr.data[1]).toBe(8.0);
        expect(arr.data[2]).toBe(9.0);
    });

    it('should support vector retrieval', () => {
        const arr = new SharedArray(vec2f, 2);
        arr.data[0] = 10.0;
        arr.data[1] = 20.0;
        arr.data[2] = 30.0;
        arr.data[3] = 40.0;

        const v0 = arr.get(0);
        expect(v0).toBeInstanceOf(Float32Array);
        expect(v0.length).toBe(2);
        expect(v0[0]).toBe(10.0);
        expect(v0[1]).toBe(20.0);

        const v1 = arr.get(1);
        expect(v1[0]).toBe(30.0);
        expect(v1[1]).toBe(40.0);

        // Verify it returns a view (modifying view modifies original)
        v0[0] = 99.0;
        expect(arr.data[0]).toBe(99.0);
    });
});
