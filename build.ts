import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  addSyntheticLeadingComment,
  createSourceFile,
  createPrinter,
  factory as f,
  NewLineKind,
  EmitHint,
  ScriptTarget,
  NodeFlags,
  SyntaxKind,
  isTypeAliasDeclaration,
  isUnionTypeNode,
  isStringLiteral,
  isLiteralTypeNode,
} from 'typescript';
import camelCase from 'lodash.camelcase';
import { format } from 'prettier';
import { decode } from 'he';

const document = readFileSync('./uievents-code/index-source.txt').toString();

const tables = document.match(/BEGIN_CODE_TABLE[\w\W]+?END_CODE_TABLE/g);
assert(tables);

interface KeyCodeSection {
  id: string;
  description: string;
  codes: KeyCode[];
}

interface KeyCode {
  code: string;
  description?: string;
}

const sections: KeyCodeSection[] = [];

for (const table of tables) {
  const [, id, description] = table.match(
    /(?<=BEGIN_CODE_TABLE )([\w-]+) "([^"]+)/
  )!;
  const rows = table.match(
    /(?<=CODE_OPT |CODE )\w+[\w\W]+?(?=CODE|CODE_OPT|END_CODE_TABLE)/g
  )!;

  const sectionCodes: KeyCode[] = [];
  for (const row of rows) {
    let [, code, description] = row.match(/^(\w+)(?=\s)\s+([\w\W]+)$/)!;

    description = description.replace(/\s+/g, ' ').trim();

    sectionCodes.push({
      code,
      description: description === ' ' ? undefined : description,
    });
  }

  sections.push({
    id,
    description,
    codes: sectionCodes,
  });
}

function upperCamelCase(str: string): string {
  return str.charAt(0).toUpperCase() + camelCase(str).slice(1);
}

const typeAliasComments: Record<string, string> = {};
const keyComments: Record<string, string> = {};

const types = [];

for (const section of sections) {
  const union = [];
  for (const code of section.codes) {
    union.push(f.createLiteralTypeNode(f.createStringLiteral(code.code)));

    if (code.description)
      keyComments[code.code] = decode(code.description)
        .replaceAll(/KEYCAP/g, '')
        .replaceAll(/PHONETIC/g, '');
  }

  const identifier = f.createIdentifier(upperCamelCase(section.id) + 'KeyCode');

  types.push(
    f.createTypeAliasDeclaration(
      [f.createModifier(SyntaxKind.ExportKeyword)],
      identifier,
      undefined,
      f.createUnionTypeNode(union)
    )
  );

  typeAliasComments[identifier.text] = section.description;
}

types.push(
  f.createTypeAliasDeclaration(
    [f.createModifier(SyntaxKind.ExportKeyword)],
    'KeyCode',
    undefined,
    f.createUnionTypeNode(types.map((t) => f.createTypeReferenceNode(t.name)))
  )
);

const ast = f.createSourceFile(
  types,
  // @ts-ignore
  undefined,
  NodeFlags.None
);

for (const s of ast.statements) {
  assert(isTypeAliasDeclaration(s));

  const identifier = s.name.text;
  if (Object.hasOwn(typeAliasComments, identifier)) {
    addSyntheticLeadingComment(
      s,
      SyntaxKind.MultiLineCommentTrivia,
      `* ${typeAliasComments[identifier]} `,
      true
    );
  }

  const type = s.type;

  assert(isUnionTypeNode(type));
  for (const t of type.types) {
    if (isLiteralTypeNode(t)) {
      const literal = t.literal;

      assert(isStringLiteral(literal));
      if (Object.hasOwn(keyComments, literal.text)) {
        for (const line of keyComments[literal.text].split('<br/>')) {
          addSyntheticLeadingComment(
            t,
            SyntaxKind.SingleLineCommentTrivia,
            ` ${line}`,
            true
          );
        }
      }
    }
  }
}

const resultFile = createSourceFile('index.d.ts', '', ScriptTarget.Latest);
const printer = createPrinter({
  newLine: NewLineKind.LineFeed,
  removeComments: false,
});
const result = printer.printNode(EmitHint.Unspecified, ast, resultFile);

const prettierrc = JSON.parse(readFileSync('./.prettierrc').toString());

const formatted = format(result, { ...prettierrc, parser: 'typescript' });

writeFileSync('index.d.ts', formatted);
