// 頂点シェーダー
@vertex
function vertexShader(
  vertices: read<f32[]>,
  colors: read<f32[]>,
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(position) @out position: vec4<f32>,
  @location(0) @out color: vec4<f32>
) {
  // 頂点インデックスから頂点データのインデックスを計算
  let idx = vertexIndex * 3;
  
  // 頂点位置を設定
  position = vec4(vertices[idx], vertices[idx + 1], vertices[idx + 2], 1.0);
  
  // 頂点カラーを設定
  let colorIdx = vertexIndex * 4;
  color = vec4(colors[colorIdx], colors[colorIdx + 1], colors[colorIdx + 2], colors[colorIdx + 3]);
}

// フラグメントシェーダー
@fragment
function fragmentShader(
  @location(0) color: vec4<f32>,
  @location(0) @out fragColor: vec4<f32>
) {
  // 入力された色をそのまま出力
  fragColor = color;
}

// 三角形描画のサンプル
async function runTriangleExample() {
  // キャンバスを取得
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }
  
  // キャンバスサイズを設定
  canvas.width = 800;
  canvas.height = 600;
  
  // WebGPUを初期化
  await AxRuntime.init(canvas);
  
  // 頂点データ（三角形の座標）
  const vertices = new AxFloat32Array([
    0.0, 0.5, 0.0,    // 上
    -0.5, -0.5, 0.0,  // 左下
    0.5, -0.5, 0.0    // 右下
  ]);
  
  // 頂点カラー（RGB + Alpha）
  const colors = new AxFloat32Array([
    1.0, 0.0, 0.0, 1.0,  // 赤（上）
    0.0, 1.0, 0.0, 1.0,  // 緑（左下）
    0.0, 0.0, 1.0, 1.0   // 青（右下）
  ]);
  
  // レンダリングパイプラインを作成
  const pipeline = createRenderPipeline(
    vertexShader(vertices, colors),
    fragmentShader(),
    {
      primitiveTopology: 'triangle-list'
    }
  );
  
  // レンダリング実行
  await render(pipeline, {
    vertexCount: 3,  // 三角形の頂点数
    firstVertex: 0,
    firstInstance: 0
  });
  
  console.log('Triangle rendered successfully');
}

// ページロード時に実行
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    // キャンバス要素を作成
    if (!document.getElementById('canvas')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'canvas';
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      canvas.style.border = '1px solid #ccc';
      document.body.appendChild(canvas);
    }
    
    // サンプル実行
    runTriangleExample().catch(console.error);
  });
}
