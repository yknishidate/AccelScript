import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { generateDeviceFunction } from '../wgsl-generator';

describe('WGSL Generator - Device Function SharedArray', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    function getFunction(code: string) {
        const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
        return sourceFile.getFunctions()[0];
    }

    it('should generate ptr<storage, array<T>, read_write> for SharedArray argument', () => {
        const func = getFunction(`
            /** @device */
            function update(data: SharedArray<f32>, index: u32) {
                data[index] = 1.0;
            }
        `);
        const result = generateDeviceFunction(func);
        expect(result).toContain('fn update(data : ptr<storage, array<f32>, read_write>, index : u32)');
    });
});
