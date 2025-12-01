import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { transformHost } from '../host-transformer';

describe('Host Transformer - Device Function Removal', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    function transform(code: string) {
        const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
        transformHost(sourceFile);
        return sourceFile.getFullText();
    }

    it('should remove device function from JS but keep struct in WGSL', () => {
        const code = `
            interface Particle {
                pos: vec2f;
                vel: vec2f;
            }

            /** @device */
            function update(p: Particle): Particle {
                return p;
            }

            /** @kernel */
            function compute() {
                let p: Particle;
                update(p);
            }
        `;

        const result = transform(code);

        // 1. Check if device function is REMOVED from JS output
        expect(result).not.toContain('function update(p: Particle): Particle');

        // 2. Check if struct definition is PRESENT in WGSL
        const wgslVarMatch = result.match(/let compute_wgsl = (.*);/);
        expect(wgslVarMatch).toBeTruthy();
        const unescapedWgsl = JSON.parse(wgslVarMatch![1]);

        expect(unescapedWgsl).toContain('struct Particle {');
        expect(unescapedWgsl).toContain('pos : vec2<f32>,');
        expect(unescapedWgsl).toContain('vel : vec2<f32>');
    });
});
