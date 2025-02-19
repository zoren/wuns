

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
