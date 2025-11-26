import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { generateWGSL, generateDeviceFunction } from '../wgsl-generator';

describe('WGSL Generator', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    function getFunction(code: string) {
        const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
        return sourceFile.getFunctions()[0];
    }

    it('should generate basic arithmetic', () => {
        const func = getFunction(`
            /** @kernel */
            function add(a: number, b: number) {
                return a + b;
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('return a + b;');
    });

    it('should handle if statements', () => {
        const func = getFunction(`
            /** @kernel */
            function test(x: number) {
                if (x > 0) {
                    return 1.0;
                } else {
                    return 0.0;
                }
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('if (x > 0) {');
        expect(wgsl).toContain('return 1.0;');
        expect(wgsl).toContain('} else {');
        expect(wgsl).toContain('return 0.0;');
    });

    it('should handle prefix unary expressions', () => {
        const func = getFunction(`
            /** @kernel */
            function neg(x: number) {
                return -x;
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('return -x;');
    });

    it('should handle built-in functions', () => {
        const func = getFunction(`
            /** @kernel */
            function dist(x: number, y: number) {
                return sqrt(x*x + y*y);
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('sqrt(x * x + y * y)');
    });

    it('should generate vertex shader signature', () => {
        const func = getFunction(`
            /** @vertex */
            function vert() {
                return vec4(0.0, 0.0, 0.0, 1.0);
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('@vertex');
        expect(wgsl).toContain('@builtin(vertex_index) vertex_index : u32');
        expect(wgsl).toContain('-> @builtin(position) vec4<f32>');
    });

    it('should generate fragment shader signature', () => {
        const func = getFunction(`
            /** @fragment */
            function frag() {
                return vec4(1.0, 0.0, 0.0, 1.0);
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('@fragment');
        expect(wgsl).toContain('@builtin(position) pos : vec4<f32>');
        expect(wgsl).toContain('-> @location(0) vec4<f32>');
    });
    it('should handle custom workgroup_size', () => {
        const func = getFunction(`
            /** 
             * @kernel 
             * @workgroup_size 8, 8, 1
             */
            function compute() {
                return;
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('@compute @workgroup_size(8, 8, 1)');
    });

    it('should handle custom workgroup_size with parentheses', () => {
        const func = getFunction(`
            /** 
             * @kernel 
             * @workgroup_size(16, 16)
             */
            function compute() {
                return;
            }
        `);
        const wgsl = generateWGSL(func);
        expect(wgsl).toContain('@compute @workgroup_size(16, 16)');
    });
    it('should generate scalar bindings as uniform', () => {
        const func = getFunction(`
            /** @kernel */
            function compute(a: SharedArray<f32>, width: u32, height: i32, factor: f32) {
                const x = global_invocation_id.x;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('@group(0) @binding(0) var<storage, read_write> a : array<f32>;');
        expect(result).toContain('@group(0) @binding(1) var<uniform> width : u32;');
        expect(result).toContain('@group(0) @binding(2) var<uniform> height : i32;');
        expect(result).toContain('@group(0) @binding(3) var<uniform> factor : f32;');
    });

    it('should generate struct definitions and bindings', () => {
        const func = getFunction(`
            interface Params {
                width: u32;
                height: u32;
                time: f32;
            }
            
            /** @kernel */
            function compute(image: SharedArray<f32>, params: Params) {
                const x = global_invocation_id.x;
            }
        `);
        const result = generateWGSL(func);

        // Check struct definition
        expect(result).toContain('struct Params {');
        expect(result).toContain('width : u32');
        expect(result).toContain('height : u32');
        expect(result).toContain('time : f32');

        // Check bindings
        expect(result).toContain('@group(0) @binding(0) var<storage, read_write> image : array<f32>;');
        expect(result).toContain('@group(0) @binding(1) var<uniform> params : Params;');
    });

    it('should handle vec2 and vec3 types', () => {
        const func = getFunction(`
            /** @kernel */
            function compute(a: SharedArray<f32>, v2: vec2, v3: vec3) {
                const x = global_invocation_id.x;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('@group(0) @binding(1) var<uniform> v2 : vec2<f32>;');
        expect(result).toContain('@group(0) @binding(2) var<uniform> v3 : vec3<f32>;');
    });

    it('should handle Int32Array and Uint32Array', () => {
        const func = getFunction(`
            /** @kernel */
            function compute(ints: SharedArray<i32>, uints: SharedArray<u32>) {
                const x = global_invocation_id.x;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('@group(0) @binding(0) var<storage, read_write> ints : array<i32>;');
        expect(result).toContain('@group(0) @binding(1) var<storage, read_write> uints : array<u32>;');
    });

    it('should handle empty function body', () => {
        const func = getFunction(`
            /** @kernel */
            function empty() {
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('@compute @workgroup_size(64)');
        expect(result).toContain('fn empty');
    });

    it('should throw error for function without shader annotation', () => {
        const func = getFunction(`
            function notShader() {
                return 42;
            }
        `);
        expect(() => generateWGSL(func)).toThrow('must have @kernel, @vertex, or @fragment annotation');
    });

    it('should handle multiple variable declarations', () => {
        const func = getFunction(`
            /** @kernel */
            function compute() {
                const a = 1.0;
                const b = 2.0;
                const c = a + b;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('let a = 1.0;');
        expect(result).toContain('let b = 2.0;');
        expect(result).toContain('let c = a + b;');
    });

    it('should handle matrix types', () => {
        const func = getFunction(`
            /** @kernel */
            function compute(m2: mat2x2, m3: mat3x3, m4: mat4x4) {
                const x = global_invocation_id.x;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('@group(0) @binding(0) var<uniform> m2 : mat2x2<f32>;');
        expect(result).toContain('@group(0) @binding(1) var<uniform> m3 : mat3x3<f32>;');
        expect(result).toContain('@group(0) @binding(2) var<uniform> m4 : mat4x4<f32>;');
    });

    it('should handle matrix multiplication', () => {
        const func = getFunction(`
            /** @kernel */
            function transform(pos: vec2, m: mat2x2) {
                return m * pos;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('return m * pos;');
    });

    it('should handle for loops', () => {
        const func = getFunction(`
            /** @kernel */
            function loopTest() {
                let sum = 0;
                for (let i = 0; i < 10; i++) {
                    sum = sum + i;
                }
                return sum;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('var sum = 0;');
        expect(result).toContain('for (var i = 0; i < 10; i++) {');
        expect(result).toContain('sum = sum + i;');
        expect(result).toContain('}');
    });

    it('should handle swizzling', () => {
        const func = getFunction(`
            /** @kernel */
            function swizzle(v: vec4) {
                return vec2(v.x, v.y);
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('return vec2(v.x, v.y);');
    });

    // Switch statement tests
    it('should handle basic switch statement', () => {
        const func = getFunction(`
            /** @kernel */
            function testSwitch(value: u32) {
                let result = 0;
                switch (value) {
                    case 0: {
                        result = 10;
                    }
                    case 1: {
                        result = 20;
                    }
                    case 2: {
                        result = 30;
                    }
                }
                return result;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('switch (value) {');
        expect(result).toContain('case 0: {');
        expect(result).toContain('result = 10;');
        expect(result).toContain('case 1: {');
        expect(result).toContain('result = 20;');
        expect(result).toContain('case 2: {');
        expect(result).toContain('result = 30;');
    });

    it('should handle switch with default case', () => {
        const func = getFunction(`
            /** @kernel */
            function testSwitchDefault(value: i32) {
                let result = 0;
                switch (value) {
                    case 0: {
                        result = 1;
                    }
                    case 1: {
                        result = 2;
                    }
                    default: {
                        result = 99;
                    }
                }
                return result;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('switch (value) {');
        expect(result).toContain('case 0: {');
        expect(result).toContain('case 1: {');
        expect(result).toContain('default: {');
        expect(result).toContain('result = 99;');
    });

    it('should handle switch with break statements', () => {
        const func = getFunction(`
            /** @kernel */
            function testSwitchBreak(value: u32) {
                let result = 0;
                switch (value) {
                    case 0: {
                        result = 1;
                        break;
                    }
                    case 1: {
                        result = 2;
                        break;
                    }
                }
                return result;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('switch (value) {');
        expect(result).toContain('case 0: {');
        expect(result).toContain('result = 1;');
        expect(result).toContain('break;');
        expect(result).toContain('case 1: {');
    });

    it('should handle nested switch statements', () => {
        const func = getFunction(`
            /** @kernel */
            function testNestedSwitch(a: u32, b: u32) {
                let result = 0;
                switch (a) {
                    case 0: {
                        switch (b) {
                            case 0: {
                                result = 1;
                            }
                            case 1: {
                                result = 2;
                            }
                        }
                    }
                    case 1: {
                        result = 3;
                    }
                }
                return result;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('switch (a) {');
        expect(result).toContain('switch (b) {');
        expect(result).toContain('case 0: {');
        expect(result).toContain('result = 1;');
    });

    it('should handle switch with return statements', () => {
        const func = getFunction(`
            /** @kernel */
            function testSwitchReturn(value: u32) {
                switch (value) {
                    case 0: {
                        return 10;
                    }
                    case 1: {
                        return 20;
                    }
                    default: {
                        return 0;
                    }
                }
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('switch (value) {');
        expect(result).toContain('case 0: {');
        expect(result).toContain('return 10;');
        expect(result).toContain('case 1: {');
        expect(result).toContain('return 20;');
        expect(result).toContain('default: {');
        expect(result).toContain('return 0;');
    });

    it('should handle switch with variable declarations', () => {
        const func = getFunction(`
            /** @kernel */
            function testSwitchVars(value: u32) {
                let result = 0;
                switch (value) {
                    case 0: {
                        const temp = 5;
                        result = temp * 2;
                    }
                    case 1: {
                        let temp2 = 10;
        result = temp2 + 5;
                    }
                }
                return result;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('switch (value) {');
        expect(result).toContain('case 0: {');
        expect(result).toContain('let temp = 5;');
        expect(result).toContain('result = temp * 2;');
        expect(result).toContain('case 1: {');
        expect(result).toContain('var temp2 = 10;');
    });

    // Ternary operator tests
    it('should handle basic ternary operator', () => {
        const func = getFunction(`
            /** @kernel */
            function testTernary(x: number) {
                const result = x > 0 ? 1.0 : 0.0;
                return result;
            }
                `);
        const result = generateWGSL(func);
        expect(result).toContain('let result = select(0.0, 1.0, x > 0);');
    });

    it('should handle ternary with expressions', () => {
        const func = getFunction(`
            /** @kernel */
            function testTernaryExpr(a: number, b: number) {
                const result = a > b ? a * 2 : b * 2;
                return result;
            }
                `);
        const result = generateWGSL(func);
        expect(result).toContain('let result = select(b * 2, a * 2, a > b);');
    });

    it('should handle nested ternary operators', () => {
        const func = getFunction(`
            /** @kernel */
            function testNestedTernary(x: number, y: number) {
                const result = x > 0 ? (y > 0 ? 1 : 2) : 3;
                return result;
            }
                `);
        const result = generateWGSL(func);
        expect(result).toContain('let result = select(3, (select(2, 1, y > 0)), x > 0);');
    });

    it('should handle ternary in return statement', () => {
        const func = getFunction(`
            /** @kernel */
            function testTernaryReturn(condition: boolean, a: number, b: number) {
                return condition ? a : b;
            }
                `);
        const result = generateWGSL(func);
        expect(result).toContain('return select(b, a, condition);');
    });

    it('should handle ternary with function calls', () => {
        const func = getFunction(`
            /** @kernel */
            function testTernaryFuncs(flag: boolean, x: number, y: number) {
                const result = flag ? sqrt(x) : abs(y);
                return result;
            }
                `);
        const result = generateWGSL(func);
        expect(result).toContain('let result = select(abs(y), sqrt(x), flag);');
    });

    it('should handle ternary in assignment (min function)', () => {
        const func = getFunction(`
            /** @kernel */
            function testTernaryAssign(a: number, b: number) {
                let result = 0.0;
                result = a < b ? a : b;
                return result;
            }
                `);
        const result = generateWGSL(func);
        expect(result).toContain('result = select(b, a, a < b);');
    });

    // While loop tests
    it('should handle basic while loop', () => {
        const func = getFunction(`
            /** @kernel */
            function testWhile() {
                let i = 0;
                while (i < 10) {
                    i++;
                }
                return i;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('while (i < 10) {');
        expect(result).toContain('i++;');
    });

    it('should handle while with complex condition', () => {
        const func = getFunction(`
            /** @kernel */
            function testWhileComplex(x: number, y: number) {
                while (x > 0 && y < 100) {
                    x--;
                    y++;
                }
                return x + y;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('while (x > 0 && y < 100) {');
        expect(result).toContain('x--;');
        expect(result).toContain('y++;');
    });

    it('should handle while with break', () => {
        const func = getFunction(`
            /** @kernel */
            function testWhileBreak() {
                let i = 0;
                while (true) {
                    if (i > 5) break;
                    i++;
                }
                return i;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('while (true) {');
        expect(result).toContain('break;');
    });

    it('should handle nested while loops', () => {
        const func = getFunction(`
            /** @kernel */
            function testNestedWhile() {
                let i = 0;
                let j = 0;
                while (i < 10) {
                    while (j < 10) {
                        j++;
                    }
                    i++;
                }
                return i + j;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('while (i < 10) {');
        expect(result).toContain('while (j < 10) {');
    });

    // Do-while loop tests
    it('should handle basic do-while loop', () => {
        const func = getFunction(`
            /** @kernel */
            function testDoWhile() {
                let i = 0;
                do {
                    i++;
                } while (i < 10);
                return i;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('loop {');
        expect(result).toContain('i++;');
        expect(result).toContain('if (!(i < 10)) {');
        expect(result).toContain('break;');
    });

    it('should handle do-while with complex condition', () => {
        const func = getFunction(`
            /** @kernel */
            function testDoWhileComplex(x: number) {
                do {
                    x--;
                } while (x > 0 && x < 100);
                return x;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('loop {');
        expect(result).toContain('x--;');
        expect(result).toContain('if (!(x > 0 && x < 100)) {');
    });

    it('should handle do-while with break', () => {
        const func = getFunction(`
            /** @kernel */
            function testDoWhileBreak() {
                let i = 0;
                do {
                    if (i > 5) break;
                    i++;
                } while (true);
                return i;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('loop {');
        expect(result).toContain('if (i > 5)');
        expect(result).toContain('break;');
    });

    it('should handle nested do-while loops', () => {
        const func = getFunction(`
            /** @kernel */
            function testNestedDoWhile() {
                let i = 0;
                let j = 0;
                do {
                    do {
                        j++;
                    } while (j < 10);
                    i++;
                } while (i < 10);
                return i + j;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('loop {');
        expect(result).toContain('if (!(j < 10)) {');
        expect(result).toContain('if (!(i < 10)) {');
    });

    // Keyword support tests
    it('should handle boolean true keyword', () => {
        const func = getFunction(`
            /** @kernel */
            function testTrue() {
                const flag = true;
                return flag;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('let flag = true;');
    });

    it('should handle boolean false keyword', () => {
        const func = getFunction(`
            /** @kernel */
            function testFalse() {
                const flag = false;
                return flag;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('let flag = false;');
    });

    it('should handle continue statement', () => {
        const func = getFunction(`
            /** @kernel */
            function testContinue() {
                let sum = 0;
                for (let i = 0; i < 10; i++) {
                    if (i === 5) continue;
                    sum += i;
                }
                return sum;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('continue;');
    });

    it('should handle break statement', () => {
        const func = getFunction(`
            /** @kernel */
            function testBreak() {
                let sum = 0;
                for (let i = 0; i < 10; i++) {
                    if (i === 5) break;
                    sum += i;
                }
                return sum;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('break;');
    });
    it('should handle SharedArray<vec2f>', () => {
        const func = getFunction(`
            /** @kernel */
            function compute(data: SharedArray<vec2f>) {
                const x = global_invocation_id.x;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('@group(0) @binding(0) var<storage, read_write> data : array<vec2<f32>>;');
    });

    it('should handle SharedArray<f32>', () => {
        const func = getFunction(`
            /** @kernel */
            function compute(data: SharedArray<f32>) {
                const x = global_invocation_id.x;
            }
        `);
        const result = generateWGSL(func);
        expect(result).toContain('@group(0) @binding(0) var<storage, read_write> data : array<f32>;');
    });

    it('should generate device function', () => {
        const func = getFunction(`
            /** @device */
            function sq(x: f32): f32 {
                return x * x;
            }
        `);
        const result = generateDeviceFunction(func);
        expect(result).toContain('fn sq(x : f32) -> f32 {');
        expect(result).toContain('return x * x;');
        expect(result).toContain('}');
    });

    it('should throw error for device function with number type', () => {
        const func = getFunction(`
            /** @device */
            function sq(x: number): number {
                return x * x;
            }
        `);
        expect(() => generateDeviceFunction(func)).toThrow("must have explicit type");
    });
    it('should generate struct definition for struct used in device function', () => {
        const code = `
            interface HitResult {
                t: f32;
            }

            /** @device */
            function intersect(ro: vec3): HitResult {
                return { t: 1.0 };
            }

            /** @kernel */
            function compute() {
                const res = intersect(vec3(0.0));
            }
        `;
        const sourceFile = project.createSourceFile('test_struct_device.ts', code, { overwrite: true });
        const func = sourceFile.getFunction('compute')!;
        const result = generateWGSL(func);

        expect(result).toContain('struct HitResult {');
        expect(result).toContain('t : f32');
    });
    it('should initialize struct variable with struct constructor', () => {
        const func = getFunction(`
            interface MyStruct {
                val: f32;
            }

            /** @kernel */
            function testStructInit() {
                let s: MyStruct;
            }
        `);
        const result = generateWGSL(func);
        expect(result).not.toContain('= 0.0;');
        expect(result).toContain('var s: MyStruct;');
    });
});
