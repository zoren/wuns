const Parser = require('tree-sitter');
const parser = new Parser();

const Wuns = require('tree-sitter-wuns')
parser.setLanguage(Wuns);

const sourceCode = '[func inc [x] [add x [quote 1]]] [if [eq [inc [quote 1]] [quote 2]] ]';

const tree = parser.parse(sourceCode);
console.log(tree.rootNode.toString());
