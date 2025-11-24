import { FunctionDeclaration, SyntaxKind, Node, BinaryExpression, Identifier, NumericLiteral, ReturnStatement, Block, VariableStatement, CallExpression, ElementAccessExpression, VariableDeclarationKind, InterfaceDeclaration, TypeAliasDeclaration, SourceFile } from "ts-morph";

// Constants
const DEFAULT_WORKGROUP_SIZE = "64";

export function generateWGSL(func: FunctionDeclaration): string {
    const name = func.getName();
    if (!name) {
        throw new Error("Function must have a name");
    }

    const sourceFile = func.getSourceFile();

    // Collect struct types used in parameters
    const structTypes = new Set<string>();
    func.getParameters().forEach(p => {
        if (p.getName() === "workgroup_count") return;
        const typeNode = p.getTypeNode();
        const typeText = typeNode ? typeNode.getText() : p.getType().getText();
        if (isStructType(typeText)) {
            structTypes.add(typeText);
        }
    });

    // Generate WGSL struct definitions
    let structDefs = "";
    for (const structName of structTypes) {
        const structDef = generateStructDefinition(sourceFile, structName);
        if (structDef) {
            structDefs += structDef + "\n";
        } else {
            console.warn(`Warning: Could not generate struct definition for '${structName}'`);
        }
    }

    // Generate global bindings
    let bindings = "";
    func.getParameters().forEach((p, index) => {
        const n = p.getName();
        if (n === "workgroup_count") return; // Skip workgroup_count parameter

        // Get the type annotation text directly to preserve u32/i32/f32
        const typeNode = p.getTypeNode();
        const typeText = typeNode ? typeNode.getText() : p.getType().getText();
        const type = mapType(typeText);

        // Determine binding type based on whether it's a scalar/struct (uniform) or array (storage)
        const bindingType = isScalarOrStructType(type) ? "uniform" : "storage, read_write";

        // Simple binding allocation
        bindings += `@group(0) @binding(${index}) var<${bindingType}> ${n} : ${type};\n`;
    });

    let body = "";
    const bodyBlock = func.getBody();
    if (bodyBlock && Node.isBlock(bodyBlock)) {
        body = transpileBlock(bodyBlock);
    }

    // Determine shader stage
    const jsDocs = func.getJsDocs();
    const isKernel = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "kernel"));
    const isVertex = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "vertex"));
    const isFragment = jsDocs.some(doc => doc.getTags().some(tag => tag.getTagName() === "fragment"));

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
            // Remove parentheses if present to normalize
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

    return `${structDefs}${bindings}
${prefix}
fn ${name}(${signature}) ${returnType} {
${body}
}`;
}

function mapType(tsType: string): string {
    // Primitive types
    if (tsType === "number") return "f32";
    if (tsType === "boolean") return "bool";
    if (tsType === "u32") return "u32";
    if (tsType === "i32") return "i32";
    if (tsType === "f32") return "f32";

    // Array types
    if (tsType.includes("Float32Array")) return "array<f32>";
    if (tsType.includes("Int32Array")) return "array<i32>";
    if (tsType.includes("Uint32Array")) return "array<u32>";

    // Vector types
    if (tsType === "vec2") return "vec2<f32>";
    if (tsType === "vec3") return "vec3<f32>";
    if (tsType === "vec4") return "vec4<f32>";

    // Matrix types
    if (tsType === "mat2x2") return "mat2x2<f32>";
    if (tsType === "mat3x3") return "mat3x3<f32>";
    if (tsType === "mat4x4") return "mat4x4<f32>";

    // Struct types - return as-is
    if (isStructType(tsType)) return tsType;

    // Default fallback
    console.warn(`Warning: Unknown type '${tsType}', defaulting to f32`);
    return "f32";
}

/**
 * Helper function to determine if a WGSL type should use uniform binding
 */
function isScalarOrStructType(wgslType: string): boolean {
    const scalarTypes = ["f32", "u32", "i32", "bool"];
    if (scalarTypes.includes(wgslType)) return true;

    // Vector types are also uniform
    if (wgslType.startsWith("vec2<") || wgslType.startsWith("vec3<") || wgslType.startsWith("vec4<")) {
        return true;
    }

    // Matrix types
    if (wgslType.startsWith("mat2x2<") || wgslType.startsWith("mat3x3<") || wgslType.startsWith("mat4x4<")) {
        return true;
    }

    // Check if it's a struct (doesn't start with array<)
    if (!wgslType.startsWith("array<")) {
        return true;
    }

    return false;
}

