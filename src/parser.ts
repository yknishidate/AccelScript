import * as acorn from 'acorn';

// AST Node型定義
interface StructDeclaration extends acorn.Node {
    type: 'StructDeclaration';
    name: acorn.Node & { name: string };
    body: acorn.Node;
    start: number;
    end: number;
}

interface ParamDeclaration extends acorn.Node {
    name: string;
    type: { name: string };
}

type ShaderDeclarationType = 
    | 'vertexShaderDeclaration'
    | 'fragmentShaderDeclaration'
    | 'computeShaderDeclaration';

interface ShaderDeclaration extends acorn.Node {
    type: ShaderDeclarationType;
    id: acorn.Node & { name: string };
    params: ParamDeclaration[];
    returnType: (acorn.Node & { name: string }) | null;
    body: acorn.Node;
    start: number;
    end: number;
}

type AccelScriptNode = StructDeclaration | ShaderDeclaration;

// AccelScriptのカスタムトークン
const tt = acorn.tokTypes;

// カスタムキーワードの定義
const keywords = ['vertex', 'fragment', 'compute', 'struct'] as const;
type ShaderType = typeof keywords[number];

// パーサープラグイン
function accelScriptPlugin(Parser: typeof acorn.Parser) {
    return class extends Parser {
        declare keywords: { [key: string]: boolean };
        // acornのメソッドの型定義
        declare next: () => void;
        declare parseIdent: (liberal?: boolean) => acorn.Node & { name: string };
        declare parseBlock: () => acorn.Node;
        declare expect: (type: any) => void;
        declare eat: (type: any) => boolean;
        declare type: any;
        declare parseStatement: (context: any, topLevel?: boolean, exports?: any) => acorn.Node;

        constructor(options: acorn.Options, input: string) {
            super(options, input);
            
            // キーワードの追加
            keywords.forEach(keyword => {
                this.keywords[keyword] = true;
            });
        }

        // 構造体解析
        parseStruct(): StructDeclaration {
            const start = this.start;
            this.next(); // structキーワードをスキップ
            const name = this.parseIdent(true);
            const body = this.parseBlock();
            return {
                type: 'StructDeclaration',
                name,
                body,
                start,
                end: body.end
            };
        }

        // シェーダー関数解析
        parseShaderFunction(type: ShaderType): ShaderDeclaration {
            const start = this.start;
            const node: ShaderDeclaration = {
                type: `${type}ShaderDeclaration`,
                id: null as any,
                params: [],
                returnType: null,
                body: null as any,
                start,
                end: start
            };

            this.next();
            node.id = this.parseIdent(true);
            
            this.expect(tt.parenL);
            if (!this.eat(tt.parenR)) {
                do {
                    const paramName = this.parseIdent(true);
                    this.expect(tt.colon);
                    const paramType = this.parseIdent(true);
                    node.params.push({
                        name: paramName.name,
                        type: { name: paramType.name }
                    });
                } while (this.eat(tt.comma));
                this.expect(tt.parenR);
            }

            if (this.eat(tt.arrow)) {
                node.returnType = this.parseIdent(true);
            }

            node.body = this.parseBlock();
            node.end = node.body.end;
            return node;
        }

        // ステートメントの解析をオーバーライド
        parseStatement(context: string | null, topLevel: boolean, exports: any): acorn.Node {
            const starttype = this.type;

            // struct宣言の処理
            if (starttype.keyword === 'struct') {
                return this.parseStruct();
            }
            
            // シェーダー関数の処理
            if (keywords.includes(starttype.keyword as ShaderType)) {
                return this.parseShaderFunction(starttype.keyword as ShaderType);
            }

            return super.parseStatement(context, topLevel, exports);
        }
    };
}

// パーサーの作成
export function createParser(): typeof acorn.Parser {
    return acorn.Parser.extend(accelScriptPlugin);
}

// ソースコードの解析
export function parse(code: string): acorn.Node {
    const parser = createParser();
    return parser.parse(code, {
        ecmaVersion: 2020,
        sourceType: 'module'
    });
}
