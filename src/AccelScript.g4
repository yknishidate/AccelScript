grammar AccelScript;

program
    : declaration* EOF
    ;

declaration
    : structDeclaration
    | shaderDeclaration
    ;

structDeclaration
    : 'struct' Identifier '{' structMember* '}'
    ;

structMember
    : Identifier ':' typeSpecifier ';'
    ;

shaderDeclaration
    : shaderType Identifier '(' parameterList? ')' ('->' typeSpecifier)? block
    ;

shaderType
    : 'vertex'
    | 'fragment'
    | 'compute'
    ;

parameterList
    : parameter (',' parameter)*
    ;

parameter
    : Identifier ':' typeSpecifier
    ;

typeSpecifier
    : Identifier ('<' typeSpecifier '>')?
    ;

block
    : '{' statement* '}'
    ;

statement
    : variableDeclaration
    | expressionStatement
    | returnStatement
    ;

variableDeclaration
    : 'var' Identifier ':' typeSpecifier ('=' expression)? ';'
    | 'let' Identifier ('=' expression)? ';'
    ;

expressionStatement
    : expression ';'
    ;

returnStatement
    : 'return' expression? ';'
    ;

expression
    : primary
    | expression '[' expression ']'
    | expression '.' Identifier
    | expression '=' expression
    | expression operator expression
    ;

primary
    : Identifier
    | Number
    | '(' expression ')'
    ;

operator
    : '+' | '-' | '*' | '/'
    ;

Identifier: [a-zA-Z_][a-zA-Z0-9_]*;
Number: [0-9]+('.'[0-9]+)?;
WS: [ \t\r\n]+ -> skip;
