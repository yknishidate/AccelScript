import { parse } from '../src/parser';
import { Node } from 'acorn';

interface StructDeclaration extends Node {
    type: 'StructDeclaration';
    name: { name: string };
    body: Node;
}

interface ShaderDeclaration extends Node {
    type: string;
    id: { name: string };
    params: { name: string }[];
    returnType: { name: string } | null;
    body: Node;
}

interface Program extends Node {
    type: 'Program';
    body: (StructDeclaration | ShaderDeclaration)[];
}

describe('AccelScript Parser', () => {
    test('parse struct declaration', () => {
        const code = `
            struct Vertex {
                position: vec3;
                color: vec3;
            }
        `;        const ast = parse(code) as Program;
        const structDecl = ast.body[0] as StructDeclaration;
        expect(structDecl.type).toBe('StructDeclaration');
        expect(structDecl.name.name).toBe('Vertex');
    });

    test('parse compute shader', () => {
        const code = `
            compute Add(input1: Buffer<f32>, input2: Buffer<f32>, output: Buffer<f32>) {
                let id = gl_GlobalInvocationID.x;
                output[id] = input1[id] + input2[id];
            }
        `;        const ast = parse(code) as Program;
        const shaderDecl = ast.body[0] as ShaderDeclaration;
        expect(shaderDecl.type).toBe('computeShaderDeclaration');
        expect(shaderDecl.id.name).toBe('Add');
        expect(shaderDecl.params).toHaveLength(3);
    });

    test('parse vertex shader with return type', () => {
        const code = `
            vertex SimpleVertex(vertex: Vertex, uniforms: Uniforms) -> VertexOutput {
                var output: VertexOutput;
                output.position = uniforms.modelViewProj * vec4(vertex.position, 1.0);
                output.color = vertex.color;
                return output;
            }
        `;
        const ast = parse(code) as Node & { body: Node[] };
        expect(ast.body[0].type).toBe('vertexShaderDeclaration');
        expect((ast.body[0] as any).id.name).toBe('SimpleVertex');
        expect((ast.body[0] as any).returnType.name).toBe('VertexOutput');
    });
});
