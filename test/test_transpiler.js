const { preprocess, parseParamType } = require('../src/transpiler.js');

describe('preprocess and extractFunctions', () => {
  test('extracts compute functions', () => {
    const source = `
      @compute function add(a: read<f32[]>, b: write<f32[]>) {
        b[index] = a[index] + 1.0;
      }
      const x = 5;
    `;
    const result = preprocess(source);
    
    expect(result.computeFunctions).toHaveLength(1);
    expect(result.computeFunctions[0]).toEqual({
      name: 'add',
      params: ['a: read<f32[]>', 'b: write<f32[]>'],
      body: '\n        b[index] = a[index] + 1.0;\n      '
    });
    expect(result.jsCode.trim()).toBe('const x = 5;');
  });

  test('extracts vertex functions', () => {
    const source = `
      @vertex function transform(
        @builtin(vertex_index) vertexIndex: u32,
        @location(0) position: vec3<f32>
      ) {
        return position;
      }
      const y = 10;
    `;
    const result = preprocess(source);

    expect(result.vertexFunctions).toHaveLength(1);
    expect(result.vertexFunctions[0]).toEqual({
      name: 'transform',
      params: ['@builtin(vertex_index) vertexIndex: u32', '@location(0) position: vec3<f32>'],
      body: '\n        return position;\n      '
    });
    expect(result.jsCode.trim()).toBe('const y = 10;');
  });
});

describe('parseParamType', () => {
  test('parses buffer type parameters', () => {
    expect(parseParamType('inputA: read<f32[]>')).toEqual({
      kind: 'buffer',
      name: 'inputA',
      access: 'read',
      type: 'f32'
    });
    
    expect(parseParamType('outputB: write<i32[]>')).toEqual({
      kind: 'buffer',
      name: 'outputB',
      access: 'write',
      type: 'i32'
    });
  });

  test('parses builtin parameters', () => {
    expect(parseParamType('@builtin(vertex_index) vertexIndex: u32')).toEqual({
      kind: 'builtin',
      name: 'vertexIndex',
      builtin: 'vertex_index',
      type: 'u32',
      templateType: undefined
    });

    expect(parseParamType('@builtin(position) pos: vec4<f32>')).toEqual({
      kind: 'builtin',
      name: 'pos',
      builtin: 'position',
      type: 'vec4',
      templateType: 'f32'
    });
  });

  test('parses location parameters', () => {
    expect(parseParamType('@location(0) position: vec3<f32>')).toEqual({
      kind: 'location',
      name: 'position',
      location: 0,
      type: 'vec3',
      templateType: 'f32'
    });
  });

  test('parses output location parameters', () => {
    expect(parseParamType('@location(0) @out color: vec4<f32>')).toEqual({
      kind: 'out_location',
      name: 'color',
      location: 0,
      type: 'vec4',
      templateType: 'f32'
    });
  });

  test('parses output builtin parameters', () => {
    expect(parseParamType('@builtin(position) @out pos: vec4<f32>')).toEqual({
      kind: 'out_builtin',
      name: 'pos',
      builtin: 'position',
      type: 'vec4',
      templateType: 'f32'
    });
  });

  test('parses normal parameters', () => {
    expect(parseParamType('scale: f32')).toEqual({
      kind: 'normal',
      name: 'scale',
      type: 'f32',
      templateType: undefined
    });

    expect(parseParamType('matrix: mat4<f32>')).toEqual({
      kind: 'normal',
      name: 'matrix',
      type: 'mat4',
      templateType: 'f32'
    });
  });

  test('returns null for invalid parameters', () => {
    expect(parseParamType('')).toBeNull();
    expect(parseParamType('invalid parameter')).toBeNull();
  });
});
