import { Project } from "ts-morph";
import { generateWGSL } from "../wgsl-generator";
import { describe, it, expect } from "vitest";

describe("WGSL Generator - Global Constants", () => {
    it("should include global constants in generated WGSL", () => {
        const project = new Project();
        const sourceFile = project.createSourceFile("test.ts", `
            import { SharedArray, vec3f } from "@accelscript/runtime";

            const PI = 3.14159;
            const TAU = 6.28318;
            const EPSILON = 0.001;

            /** @kernel @workgroup_size(64) */
            function main(data: SharedArray<f32>) {
                let x = PI * TAU;
            }
        `);

        const func = sourceFile.getFunctionOrThrow("main");
        const wgsl = generateWGSL(func);

        expect(wgsl).toContain("const PI = 3.14159;");
        expect(wgsl).toContain("const TAU = 6.28318;");
        expect(wgsl).toContain("const EPSILON = 0.001;");
    });

    it("should handle typed constants", () => {
        const project = new Project();
        const sourceFile = project.createSourceFile("test_typed.ts", `
            import { f32 } from "@accelscript/runtime";

            const PI: f32 = 3.14159;

            /** @kernel */
            function main() {}
        `);

        const func = sourceFile.getFunctionOrThrow("main");
        const wgsl = generateWGSL(func);

        expect(wgsl).toContain("const PI: f32 = 3.14159;");
    });

    it("should exclude object and array constants", () => {
        const project = new Project();
        const sourceFile = project.createSourceFile("test_exclude.ts", `
            const PI = 3.14;
            const config = { width: 800, height: 600 };
            const data = [1, 2, 3];
            const uniformsSchema = { time: "f32" };

            /** @kernel */
            function main() {}
        `);

        const func = sourceFile.getFunctionOrThrow("main");
        const wgsl = generateWGSL(func);

        expect(wgsl).toContain("const PI = 3.14;");
        expect(wgsl).not.toContain("const config");
        expect(wgsl).not.toContain("const data");
        expect(wgsl).not.toContain("const uniformsSchema");
    });
});
