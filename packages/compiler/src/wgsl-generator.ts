import { FunctionDeclaration, SyntaxKind, Node, BinaryExpression, Identifier, NumericLiteral, ReturnStatement, Block, VariableStatement, CallExpression, ElementAccessExpression, VariableDeclarationKind, InterfaceDeclaration, TypeAliasDeclaration, SourceFile, IfStatement, ForStatement, WhileStatement, DoStatement, SwitchStatement, VariableDeclarationList, ExpressionStatement, PrefixUnaryExpression, BreakStatement, ContinueStatement, PropertyAccessExpression, ParenthesizedExpression, ConditionalExpression, PostfixUnaryExpression, AsExpression } from "ts-morph";

// Constants
const DEFAULT_WORKGROUP_SIZE = "64";

export function generateWGSL(func: FunctionDeclaration): string {
    const generator = new WGSLGenerator(func);
    return generator.generate();
}

export function generateDeviceFunction(func: FunctionDeclaration): string {
    const generator = new WGSLGenerator(func);
    return generator.generateDeviceFunction();
}

class WGSLGenerator {
    constructor(private func: FunctionDeclaration) { }

    public generate(): string {
        const name = this.func.getName();
        if (!name) {
            throw new Error("Function must have a name");
        }

        const structDefs = this.generateStructDefinitions();
        const bindings = this.generateBindings();

        let body = "";
        const bodyBlock = this.func.getBody();
        if (bodyBlock && Node.isBlock(bodyBlock)) {
            body = this.visitBlock(bodyBlock);
        }

        const { prefix, signature, returnType } = this.getShaderSignature();

        return `${structDefs}${bindings}
${prefix}
fn ${name}(${signature}) ${returnType} {
${body}
}
`;
    }

    public generateDeviceFunction(): string {
        const name = this.func.getName();
        if (!name) {
            throw new Error("Function must have a name");
        }

        // Generate signature
        const params = this.func.getParameters().map(p => {
            const n = p.getName();
            const typeNode = p.getTypeNode();
            const typeText = typeNode ? typeNode.getText() : p.getType().getText();

            if (typeText === "number") {
                throw new Error(`Device function '${name}' parameter '${n}' must have explicit type (e.g. f32, i32, u32), not 'number'`);
            }

            let type = this.mapType(typeText);
            if (type.startsWith("array<")) {
                type = `ptr<storage, ${type}, read_write>`;
            }
            return `${n} : ${type}`;
        }).join(", ");

        const returnTypeNode = this.func.getReturnTypeNode();
        const returnTypeText = returnTypeNode ? returnTypeNode.getText() : this.func.getReturnType().getText();

        if (returnTypeText === "number") {
            throw new Error(`Device function '${name}' return type must have explicit type (e.g. f32, i32, u32), not 'number'`);
        }

        const returnType = returnTypeText === "void" ? "" : `-> ${this.mapType(returnTypeText)}`;

        let body = "";
        const bodyBlock = this.func.getBody();
        if (bodyBlock && Node.isBlock(bodyBlock)) {
            body = this.visitBlock(bodyBlock);
        }

        return `fn ${name}(${params}) ${returnType} {
${body}
}`;
    }

    private generateStructDefinitions(): string {
        const sourceFile = this.func.getSourceFile();
        const structTypes = new Set<string>();
        this.func.getParameters().forEach(p => {
            if (p.getName() === "workgroup_count") return;
            const typeNode = p.getTypeNode();
            const typeText = typeNode ? typeNode.getText() : p.getType().getText();
            if (this.isStructType(typeText)) {
                structTypes.add(typeText);
            }
        });

        // Scan device functions for struct usage
        const deviceFuncs = sourceFile.getFunctions().filter(f =>
            f.getJsDocs().some(doc => doc.getTags().some(tag => tag.getTagName() === "device"))
        );

        deviceFuncs.forEach(df => {
            // Scan parameters
            df.getParameters().forEach(p => {
                const typeNode = p.getTypeNode();
                const typeText = typeNode ? typeNode.getText() : p.getType().getText();
                if (this.isStructType(typeText)) {
                    structTypes.add(typeText);
                }
            });

            // Scan return type
            const returnTypeNode = df.getReturnTypeNode();
            const returnTypeText = returnTypeNode ? returnTypeNode.getText() : df.getReturnType().getText();
            if (this.isStructType(returnTypeText)) {
                structTypes.add(returnTypeText);
            }
        });

        let structDefs = "";
        for (const structName of structTypes) {
            const structDef = this.generateStructDefinition(sourceFile, structName);
            if (structDef) {
                structDefs += structDef + "\n";
            } else {
                console.warn(`Warning: Could not generate struct definition for '${structName}'`);
            }
        }
        return structDefs;
    }

