global.wuns = {}
const {concat, kw_do, EQ} = require('./out.js')
{
const res = concat([1, 2, 3], [], [4, 5])
console.log({res})}
{
const res = kw_do([])
console.log({res})}

const eqTests = [[1, [], []], [1, 'a', 'a']]
for (const [expected, a, b] of eqTests) {
  const res = EQ(a, b)
  console.log({res, expected})
}
