/**
 * JSS - JavaScript Shader Extension
 * JavaScriptを拡張し、@compute属性を持つ関数をWGSLのcompute shaderに変換するトランスパイラー
 */

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const generate = require('@babel/generator').default;

/**
 * ソースコードをASTに変換する
 * @param {string} source JavaScriptのソースコード
 * @returns {Object} Babel AST
 */
function parseToAST(source) {
  return parser.parse(source, {
    sourceType: 'module',
    // コメントを保持するオプションを追加
    attachComments: true
  });
}

/**
 * ASTから@compute属性を持つ関数を抽出する
 * @param {Object} ast Babel AST
 * @returns {{jsAST: Object, computeFunctions: Array<{name: string, node: Object, params: Array}>}}
 */
function extractComputeFunctions(ast) {
  const computeFunctions = [];
  
  // ASTを走査して@compute属性を持つ関数を検出
  traverse(ast, {
    FunctionDeclaration(path) {
      // 関数の前にコメントがあるか確認
      const comments = path.node.leadingComments || [];
      const isComputeFunction = comments.some(comment => 
        comment.value.includes('@compute')
      );
      
      if (isComputeFunction) {
        // @compute属性を持つ関数情報を保存
        computeFunctions.push({
          name: path.node.id.name,
          node: path.node,
          params: path.node.params.map(param => {
            if (t.isIdentifier(param)) {
              return {
                name: param.name,
                type: 'f32' // デフォルトの型（実際には型推論が必要）
              };
            }
            return null;
          }).filter(Boolean)
        });
        
        // 元のASTから関数を削除
        path.remove();
      }
    }
  });
  
  return {
    jsAST: ast,
    computeFunctions
  };
}

/**
 * 関数のASTを中間表現（IR）に変換する
 * @param {Object} functionInfo 関数情報
 * @returns {Object} 中間表現
 */
function convertToIR(functionInfo) {
  // 簡易的な中間表現を作成
  // 実際の実装ではより複雑な変換が必要
  const ir = {
    name: functionInfo.name,
    params: functionInfo.params,
    body: functionInfo.node.body.body,
    returnType: 'void' // デフォルトの戻り値型
  };
  
  return ir;
}

/**
 * 中間表現（IR）をWGSLコードに変換する
 * @param {Object} ir 中間表現
 * @returns {string} WGSLコード
 */
function generateWGSL(ir) {
  // パラメータの文字列を生成
  const paramsStr = ir.params.map(param => `${param.name}: ${param.type}`).join(', ');
  
  // 関数本体のコードを生成（簡易的な実装）
  let bodyCode = '';
  ir.body.forEach(statement => {
    // 簡易的な変換: JavaScriptのステートメントをそのままWGSLに変換
    // 実際の実装ではより複雑な変換が必要
    const jsCode = generate(statement).code;
    bodyCode += `  ${jsCode}\n`;
  });
  
  // WGSLコードを生成
  const wgslCode = `
@compute @workgroup_size(1)
fn ${ir.name}(${paramsStr}) -> ${ir.returnType} {
${bodyCode}}
`;
  
  return wgslCode;
}

/**
 * ASTをJavaScriptコードに変換する
 * @param {Object} ast Babel AST
 * @returns {string} JavaScriptコード
 */
function generateJS(ast) {
  return generate(ast).code;
}

/**
 * ソースコードを変換し、@compute関数をWGSLに変換してJSに埋め込む
 * @param {string} source JavaScriptのソースコード
 * @returns {string} 変換後のJavaScriptコード
 */
function transpile(source) {
  // 1. ソースをASTに変換
  const ast = parseToAST(source);
  
  // 2. ASTから@compute関数を抽出
  const { jsAST, computeFunctions } = extractComputeFunctions(ast);
  
  // 3. 各関数をIRに変換し、WGSLを生成
  const wgslShaders = {};
  for (const funcInfo of computeFunctions) {
    const ir = convertToIR(funcInfo);
    wgslShaders[funcInfo.name] = generateWGSL(ir);
  }
  
  // 4. 残りのASTをJavaScriptに変換
  let jsCode = generateJS(jsAST);
  
  // 5. シェーダーコードをJSに埋め込む
  if (Object.keys(wgslShaders).length > 0) {
    jsCode += '\n\n// Generated WGSL Shader Code\n';
    jsCode += 'const shaderCode = {\n';
    
    const entries = Object.entries(wgslShaders);
    for (let i = 0; i < entries.length; i++) {
      const [name, code] = entries[i];
      jsCode += `  ${name}: \`${code}\`${i < entries.length - 1 ? ',' : ''}\n`;
    }
    
    jsCode += '};\n';
  }
  
  return jsCode;
}

module.exports = {
  parseToAST,
  extractComputeFunctions,
  convertToIR,
  generateWGSL,
  generateJS,
  transpile
};