/**
 * Check if a TypeScript type text represents a struct/interface type
 */
function isStructType(typeText: string): boolean {
    // Check if it's not a primitive or array type
    const primitives = ["number", "boolean", "u32", "i32", "f32", "vec2", "vec3", "vec4", "mat2x2", "mat3x3", "mat4x4"];
    if (primitives.includes(typeText)) return false;
    if (typeText.includes("Array")) return false;
    // If it starts with uppercase, likely a struct/interface
    return /^[A-Z]/.test(typeText);
}

/**
 * Generate WGSL struct definition from TypeScript interface or type alias
 * @param sourceFile The source file containing the struct definition
 * @param structName The name of the struct to generate
 * @returns WGSL struct definition string, or null if not found
 */
function generateStructDefinition(sourceFile: SourceFile, structName: string): string | null {
    // Try to find interface declaration
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
            const wgslType = mapType(memberType);
            const comma = index < members.length - 1 ? "," : "";
            fields += `    ${memberName} : ${wgslType}${comma}\n`;
        });
        return `struct ${structName} {\n${fields}}`;
    }

    // Try to find type alias
    const typeAlias = sourceFile.getTypeAlias(structName);
    if (typeAlias) {
        // For now, we only support object literal types
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
                    const wgslType = mapType(memberType);
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

function transpileBlock(block: Block): string {
    return block.getStatements().map(s => transpileNode(s)).join("\n");
}

/**
 * Transpile a TypeScript AST node to WGSL code
 * @param node The TypeScript AST node to transpile
 * @returns WGSL code string
 */
function transpileNode(node: Node): string {
    // Variable declarations (let/var) with optional type annotation
    if (Node.isVariableStatement(node)) {
        const declList = node.getDeclarationList();
        const isConst = declList.getDeclarationKind() === VariableDeclarationKind.Const; // WGSL 'let' is const, 'var' is mutable
        const decl = declList.getDeclarations()[0];
        const name = decl.getName();
        const init = decl.getInitializer();
        const typeNode = decl.getTypeNode();
        const typeAnnotation = typeNode ? `: ${typeNode.getText()}` : '';
        const wgslKeyword = isConst ? "let" : "var";
        return `    ${wgslKeyword} ${name}${typeAnnotation} = ${init ? transpileNode(init) : "0.0"};`;
    }

    // Expression statements (e.g., function calls, assignments)
    if (Node.isExpressionStatement(node)) {
        return `    ${transpileNode(node.getExpression())};`;
    }

    // Binary expressions (e.g., a + b, x * y)
    if (Node.isBinaryExpression(node)) {
        return `${transpileNode(node.getLeft())} ${node.getOperatorToken().getText()} ${transpileNode(node.getRight())}`;
    }

    // Identifiers (variable names, function names)
    if (Node.isIdentifier(node)) {
        const text = node.getText();
        // Map TypeScript built-in names to WGSL equivalents
        if (text === "global_id") return "global_invocation_id";
        return text;
    }

    // Numeric literals (e.g., 42, 3.14)
    if (Node.isNumericLiteral(node)) {
        return node.getText();
    }

    // If statements with optional else clause
    if (Node.isIfStatement(node)) {
        const cond = transpileNode(node.getExpression());
        const thenStmt = transpileNode(node.getThenStatement());
        const elseStmt = node.getElseStatement() ? ` else { ${transpileNode(node.getElseStatement()!)} }` : "";
        // Handle block vs single statement
        const thenBlock = Node.isBlock(node.getThenStatement()) ? thenStmt : `{ ${thenStmt} }`;
        return `    if (${cond}) ${thenBlock}${elseStmt}`;
    }

    // For loops
    if (Node.isForStatement(node)) {
        const initializer = node.getInitializer();
        const condition = node.getCondition();
        const incrementor = node.getIncrementor();
        const statement = node.getStatement();

        let initStr = "";
        if (initializer) {
            // Strip indentation and trailing semicolon from initializer
            initStr = transpileNode(initializer).trim().replace(/;$/, "");
        }

        const condStr = condition ? transpileNode(condition) : "true";
        const incStr = incrementor ? transpileNode(incrementor) : "";

        const body = Node.isBlock(statement) ? transpileBlock(statement) : transpileNode(statement);

        return `    for (${initStr}; ${condStr}; ${incStr}) {\n${body}\n    }`;
    }

    // Switch statements
    if (Node.isSwitchStatement(node)) {
        const expr = transpileNode(node.getExpression());
        const caseBlock = node.getCaseBlock();
        const clauses = caseBlock.getClauses();

        let casesStr = '';
        for (const clause of clauses) {
            if (Node.isCaseClause(clause)) {
                const caseExpr = transpileNode(clause.getExpression());
                const statements = clause.getStatements();
                const body = statements.map(s => transpileNode(s)).join('\n');
                casesStr += `        case ${caseExpr}: {\n${body}\n        }\n`;
            } else if (Node.isDefaultClause(clause)) {
                const statements = clause.getStatements();
                const body = statements.map(s => transpileNode(s)).join('\n');
                casesStr += `        default: {\n${body}\n        }\n`;
            }
        }

        return `    switch (${expr}) {\n${casesStr}    }`;
    }

    // Prefix unary expressions (e.g., -x, !flag)
    if (Node.isPrefixUnaryExpression(node)) {
        const op = node.getOperatorToken();
        const opText = op === SyntaxKind.MinusToken ? "-" : op === SyntaxKind.ExclamationToken ? "!" : "";
        return `${opText}${transpileNode(node.getOperand())}`;
    }

    // Block statements (curly braces with multiple statements)
    if (Node.isBlock(node)) {
        return `{\n${transpileBlock(node)}\n    }`;
    }

    // Return statements
    if (Node.isReturnStatement(node)) {
        return `    return ${node.getExpression() ? transpileNode(node.getExpression()!) : ""};`;
    }

    // Break statements
    if (Node.isBreakStatement(node)) {
        return `        break;`;
    }

    // Continue statements
    if (Node.isContinueStatement(node)) {
        return `        continue;`;
    }

    // Function calls (e.g., sqrt(x), vec4(1.0, 0.0, 0.0, 1.0))
    if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        const args = node.getArguments().map(a => transpileNode(a)).join(", ");
        return `${transpileNode(expr)}(${args})`;
    }

    // Array element access (e.g., arr[i])
    if (Node.isElementAccessExpression(node)) {
        const expr = node.getExpression();
        const arg = node.getArgumentExpression();
        return `${transpileNode(expr)}[${arg ? transpileNode(arg) : "0"}]`;
    }

    // Property access (e.g., global_id.x, vec.y)
    if (Node.isPropertyAccessExpression(node)) {
        return `${transpileNode(node.getExpression())}.${node.getName()}`;
    }

    // Parenthesized expressions (e.g., (y * width + x) * 3)
    if (Node.isParenthesizedExpression(node)) {
        return `(${transpileNode(node.getExpression())})`;
    }

    // Conditional expressions (ternary operator: condition ? a : b)
    // WGSL uses select(falseValue, trueValue, condition)
    if (Node.isConditionalExpression(node)) {
        const condition = transpileNode(node.getCondition());
        const whenTrue = transpileNode(node.getWhenTrue());
        const whenFalse = transpileNode(node.getWhenFalse());
        return `select(${whenFalse}, ${whenTrue}, ${condition})`;
    }


    // Variable declaration list (used in for loop initializer)
    if (Node.isVariableDeclarationList(node)) {
        const isConst = node.getDeclarationKind() === VariableDeclarationKind.Const;
        const decl = node.getDeclarations()[0];
        const name = decl.getName();
        const init = decl.getInitializer();
        const typeNode = decl.getTypeNode();
        const typeAnnotation = typeNode ? `: ${typeNode.getText()}` : '';
        const wgslKeyword = isConst ? "let" : "var";
        return `${wgslKeyword} ${name}${typeAnnotation} = ${init ? transpileNode(init) : "0.0"}`;
    }

    // Postfix unary expressions (e.g., i++)
    if (Node.isPostfixUnaryExpression(node)) {
        const op = node.getOperatorToken();
        const opText = op === SyntaxKind.PlusPlusToken ? "++" : op === SyntaxKind.MinusMinusToken ? "--" : "";
        return `${transpileNode(node.getOperand())}${opText}`;
    }

    // Type assertions (e.g., x as any) - strip the type assertion
    if (Node.isAsExpression(node)) {
        return transpileNode(node.getExpression());
    }

    // Unsupported node type - emit a comment for debugging
    console.warn(`Warning: Unsupported node type '${node.getKindName()}' at line ${node.getStartLineNumber()}`);
    return `/* Unsupported node: ${node.getKindName()} */`;
}
