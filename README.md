# AccelScript

AccelScript is a TypeScript-to-WebGPU compiler and runtime ecosystem. This monorepo contains the compiler, runtime library, and a playground for testing and demonstrations.

## Project Structure

- **packages/compiler**: The core compiler that transforms TypeScript code into host code (with embedded WGSL) and runtime calls.
- **packages/runtime**: The runtime library that handles WebGPU initialization, buffer management, and kernel dispatch.
- **packages/playground**: A React-based playground for running demos and testing the compiler.

## Prerequisites

- Node.js (v18 or later recommended)
- npm

## Setup

Install dependencies from the root directory:

```bash
npm install
```

## Building

You can build all packages from the root:

```bash
npm run build
```

Or build individual packages:

### Compiler
```bash
npm run build --workspace=@accelscript/compiler
```

### Runtime
```bash
npm run build --workspace=@accelscript/runtime
```

### Playground
```bash
npm run build --workspace=playground
```

## Testing

Run all tests from the root:

```bash
npm test
```

### Compiler Tests
The compiler has a comprehensive test suite using Vitest.

```bash
npm test --workspace=@accelscript/compiler
```

## Running Demos (Playground)

The playground contains several demos to showcase AccelScript capabilities.

1. **Compile Demos**:
   Before running the playground, you need to compile the demo files. This runs the AccelScript compiler on the source files in `packages/playground/src/demos`.

   ```bash
   npm run compile --workspace=playground
   ```

2. **Start Development Server**:
   Start the Vite development server to view the demos.

   ```bash
   npm run dev --workspace=playground
   ```

   Open the URL shown in the terminal (usually `http://localhost:5173`) to view the playground.

## Compiler Usage

You can use the compiler directly via the CLI.

```bash
# From the root, using the built compiler
node packages/compiler/dist/index.js <input-file> -o <output-file>
```

**Example:**
```bash
node packages/compiler/dist/index.js packages/playground/src/demos/VectorAdd.tsx -o packages/playground/src/demos/VectorAdd.gen.tsx
```

## Development Workflow

1. Make changes to `packages/compiler` or `packages/runtime`.
2. Rebuild the changed package:
   ```bash
   npm run build --workspace=@accelscript/compiler
   # or
   npm run build --workspace=@accelscript/runtime
   ```
3. If you changed the compiler, recompile the playground demos:
   ```bash
   npm run compile --workspace=playground
   ```
4. Check the changes in the playground (if running `npm run dev`, it should hot-reload, but you might need to refresh if the generated files changed significantly).
