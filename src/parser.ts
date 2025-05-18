import * as acorn from 'acorn';

// AST Node型定義
interface StructDeclaration {
    type: 'StructDeclaration';
    name: acorn.Node & { name: string };
    body: acorn.Node;
}

interface ShaderDeclaration {
    type: string;
    id: acorn.Node & { name: string };
    params: (acorn.Node & { name: string })[];
    returnType: (acorn.Node & { name: string }) | null;
    body: acorn.Node;
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

        constructor(options: acorn.Options, input: string) {
            super(options, input);
            
            // キーワードの追加
            keywords.forEach(keyword => {
                this.keywords[keyword] = true;
            });
        }

        // 構造体解析
        parseStruct(): StructDeclaration {
            this.next(); // structキーワードをスキップ
            const name = this.parseIdent(true);
            const body = this.parseBlock();
            return {
                type: 'StructDeclaration',
                name,
                body
            };
        }

        // シェーダー関数解析
        parseShaderFunction(type: ShaderType): ShaderDeclaration {
            const node: ShaderDeclaration = {
                type: `${type}ShaderDeclaration`,
                id: null as any,
                params: [],
                returnType: null,
                body: null as any
            };

            this.next(); // シェーダータイプをスキップ
            node.id = this.parseIdent(true);
            
            // パラメータの解析
            this.expect(tt.parenL);
            if (!this.eat(tt.parenR)) {
                do {
                    node.params.push(this.parseIdent(true));
                } while (this.eat(tt.comma));
                this.expect(tt.parenR);
            }

            // 戻り値の型解析（存在する場合）
            if (this.eat(tt.arrow)) {
                node.returnType = this.parseIdent(true);
            }

            node.body = this.parseBlock();
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
