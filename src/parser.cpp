#include "parser.hpp"
#include "antlr4-runtime.h"
#include <memory>

class ASTVisitor : public AccelScriptBaseVisitor {
public:
    std::unique_ptr<Node> visitStructDeclaration(AccelScriptParser::StructDeclarationContext* ctx) override {
        auto decl = std::make_unique<StructDeclaration>();
        decl->type = "StructDeclaration";
        decl->name.name = ctx->Identifier()->getText();
        decl->start = ctx->getStart()->getStartIndex();
        decl->end = ctx->getStop()->getStopIndex();
        return decl;
    }

    std::unique_ptr<Node> visitShaderDeclaration(AccelScriptParser::ShaderDeclarationContext* ctx) override {
        auto decl = std::make_unique<ShaderDeclaration>();
        decl->type = ctx->shaderType()->getText() + "ShaderDeclaration";
        decl->id.name = ctx->Identifier()->getText();

        // Parse parameters
        if (auto params = ctx->parameterList()) {
            for (auto param : params->parameter()) {
                decl->params.push_back({
                    param->Identifier()->getText(),
                    param->typeSpecifier()->getText()
                });
            }
        }

        // Parse return type if exists
        if (auto retType = ctx->typeSpecifier()) {
            decl->returnType.name = retType->getText();
        }

        decl->start = ctx->getStart()->getStartIndex();
        decl->end = ctx->getStop()->getStopIndex();
        return decl;
    }
};

std::unique_ptr<Node> parse(const std::string& code) {
    antlr4::ANTLRInputStream input(code);
    AccelScriptLexer lexer(&input);
    antlr4::CommonTokenStream tokens(&lexer);
    AccelScriptParser parser(&tokens);

    auto tree = parser.program();
    ASTVisitor visitor;
    return std::unique_ptr<Node>(visitor.visit(tree));
}
