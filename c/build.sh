clang                                                                                     \
  -mmacosx-version-min=14.4                                                               \
  -I ../node_modules/tree-sitter/vendor/tree-sitter/lib/include                              \
  interpreter.c                                                                      \
  ../tree-sitter-wuns/src/parser.c                                                           \
  ../tree-sitter-wuns/target/debug/build/tree-sitter-22f4308a64cc8d1a/out/libtree-sitter.a \
  -o interpreter
