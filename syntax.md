```
// シェーダー定義はシンプルな関数として記述
vertex MyVertex(vertex: Vertex, uniforms: Uniforms) -> VertexOutput {
    // ...
}

fragment MyFragment(input: VertexOutput) -> vec4 {
    // ...
}

compute MyCompute(buffer: Buffer<f32>) {
    // ...
}

const canvas = document.getElementById('canvas');

ax.init(canvas);  // AxRuntime: WebGPUの初期化、必要なリソースの確保、パイプラインの作成などを行う

// Compute実行
ax.dispatch(MyCompute, {
    workgroups: [32, 32, 1],
    bindings: [buffer1],
    // オプショナルな実行時設定
    options: {
        localSize: [8, 8, 1]
    }
});

// Render実行
ax.draw([MyVertex, MyFragment], {
    vertexCount: 3,
    bindings: [vertices, uniforms],
    // オプショナルな実行時設定
    options: {
        cullMode: 'back',
        depthWrite: true,
        topology: 'triangle-list'
    }
});
```
