import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { transformHost } from '../host-transformer';

describe('Host Transformer', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    function transform(code: string) {
        const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
        transformHost(sourceFile);
        return sourceFile.getFullText();
    }

    it('should transform implicit generic call site', () => {
        const code = `
            /** @kernel */
            async function compute(data: Float32Array) {
                const x = global_invocation_id.x;
            }

            async function main() {
                const data = new Float32Array(10);
                await compute<[10, 1, 1]>(data);
            }
        `;

        const result = transform(code);

        // Check if generic type argument is removed and passed as argument
        expect(result).toContain('await compute(data, [10, 1, 1])');

        // Check if function definition is updated to accept optional argument
        // Note: parameter types are relaxed to 'any' to support SharedArray and other runtime types
        expect(result).toContain('async function compute(data: any, workgroup_count?: any)');

        // Check if dispatch call uses workgroup_count
        expect(result).toContain('return runtime.dispatch(compute_wgsl, "compute", [data], workgroup_count);');
    });

    it('should add runtime import if missing', () => {
        const code = `
            /** @kernel */
            function compute() {}
        `;
        const result = transform(code);
        expect(result).toContain('import { runtime } from "@accelscript/runtime";');
    });

    it('should transform vertex shader function', () => {
        const code = `
            /** @vertex */
            function vert() {
                return vec4(0.0, 0.0, 0.0, 1.0);
            }
        `;
        const result = transform(code);
        // Check if it returns an object with code and entryPoint
        expect(result).toContain('return { code:');
        expect(result).toContain('entryPoint: "vert"');
    });

    it('should handle multiple kernel functions', () => {
        const code = `
            /** @kernel */
            function k1() {}
            /** @kernel */
            function k2() {}
        `;
        const result = transform(code);
        expect(result).toContain('let k1_wgsl =');
        expect(result).toContain('let k2_wgsl =');
        expect(result).toContain('runtime.dispatch(k1_wgsl');
        expect(result).toContain('runtime.dispatch(k2_wgsl');
    });

    it('should preserve non-shader functions', () => {
        const code = `
            function normal() {
                return 1 + 1;
            }
        `;
        const result = transform(code);
        expect(result).toContain('function normal() {');
        expect(result).toContain('return 1 + 1;');
        expect(result).not.toContain('runtime.dispatch');
    });
});
