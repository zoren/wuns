const fs = require('fs');
const source = fs.readFileSync('./root.wasm');

WebAssembly.instantiate(source, { env: { print: (x) => console.log(x) } }).then((result) => {
  const add = result.instance.exports.add;
  console.log(add(1, 2));
});
