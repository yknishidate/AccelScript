#include <gtest/gtest.h>
#include "../src/parser.hpp"

struct Node {
    virtual ~Node() = default;
    std::string type;
    size_t start;
    size_t end;
};

struct StructDeclaration : Node {
    struct {
        std::string name;
    } name;
    std::unique_ptr<Node> body;
};

struct ShaderDeclaration : Node {
    struct {
        std::string name;
    } id;
    std::vector<struct {
        std::string name;
    }> params;
    struct {
        std::string name;
    } returnType;
    std::unique_ptr<Node> body;
};

TEST(AccelScriptParser, ParseStructDeclaration) {
    const char* code = R"(
        struct Vertex {
            position: vec3;
            color: vec3;
        }
    )";

    auto ast = parse(code);
    auto* structDecl = dynamic_cast<StructDeclaration*>(ast.get());
    
    ASSERT_NE(structDecl, nullptr);
    EXPECT_EQ(structDecl->type, "StructDeclaration");
    EXPECT_EQ(structDecl->name.name, "Vertex");
}

TEST(AccelScriptParser, ParseComputeShader) {
    const char* code = R"(
        compute Add(input1: Buffer<f32>, input2: Buffer<f32>, output: Buffer<f32>) {
            let id = gl_GlobalInvocationID.x;
            output[id] = input1[id] + input2[id];
        }
    )";

    auto ast = parse(code);
    auto* shaderDecl = dynamic_cast<ShaderDeclaration*>(ast.get());
    
    ASSERT_NE(shaderDecl, nullptr);
    EXPECT_EQ(shaderDecl->type, "computeShaderDeclaration");
    EXPECT_EQ(shaderDecl->id.name, "Add");
    EXPECT_EQ(shaderDecl->params.size(), 3);
}

TEST(AccelScriptParser, ParseVertexShaderWithReturnType) {
    const char* code = R"(
        vertex SimpleVertex(vertex: Vertex, uniforms: Uniforms) -> VertexOutput {
            var output: VertexOutput;
            output.position = uniforms.modelViewProj * vec4(vertex.position, 1.0);
            output.color = vertex.color;
            return output;
        }
    )";

    auto ast = parse(code);
    auto* shaderDecl = dynamic_cast<ShaderDeclaration*>(ast.get());
    
    ASSERT_NE(shaderDecl, nullptr);
    EXPECT_EQ(shaderDecl->type, "vertexShaderDeclaration");
    EXPECT_EQ(shaderDecl->id.name, "SimpleVertex");
    EXPECT_EQ(shaderDecl->returnType.name, "VertexOutput");
}
