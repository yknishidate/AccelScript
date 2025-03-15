/**
 * JSS - JavaScript Shader Extension のテスト
 */
const { transpile } = require('../src/transpiler');

// テスト用のソースコード
const testSource = `
// 通常のJavaScript関数
function normalFunction(a, b) {
  return a + b;
}

// @compute
function addNumbers(x, y) {
  return x + y;
}

// 別の通常のJavaScript関数
function anotherFunction() {
  console.log("This is a normal JS function");
}

/* @compute */
function multiplyNumbers(a, b) {
  return a * b;
}

// メイン処理
console.log(normalFunction(5, 3));
console.log(anotherFunction());
`;

try {
  // トランスパイル実行
  const result = transpile(testSource);

  // 結果を表示
  console.log("=== 変換前のコード ===");
  console.log(testSource);
  console.log("\n=== 変換後のコード ===");
  console.log(result);

  // 検証
  console.log("\n=== テスト結果 ===");

  // 1. @compute関数が除外されているか確認
  const hasAddNumbers = result.includes("function addNumbers");
  const hasMultiplyNumbers = result.includes("function multiplyNumbers");
  console.log(`@compute関数が除外されているか: ${!hasAddNumbers && !hasMultiplyNumbers ? "成功" : "失敗"}`);

  // 2. 通常の関数が残っているか確認
  const hasNormalFunction = result.includes("function normalFunction");
  const hasAnotherFunction = result.includes("function anotherFunction");
  console.log(`通常の関数が残っているか: ${hasNormalFunction && hasAnotherFunction ? "成功" : "失敗"}`);

  // 3. シェーダーコードが生成されているか確認
  const hasShaderCode = result.includes("const shaderCode = {");
  const hasAddNumbersShader = result.includes("addNumbers: `");
  const hasMultiplyNumbersShader = result.includes("multiplyNumbers: `");
  console.log(`シェーダーコードが生成されているか: ${hasShaderCode && hasAddNumbersShader && hasMultiplyNumbersShader ? "成功" : "失敗"}`);

  // 4. WGSLの構文が正しいか確認（簡易的なチェック）
  const hasComputeAnnotation = result.includes("@compute @workgroup_size");
  const hasWgslFunction = result.includes("fn addNumbers") && result.includes("fn multiplyNumbers");
  console.log(`WGSLの構文が正しいか: ${hasComputeAnnotation && hasWgslFunction ? "成功" : "失敗"}`);

  // 総合結果
  const allTestsPassed = 
    !hasAddNumbers && !hasMultiplyNumbers && 
    hasNormalFunction && hasAnotherFunction && 
    hasShaderCode && hasAddNumbersShader && hasMultiplyNumbersShader &&
    hasComputeAnnotation && hasWgslFunction;

  console.log(`\n総合結果: ${allTestsPassed ? "すべてのテストに成功しました！" : "テストに失敗があります"}`);
} catch (error) {
  console.error("エラーが発生しました:", error);
}