    private generateBindings(): string {
        let bindings = "";
        this.func.getParameters().forEach((p, index) => {
            const n = p.getName();
            if (n === "workgroup_count") return;

            const typeNode = p.getTypeNode();
            const typeText = typeNode ? typeNode.getText() : p.getType().getText();
            const type = this.mapType(typeText);

            const bindingType = this.isScalarOrStructType(type) ? "uniform" : "storage, read_write";
            bindings += `@group(0) @binding(${index}) var<${bindingType}> ${n} : ${type};\n`;
        });
        return bindings;
    }

    private getShaderSignature(): { prefix: string, signature: string, returnType: string } {
        const jsDocs = this.func.getJsDocs();
        const isKernel = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "kernel"));
        const isVertex = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "vertex"));
        const isFragment = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "fragment"));
        const name = this.func.getName();

        if (!isKernel && !isVertex && !isFragment) {
            throw new Error(`Function '${name}' must have @kernel, @vertex, or @fragment annotation`);
        }

        let prefix = "";
        let signature = "";
        let returnType = "";

        const workgroupSizeTag = jsDocs
            .flatMap(doc => doc.getTags())
            .find(tag => tag.getTagName() === "workgroup_size");

        let workgroupSize = DEFAULT_WORKGROUP_SIZE;
        if (workgroupSizeTag) {
            const comment = workgroupSizeTag.getComment();
            if (comment) {
                const cleanComment = comment.toString().trim().replace(/^\((.*)\)$/, '$1');
                workgroupSize = cleanComment;
            }
        }

        if (isKernel) {
            prefix = `@compute @workgroup_size(${workgroupSize})`;
            signature = "@builtin(global_invocation_id) global_invocation_id : vec3<u32>";
        } else if (isVertex) {
            prefix = "@vertex";
            signature = "@builtin(vertex_index) vertex_index : u32";
            returnType = "-> @builtin(position) vec4<f32>";
        } else if (isFragment) {
            prefix = "@fragment";
            signature = "@builtin(position) pos : vec4<f32>";
            returnType = "-> @location(0) vec4<f32>";
        }

        return { prefix, signature, returnType };
    }

    private visitBlock(block: Block): string {
        return block.getStatements().map(s => this.visitNode(s)).join("\n");
    }

    private visitNode(node: Node): string {
        if (Node.isVariableStatement(node)) return this.visitVariableStatement(node);
        if (Node.isExpressionStatement(node)) return this.visitExpressionStatement(node);
        if (Node.isBinaryExpression(node)) return this.visitBinaryExpression(node);
        if (Node.isIdentifier(node)) return this.visitIdentifier(node);
        if (Node.isNumericLiteral(node)) return this.visitNumericLiteral(node);
        if (node.getKind() === SyntaxKind.TrueKeyword) return 'true';
        if (node.getKind() === SyntaxKind.FalseKeyword) return 'false';
        if (Node.isIfStatement(node)) return this.visitIfStatement(node);
        if (Node.isForStatement(node)) return this.visitForStatement(node);
        if (Node.isWhileStatement(node)) return this.visitWhileStatement(node);
        if (Node.isDoStatement(node)) return this.visitDoStatement(node);
        if (Node.isSwitchStatement(node)) return this.visitSwitchStatement(node);
        if (Node.isPrefixUnaryExpression(node)) return this.visitPrefixUnaryExpression(node);
        if (Node.isBlock(node)) return `{\n${this.visitBlock(node)}\n    }`;
        if (Node.isReturnStatement(node)) return this.visitReturnStatement(node);
        if (Node.isBreakStatement(node)) return `        break;`;
        if (Node.isContinueStatement(node)) return `        continue;`;
        if (Node.isCallExpression(node)) return this.visitCallExpression(node);
        if (Node.isElementAccessExpression(node)) return this.visitElementAccessExpression(node);
        if (Node.isPropertyAccessExpression(node)) return this.visitPropertyAccessExpression(node);
        if (Node.isParenthesizedExpression(node)) return `(${this.visitNode(node.getExpression())})`;
        if (Node.isConditionalExpression(node)) return this.visitConditionalExpression(node);
        if (Node.isVariableDeclarationList(node)) return this.visitVariableDeclarationList(node);
        if (Node.isPostfixUnaryExpression(node)) return this.visitPostfixUnaryExpression(node);
        if (Node.isAsExpression(node)) return this.visitNode(node.getExpression());

        console.warn(`Warning: Unsupported node type '${node.getKindName()}' at line ${node.getStartLineNumber()}`);
        return `/* Unsupported node: ${node.getKindName()} */`;
    }

    private visitVariableStatement(node: VariableStatement): string {
        const declList = node.getDeclarationList();
        const isConst = declList.getDeclarationKind() === VariableDeclarationKind.Const;
        const decl = declList.getDeclarations()[0];
        const name = decl.getName();
        const init = decl.getInitializer();
        const typeNode = decl.getTypeNode();
        const typeAnnotation = typeNode ? `: ${this.mapType(typeNode.getText())}` : '';
        const wgslKeyword = isConst ? "let" : "var";
        const initializer = init ? ` = ${this.visitNode(init)}` : "";
        return `    ${wgslKeyword} ${name}${typeAnnotation}${initializer};`;
    }

    private visitExpressionStatement(node: ExpressionStatement): string {
        return `    ${this.visitNode(node.getExpression())};`;
    }

    private visitBinaryExpression(node: BinaryExpression): string {
        return `${this.visitNode(node.getLeft())} ${node.getOperatorToken().getText()} ${this.visitNode(node.getRight())}`;
    }

    private visitIdentifier(node: Identifier): string {
        const text = node.getText();
        if (text === "global_id") return "global_invocation_id";
        return text;
    }

    private visitNumericLiteral(node: NumericLiteral): string {
        return node.getText();
    }

    private visitIfStatement(node: IfStatement): string {
        const cond = this.visitNode(node.getExpression());
        const thenStmt = this.visitNode(node.getThenStatement());
        const elseStmt = node.getElseStatement() ? ` else { ${this.visitNode(node.getElseStatement()!)} }` : "";
        const thenBlock = Node.isBlock(node.getThenStatement()) ? thenStmt : `{ ${thenStmt} }`;
        return `    if (${cond}) ${thenBlock}${elseStmt}`;
    }

    private visitForStatement(node: ForStatement): string {
        const initializer = node.getInitializer();
        const condition = node.getCondition();
        const incrementor = node.getIncrementor();
        const statement = node.getStatement();

        let initStr = "";
        if (initializer) {
            initStr = this.visitNode(initializer).trim().replace(/;$/, "");
        }

        const condStr = condition ? this.visitNode(condition) : "true";
        const incStr = incrementor ? this.visitNode(incrementor) : "";

        const body = Node.isBlock(statement) ? this.visitBlock(statement) : this.visitNode(statement);

        return `    for (${initStr}; ${condStr}; ${incStr}) {\n${body}\n    }`;
    }

    private visitWhileStatement(node: WhileStatement): string {
        const condition = this.visitNode(node.getExpression());
        const statement = node.getStatement();
        const body = Node.isBlock(statement) ? this.visitBlock(statement) : this.visitNode(statement);
        return `    while (${condition}) {\n${body}\n    }`;
    }

    private visitDoStatement(node: DoStatement): string {
        const condition = this.visitNode(node.getExpression());
        const statement = node.getStatement();
        const body = Node.isBlock(statement) ? this.visitBlock(statement) : this.visitNode(statement);
        return `    loop {\n${body}\n        if (!(${condition})) {\n            break;\n        }\n    }`;
    }

    private visitSwitchStatement(node: SwitchStatement): string {
        const expr = this.visitNode(node.getExpression());
        const caseBlock = node.getCaseBlock();
        const clauses = caseBlock.getClauses();

        let casesStr = '';
        for (const clause of clauses) {
            if (Node.isCaseClause(clause)) {
                const caseExpr = this.visitNode(clause.getExpression());
                const statements = clause.getStatements();
                const body = statements.map(s => this.visitNode(s)).join('\n');
                casesStr += `        case ${caseExpr}: {\n${body}\n        }\n`;
            } else if (Node.isDefaultClause(clause)) {
                const statements = clause.getStatements();
                const body = statements.map(s => this.visitNode(s)).join('\n');
                casesStr += `        default: {\n${body}\n        }\n`;
            }
        }

        return `    switch (${expr}) {\n${casesStr}    }`;
    }

    private visitPrefixUnaryExpression(node: PrefixUnaryExpression): string {
        const op = node.getOperatorToken();
        const opText = op === SyntaxKind.MinusToken ? "-" : op === SyntaxKind.ExclamationToken ? "!" : "";
        return `${opText}${this.visitNode(node.getOperand())}`;
    }

    private visitReturnStatement(node: ReturnStatement): string {
        return `    return ${node.getExpression() ? this.visitNode(node.getExpression()!) : ""};`;
    }

    private visitCallExpression(node: CallExpression): string {
        const expr = node.getExpression();
        const args = node.getArguments().map(a => this.visitNode(a));

        const funcName = expr.getText();
        if (funcName.startsWith("atomic") && args.length > 0) {
            args[0] = `&${args[0]}`;
        }

        return `${this.visitNode(expr)}(${args.join(", ")})`;
    }

    private visitElementAccessExpression(node: ElementAccessExpression): string {
        const expr = node.getExpression();
        const arg = node.getArgumentExpression();
        return `${this.visitNode(expr)}[${arg ? this.visitNode(arg) : "0"}]`;
    }

    private visitPropertyAccessExpression(node: PropertyAccessExpression): string {
        return `${this.visitNode(node.getExpression())}.${node.getName()}`;
    }

    private visitConditionalExpression(node: ConditionalExpression): string {
        const condition = this.visitNode(node.getCondition());
        const whenTrue = this.visitNode(node.getWhenTrue());
        const whenFalse = this.visitNode(node.getWhenFalse());
        return `select(${whenFalse}, ${whenTrue}, ${condition})`;
    }

    private visitVariableDeclarationList(node: VariableDeclarationList): string {
        const isConst = node.getDeclarationKind() === VariableDeclarationKind.Const;
        const decl = node.getDeclarations()[0];
        const name = decl.getName();
        const init = decl.getInitializer();
        const typeNode = decl.getTypeNode();
        const typeAnnotation = typeNode ? `: ${typeNode.getText()}` : '';
        const wgslKeyword = isConst ? "let" : "var";
        return `${wgslKeyword} ${name}${typeAnnotation} = ${init ? this.visitNode(init) : "0.0"}`;
    }

    private visitPostfixUnaryExpression(node: PostfixUnaryExpression): string {
        const op = node.getOperatorToken();
        const opText = op === SyntaxKind.PlusPlusToken ? "++" : op === SyntaxKind.MinusMinusToken ? "--" : "";
        return `${this.visitNode(node.getOperand())}${opText}`;
    }

    private mapType(tsType: string): string {
        const sharedArrayMatch = tsType.match(/^SharedArray<(.+)>$/);
        if (sharedArrayMatch) {
            const innerType = sharedArrayMatch[1];
            return `array<${this.mapType(innerType)}>`;
        }

        const atomicMatch = tsType.match(/^Atomic<(.+)>$/);
        if (atomicMatch) {
            const innerType = atomicMatch[1];
            return `atomic<${this.mapType(innerType)}>`;
        }

        if (tsType === "number") return "f32";
        if (tsType === "boolean") return "bool";
        if (tsType === "u32") return "u32";
        if (tsType === "i32") return "i32";
        if (tsType === "f32") return "f32";

        if (tsType === "vec2" || tsType === "vec2f") return "vec2<f32>";
        if (tsType === "vec3" || tsType === "vec3f") return "vec3<f32>";
        if (tsType === "vec4" || tsType === "vec4f") return "vec4<f32>";
        if (tsType === "vec2i") return "vec2<i32>";
        if (tsType === "vec3i") return "vec3<i32>";
        if (tsType === "vec4i") return "vec4<i32>";
        if (tsType === "vec2u") return "vec2<u32>";
        if (tsType === "vec3u") return "vec3<u32>";
        if (tsType === "vec4u") return "vec4<u32>";

        if (tsType === "mat2x2" || tsType === "mat2x2f") return "mat2x2<f32>";
        if (tsType === "mat3x3" || tsType === "mat3x3f") return "mat3x3<f32>";
        if (tsType === "mat4x4" || tsType === "mat4x4f") return "mat4x4<f32>";

        if (this.isStructType(tsType)) return tsType;

        console.warn(`Warning: Unknown type '${tsType}', defaulting to f32`);
        return "f32";
    }

    private isScalarOrStructType(wgslType: string): boolean {
        const scalarTypes = ["f32", "u32", "i32", "bool"];
        if (scalarTypes.includes(wgslType)) return true;

        if (wgslType.startsWith("vec2<") || wgslType.startsWith("vec3<") || wgslType.startsWith("vec4<")) {
            return true;
        }

        if (wgslType.startsWith("mat2x2<") || wgslType.startsWith("mat3x3<") || wgslType.startsWith("mat4x4<")) {
            return true;
        }

        if (!wgslType.startsWith("array<")) {
            return true;
        }

        return false;
    }

    private isStructType(typeText: string): boolean {
        const primitives = ["number", "boolean", "u32", "i32", "f32", "vec2", "vec3", "vec4", "mat2x2", "mat3x3", "mat4x4"];
        if (primitives.includes(typeText)) return false;
        if (typeText.includes("Array")) return false;
        return /^[A-Z]/.test(typeText);
    }

    private generateStructDefinition(sourceFile: SourceFile, structName: string): string | null {
        const interfaceDecl = sourceFile.getInterface(structName);
        if (interfaceDecl) {
            let fields = "";
            const members = interfaceDecl.getProperties();

            if (members.length === 0) {
                console.warn(`Warning: Struct '${structName}' has no properties`);
                return null;
            }

            members.forEach((member, index) => {
                const memberName = member.getName();
                const memberTypeNode = member.getTypeNode();
                const memberType = memberTypeNode ? memberTypeNode.getText() : "f32";
                const wgslType = this.mapType(memberType);
                const comma = index < members.length - 1 ? "," : "";
                fields += `    ${memberName} : ${wgslType}${comma}\n`;
            });
            return `struct ${structName} {\n${fields}}`;
        }

        const typeAlias = sourceFile.getTypeAlias(structName);
        if (typeAlias) {
            const typeNode = typeAlias.getTypeNode();
            if (typeNode && Node.isTypeLiteral(typeNode)) {
                let fields = "";
                const members = typeNode.getMembers();

                if (members.length === 0) {
                    console.warn(`Warning: Type alias '${structName}' has no properties`);
                    return null;
                }

                members.forEach((member, index) => {
                    if (Node.isPropertySignature(member)) {
                        const memberName = member.getName();
                        const memberTypeNode = member.getTypeNode();
                        const memberType = memberTypeNode ? memberTypeNode.getText() : "f32";
                        const wgslType = this.mapType(memberType);
                        const comma = index < members.length - 1 ? "," : "";
                        fields += `    ${memberName} : ${wgslType}${comma}\n`;
                    }
                });
                return `struct ${structName} {\n${fields}}`;
            } else {
                console.warn(`Warning: Type alias '${structName}' is not an object literal type`);
            }
        }

        return null;
    }
}
