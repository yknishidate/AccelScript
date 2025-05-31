#pragma once
#include <memory>
#include <string>
#include <vector>

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
    struct Param {
        std::string name;
        std::string type;
    };
    std::vector<Param> params;
    struct {
        std::string name;
    } returnType;
    std::unique_ptr<Node> body;
};

std::unique_ptr<Node> parse(const std::string& code);
