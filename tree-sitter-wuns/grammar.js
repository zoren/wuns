module.exports = grammar({
  name: 'wuns',

  rules: {
    source_file: ($) => repeat($._form),
    word: () => /[a-z0-9.=-]+/,
    // todo look into https://tree-sitter.github.io/tree-sitter/creating-parsers#keyword-extraction
    _special_form: () => choice('quote', 'if', 'let', 'loop', 'cont', 'func', 'macro'),
    // _special_form: ($) =>  seq('[', choice('quote', 'if', 'let', 'loop', 'cont', 'func', 'macro'), repeat($._form), ']'),
    list_special_form: ($) => seq('[', $._special_form, repeat($._form), ']'),
    list: ($) => seq('[', repeat($._form), ']'),
    _form: ($) => choice($.word, $.list_special_form, $.list),
  },
})
