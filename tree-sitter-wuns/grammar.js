module.exports = grammar({
  name: 'wuns',

  rules: {
    source_file: ($) => repeat($._form),
    word: () => /[-./0-9a-z]+/,
    list: ($) => seq('[', repeat($._form), ']'),
    _form: ($) => choice($.word, $.list),
  },
})
