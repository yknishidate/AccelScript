import { describe, it, expect } from 'vitest';
import { SharedArray } from '../src/shared-array';
import { vec3f, vec2f, f32 } from '../src/types';

describe('SharedArray Alignment', () => {
    it('should respect stride for vec3f (stride 4)', () => {
        const count = 2;
        const arr = new SharedArray(vec3f, count);

        // Check buffer size: 2 elements * 4 floats/element * 4 bytes/float = 32 bytes
        expect(arr.data.byteLength).toBe(32);
        expect(arr.data.length).toBe(8); // 2 * 4

        // Set values
        arr.set(0, [1, 2, 3]);
        arr.set(1, [4, 5, 6]);

        // Check raw data layout
        // Index 0: [1, 2, 3, ?]
        expect(arr.data[0]).toBe(1);
        expect(arr.data[1]).toBe(2);
        expect(arr.data[2]).toBe(3);
        // Index 4: [4, 5, 6, ?] (stride 4)
        expect(arr.data[4]).toBe(4);
        expect(arr.data[5]).toBe(5);
        expect(arr.data[6]).toBe(6);

        // Check get()
        const v0 = arr.get(0);
        expect(v0.length).toBe(3);
        expect(v0[0]).toBe(1);
        expect(v0[1]).toBe(2);
        expect(v0[2]).toBe(3);

        const v1 = arr.get(1);
        expect(v1.length).toBe(3);
        expect(v1[0]).toBe(4);
        expect(v1[1]).toBe(5);
        expect(v1[2]).toBe(6);
    });

    it('should respect packed layout for vec2f (stride 2)', () => {
        const count = 2;
        const arr = new SharedArray(vec2f, count);

        // Check buffer size: 2 elements * 2 floats/element * 4 bytes/float = 16 bytes
        expect(arr.data.byteLength).toBe(16);
        expect(arr.data.length).toBe(4); // 2 * 2

        // Set values
        arr.set(0, [1, 2]);
        arr.set(1, [3, 4]);

        // Check raw data layout (packed)
        expect(arr.data[0]).toBe(1);
        expect(arr.data[1]).toBe(2);
        expect(arr.data[2]).toBe(3);
        expect(arr.data[3]).toBe(4);
    });

    it('should respect packed layout for f32 (stride 1)', () => {
        const count = 3;
        const arr = new SharedArray(f32, count);

        expect(arr.data.length).toBe(3);

        arr.set(0, [10]);
        arr.set(1, [20]);
        arr.set(2, [30]);

        expect(arr.data[0]).toBe(10);
        expect(arr.data[1]).toBe(20);
        expect(arr.data[2]).toBe(30);
    });
});
