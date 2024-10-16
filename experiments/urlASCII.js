// A-Z, a-z, 0-9, -, ., _, ~, :, /, ?, #, [, ], @, !, $, &, ', (, ), *, +, ,, ;, %, and =

const urlChars = new Set([
  '-',
  '.',
  '_',
  '~',
  ':',
  '/',
  '?',
  '#',
  '[',
  ']',
  '@',
  '!',
  '$',
  '&',
  "'",
  '(',
  ')',
  '*',
  '+',
  ',',
  ';',
  '%',
  '=',
])

let addRange = (start, end) => {
  for (let i = start.charCodeAt(0); i <= end.charCodeAt(0); i++) {
    urlChars.add(String.fromCharCode(i))
  }
}
addRange('A', 'Z')
addRange('a', 'z')
addRange('0', '9')
for (let c = 33;c<127;c++) {
  console.log('0x' + c.toString(16), c.toString().padStart(3, ' '), String.fromCharCode(c), urlChars.has(String.fromCharCode(c)) ? 'url' : '')
}
console.log('num', urlChars.size)


for (const c of ['root', 'list', 'lsqb', 'rsqb', 'word', 'wspc', 'ille']) {
  console.log(c, '0x' + [...c].map((b) => b.charCodeAt(0).toString(16)).join(''))
}