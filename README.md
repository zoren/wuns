# wuns
the wuns programming language

the text format uses only the keys one can reach without shift

words are made of the characters from `a` to `z` digits from `0` to `9` and the characters `-` `.` `/`

square brackets `[` and `]` for lists

there are other characters accessible without shift `'` `,` `;` `=` `\` `` ` `` these are currently unused and illegal in input


to build a new version of the tree sitter grammar, in `tree-sitter-wuns/`,  i do:
```
npx tree-sitter generate
npx tree-sitter build
npm version patch --no-git-tag-version
```
and then in `esm/`
```
npm i ../tree-sitter-wuns/tree-sitter-wuns-1.0.x
```
