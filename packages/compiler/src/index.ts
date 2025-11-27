import { Project } from "ts-morph";
import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import { transformHost } from "./host-transformer";

const program = new Command();

program
    .name("accelscript")
    .description("AccelScript Compiler")
    .version("0.0.1")
    .argument("<file>", "Input file")
    .option("-o, --out <output>", "Output file")
    .action((file, options) => {
        try {
            compile(file, options.out);
        } catch (error) {
            console.error("Compilation failed:");
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(String(error));
            }
            process.exit(1);
        }
    });

program.parse();

/**
 * Compile an AccelScript source file
 * @param filePath Path to the input file
 * @param outFile Optional path to the output file
 */
function compile(filePath: string, outFile?: string) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        throw new Error(`Input path not found: ${absPath}`);
    }

    const stats = fs.statSync(absPath);
    if (stats.isDirectory()) {
        if (outFile) {
            console.warn("Warning: --out option is ignored when input is a directory.");
        }

        const files = fs.readdirSync(absPath);
        for (const file of files) {
            // Process .ts and .tsx files, excluding .gen.ts(x) and .d.ts
            if ((file.endsWith('.ts') || file.endsWith('.tsx')) &&
                !file.endsWith('.gen.ts') &&
                !file.endsWith('.gen.tsx') &&
                !file.endsWith('.d.ts')) {

                const fullPath = path.join(absPath, file);
                // Generate output filename: Name.tsx -> Name.gen.tsx
                const outPath = fullPath.replace(/\.tsx?$/, '.gen.tsx');

                try {
                    compileFile(fullPath, outPath);
                } catch (e) {
                    console.error(`Failed to compile ${file}:`, e);
                }
            }
        }
    } else {
        compileFile(absPath, outFile);
    }
}

/**
 * Compile a single AccelScript source file
 * @param filePath Path to the input file
 * @param outFile Optional path to the output file
 */
function compileFile(filePath: string, outFile?: string) {
    // Validate input file exists
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        throw new Error(`Input file not found: ${absPath}`);
    }

    // Check if input file is a TypeScript file
    if (!absPath.endsWith('.ts') && !absPath.endsWith('.tsx')) {
        console.warn(`Warning: Input file '${absPath}' does not have a .ts or .tsx extension`);
    }

    console.log(`Compiling ${absPath}...`);

    // Create TypeScript project and load source file
    const project = new Project();
    let sourceFile;
    try {
        sourceFile = project.addSourceFileAtPath(absPath);
    } catch (error) {
        throw new Error(`Failed to load source file: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Transform the source file
    try {
        transformHost(sourceFile);
    } catch (error) {
        throw new Error(`Transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const output = sourceFile.getFullText();

    // Write output
    if (outFile) {
        const absOut = path.resolve(outFile);
        const outDir = path.dirname(absOut);

        // Create output directory if it doesn't exist
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        try {
            project.createSourceFile(absOut, output, { overwrite: true }).saveSync();
            console.log(`✓ Successfully written to ${absOut}`);
        } catch (error) {
            throw new Error(`Failed to write output file: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log("----- Transformed Host Code -----");
        console.log(output);
        console.log("---------------------------------");
    }
}
