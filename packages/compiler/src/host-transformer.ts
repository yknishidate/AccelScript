import { SourceFile, FunctionDeclaration, SyntaxKind, CallExpression } from "ts-morph";
import { generateWGSL, generateDeviceFunction } from "./wgsl-generator";

/**
 * Transform host TypeScript code to use the runtime and embed WGSL shaders
 * @param sourceFile The source file to transform
 */
export function transformHost(sourceFile: SourceFile) {
    // Add runtime import if not already present
    addRuntimeImport(sourceFile);

    // Transform kernel call sites to pass workgroup count as argument
    transformKernelCallSites(sourceFile);

    // Collect all device functions
    const deviceFunctionsWGSL = collectDeviceFunctions(sourceFile);

    // Transform kernel, vertex, and fragment functions
    transformShaderFunctions(sourceFile, deviceFunctionsWGSL);
}

/**
 * Add runtime import to the source file if not already present
 */
function addRuntimeImport(sourceFile: SourceFile) {
    if (!sourceFile.getImportDeclaration(d => d.getModuleSpecifierValue() === "@accelscript/runtime")) {
        sourceFile.addImportDeclaration({
            moduleSpecifier: "@accelscript/runtime",
            namedImports: ["runtime"]
        });
    }
}

/**
 * Transform kernel call sites to convert type arguments to runtime arguments
 * Example: compute<[80, 60, 1]>(data) -> compute(data, [80, 60, 1])
 */
function transformKernelCallSites(sourceFile: SourceFile) {
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
        const expr = call.getExpression();
        if (expr.getKind() !== SyntaxKind.Identifier) continue;

        const functionName = expr.getText();
        const funcDecl = sourceFile.getFunction(functionName);

        if (!funcDecl) continue;
        if (!isKernelFunction(funcDecl)) continue;

        transformKernelCall(call);
    }
}

/**
 * Check if a function is a kernel function
 */
function isKernelFunction(func: FunctionDeclaration): boolean {
    const jsDocs = func.getJsDocs();
    return jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "kernel"));
}

/**
 * Transform a single kernel call expression
 */
function transformKernelCall(call: CallExpression) {
    const typeArgs = call.getTypeArguments();
    if (typeArgs.length === 0) return;

    const typeArg = typeArgs[0];
    if (typeArg.getKind() !== SyntaxKind.TupleType) {
        console.warn(`Warning: Expected tuple type for workgroup count, got ${typeArg.getKindName()}`);
        return;
    }

    // Extract workgroup count from type argument: <[80, 60, 1]> -> [80, 60, 1]
    const workgroupCountText = typeArg.getText();

    // Remove type argument and add as runtime argument
    call.removeTypeArgument(typeArg);
    call.addArgument(workgroupCountText);
}

/**
 * Collect all functions marked with @device and generate their WGSL
 */
function collectDeviceFunctions(sourceFile: SourceFile): string {
    const functions = sourceFile.getFunctions();
    let wgsl = "";

    for (const func of functions) {
        const jsDocs = func.getJsDocs();
        const isDevice = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "device"));

        if (isDevice) {
            wgsl += generateDeviceFunction(func) + "\n\n";
            // Remove the device function from the output JS/TS as it's only for WGSL
            // Or keep it? If it's pure logic it might be useful on CPU too?
            // For now, let's keep it but maybe we should comment it out or something?
            // Actually, if it's used in kernel, it shouldn't be called from CPU directly usually.
            // But for shared logic it might be useful.
            // Let's leave it as is for now.
        }
    }

    return wgsl;
}

/**
 * Transform shader functions (kernel, vertex, fragment) to embed WGSL and call runtime
 */
function transformShaderFunctions(sourceFile: SourceFile, deviceFunctionsWGSL: string) {
    // Process functions in reverse order to avoid index shifting issues when inserting statements
    const functions = sourceFile.getFunctions().reverse();

    for (const func of functions) {
        const name = func.getName();
        if (!name) {
            console.warn("Warning: Skipping unnamed function");
            continue;
        }

        const jsDocs = func.getJsDocs();
        const isKernel = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "kernel"));
        const isVertex = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "vertex"));
        const isFragment = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "fragment"));

        if (isKernel) {
            transformKernelFunction(func, sourceFile, deviceFunctionsWGSL);
        } else if (isVertex || isFragment) {
            transformShaderFunction(func, deviceFunctionsWGSL);
        }
    }
}

/**
 * Transform a kernel function to embed WGSL and dispatch via runtime
 */
function transformKernelFunction(func: FunctionDeclaration, sourceFile: SourceFile, deviceFunctionsWGSL: string) {
    const name = func.getName()!;
    const wgsl = deviceFunctionsWGSL + generateWGSL(func);

    // Insert WGSL constant before the function
    const index = func.getChildIndex();
    sourceFile.insertVariableStatement(index, {
        declarations: [{
            name: `${name}_wgsl`,
            initializer: JSON.stringify(wgsl)
        }]
    });

    // Add optional workgroup_count parameter
    func.addParameter({
        name: "workgroup_count",
        type: "any",
        hasQuestionToken: true
    });

    // Relax parameter types to 'any' to allow SharedArray and other runtime types
    func.getParameters().forEach(p => {
        if (p.getName() !== "workgroup_count") {
            p.setType("any");
        }
    });

    // Build dispatch call
    const params = func.getParameters();
    const paramNames = params
        .filter(p => p.getName() !== "workgroup_count")
        .map(p => p.getName());
    const args = paramNames.join(", ");

    // Replace function body with runtime dispatch call
    func.setBodyText(`return runtime.dispatch(${name}_wgsl, "${name}", [${args}], workgroup_count);`);
}

/**
 * Transform a vertex or fragment shader function to return shader info
 */
function transformShaderFunction(func: FunctionDeclaration, deviceFunctionsWGSL: string) {
    const name = func.getName()!;
    const wgsl = deviceFunctionsWGSL + generateWGSL(func);

    // Replace body to return shader code and entry point
    func.setBodyText(`return { code: ${JSON.stringify(wgsl)}, entryPoint: "${name}" } as any;`);
}
