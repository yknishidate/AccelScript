import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { generateWGSL } from "../wgsl-generator";

describe("Atomic Support", () => {
    const project = new Project();

    it("should map Atomic<u32> to atomic<u32>", () => {
        const sourceFile = project.createSourceFile("test.ts", `
            import { SharedArray, Atomic, u32 } from "@accelscript/runtime";

            /**
             * @kernel
             */
            function atomicKernel(data: SharedArray<Atomic<u32>>) {
                atomicAdd(data[0], 1);
            }
        `, { overwrite: true });

        const func = sourceFile.getFunction("atomicKernel")!;
        const wgsl = generateWGSL(func);

        expect(wgsl).toContain("@group(0) @binding(0) var<storage, read_write> data : array<atomic<u32>>;");
        expect(wgsl).toContain("atomicAdd(&data[0], 1)");
    });

    it("should map Atomic<i32> to atomic<i32>", () => {
        const sourceFile = project.createSourceFile("test2.ts", `
            import { SharedArray, Atomic, i32 } from "@accelscript/runtime";

            /**
             * @kernel
             */
            function atomicKernel(data: SharedArray<Atomic<i32>>) {
                atomicAdd(data[0], 1);
            }
        `, { overwrite: true });

        const func = sourceFile.getFunction("atomicKernel")!;
        const wgsl = generateWGSL(func);

        expect(wgsl).toContain("@group(0) @binding(0) var<storage, read_write> data : array<atomic<i32>>;");
    });

    it("should handle atomicStore and atomicLoad", () => {
        const sourceFile = project.createSourceFile("test3.ts", `
            import { SharedArray, Atomic, u32 } from "@accelscript/runtime";

            /**
             * @kernel
             */
            function atomicKernel(data: SharedArray<Atomic<u32>>) {
                atomicStore(data[0], 10);
                const x = atomicLoad(data[0]);
            }
        `, { overwrite: true });

        const func = sourceFile.getFunction("atomicKernel")!;
        const wgsl = generateWGSL(func);

        expect(wgsl).toContain("atomicStore(&data[0], 10)");
        expect(wgsl).toContain("let x = atomicLoad(&data[0])");
    });
});
