module.exports = grammar({
  name: 'wuns',

  rules: {
    source_file: ($) => repeat($._form),
    word: () => /[a-z0-9.=/-]+/,
    list: ($) => seq('[', repeat($._form), ']'),
    _form: ($) => choice($.word, $.list),
  },
})
