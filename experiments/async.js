const AsyncFunction = async function () {}.constructor;

const afunc = new AsyncFunction(`
const { at } = await import('./host.js')
const first = (l) => {
  return at(l, 0)
}
return { first }
`)

const { first } = await afunc()
console.log('first', first([1,2,3]))
