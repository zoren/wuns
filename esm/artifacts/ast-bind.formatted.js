import externs from '../runtime-lib/externs.js'
const form_slash_word = (p0) => externs['host']['make-tagged-value']('form/word', [p0])
const form_slash_list = (p0) => externs['host']['make-tagged-value']('form/list', [p0])
const flist = (...elements) => {
  return form_slash_list(elements)
}
const list = (...entries) => {
  return entries
}
const qword = (m) => {
  {
    const tmp0 = m
    const tmp1 = tmp0['args']
    switch (externs['host']['get-tag'](tmp0)) {
      case 'form/word': {
        const w = tmp1[0]
        return flist(form_slash_word('form/word'), flist(form_slash_word('word'), form_slash_word(w)))
      }
      default:
        throw 'unmatched-match'
    }
  }
}
const def_extern = (name, type) => {
  return flist(
    form_slash_word('def'),
    name,
    flist(form_slash_word('type-anno'), flist(form_slash_word('extern'), form_slash_word('host'), name), type),
  )
}
const concat = externs['host']['concat']
const quote = (f) => {
  return f
}
const concat_lists = externs['host']['concat-lists']
const form_concat = (...list_forms) => {
  return form_slash_list(concat_lists(list_forms))
}
const mk_quote = (form) => {
  return flist(quote(form_slash_word('quote')), form)
}
const size = externs['host']['size']
const at = externs['host']['at']
const comment = (..._) => {
  return quote(form_slash_list([form_slash_word('do')]))
}
const todo = (..._) => {
  return quote(form_slash_list([form_slash_word('do')]))
}
const concat_words = externs['host']['concat-words']
const def_instruction_fn = (def_name, inst_name) => {
  return flist(
    quote(form_slash_word('def')),
    def_name,
    flist(
      quote(form_slash_word('func')),
      def_name,
      quote(form_slash_list([form_slash_word('a'), form_slash_word('b')])),
      flist(
        flist(quote(form_slash_word('intrinsic')), inst_name),
        quote(form_slash_word('a')),
        quote(form_slash_word('b')),
      ),
    ),
  )
}
const def_instruction = (def_name, inst_name) => {
  return def_instruction_fn(def_name, inst_name)
}
const abort = externs['host']['abort']
const form_to_word = (form) => {
  {
    const tmp2 = form
    const tmp3 = tmp2['args']
    switch (externs['host']['get-tag'](tmp2)) {
      case 'form/word': {
        const w = tmp3[0]
        return w
      }
      default:
        return abort(
          list(
            quote(
              form_slash_list([
                form_slash_word('form-to-word'),
                form_slash_word('requires'),
                form_slash_word('a'),
                form_slash_word('word'),
                form_slash_word('as'),
                form_slash_word('its'),
                form_slash_word('argument'),
              ]),
            ),
          ),
        )
    }
  }
}
const def_bin_i32_inst = (name) => {
  return def_instruction_fn(name, form_slash_word(concat_words('i32.', form_to_word(name))))
}
const add = (() => {
  const add = (a, b) => {
    return (a + b) | 0
  }
  return add
})()
const lt_s = (() => {
  const lt_s = (a, b) => {
    return (a < b) | 0
  }
  return lt_s
})()
const n_2 = -2
const n_1 = -1
const n0 = 0
const n1 = 1
const n2 = 2
const n3 = 3
const n4 = 4
const inc = (x) => {
  return add(x, n1)
}
const sub = (() => {
  const sub = (a, b) => {
    return (a - b) | 0
  }
  return sub
})()
const mul = (() => {
  const mul = (a, b) => {
    return (a * b) | 0
  }
  return mul
})()
const dec = (x) => {
  return sub(x, n1)
}
const not = (c) => {
  if (c) {
    return n0
  } else {
    return n1
  }
}
const eq = (() => {
  const eq = (a, b) => {
    return (a === b) | 0
  }
  return eq
})()
const is_empty = (form) => {
  return eq(n0, size(form))
}
const is_zero = (x) => {
  return eq(x, n0)
}
const i32_dot_bitwise_and = (() => {
  const i32_dot_bitwise_and = (a, b) => {
    return a & b
  }
  return i32_dot_bitwise_and
})()
const is_odd = (x) => {
  return i32_dot_bitwise_and(x, n1)
}
const is_even = (x) => {
  return not(is_odd(x))
}
const is_negative = (x) => {
  return lt_s(x, n0)
}
const min = (a, b) => {
  if (lt_s(a, b)) {
    return a
  } else {
    return b
  }
}
const max = (a, b) => {
  if (lt_s(a, b)) {
    return b
  } else {
    return a
  }
}
const first = (l) => {
  return at(l, n0)
}
const second = (l) => {
  return at(l, n1)
}
const third = (l) => {
  return at(l, n2)
}
const fourth = (l) => {
  return at(l, n3)
}
const last = (l) => {
  return at(l, n_1)
}
const when = (cond, ...forms) => {
  return flist(
    quote(form_slash_word('if')),
    cond,
    form_concat(list(quote(form_slash_word('do'))), forms),
    quote(form_slash_list([form_slash_word('do')])),
  )
}
const when_not = (cond, ...forms) => {
  return flist(
    quote(form_slash_word('if')),
    cond,
    quote(form_slash_list([form_slash_word('do')])),
    form_concat(list(quote(form_slash_word('do'))), forms),
  )
}
const if_not = (cond, false_form, true_form) => {
  return flist(quote(form_slash_word('if')), cond, true_form, false_form)
}
const is_word = (form) => {
  {
    const tmp4 = form
    const tmp5 = tmp4['args']
    switch (externs['host']['get-tag'](tmp4)) {
      case 'form/word': {
        const x = tmp5[0]
        return n1
      }
      default:
        return n0
    }
  }
}
const list_init_func = externs['host']['list-init-func']
const list_map_fn = (f, l) => {
  return list_init_func(
    size(l),
    (() => {
      const list_map_fn_f = (i) => {
        return f(at(l, i))
      }
      return list_map_fn_f
    })(),
  )
}
const list_reverse = externs['host']['list-reverse']
const quote_list = (lmsg) => {
  return form_slash_list(
    concat(
      list(quote(form_slash_word('list'))),
      list_map_fn(
        (() => {
          const f = (e) => {
            {
              const tmp6 = e
              const tmp7 = tmp6['args']
              switch (externs['host']['get-tag'](tmp6)) {
                case 'form/word': {
                  const w = tmp7[0]
                  return mk_quote(e)
                }
                case 'form/list': {
                  const l = tmp7[0]
                  return e
                }
                default:
                  throw 'unmatched-match'
              }
            }
          }
          return f
        })(),
        lmsg,
      ),
    ),
  )
}
const slice = externs['host']['slice']
const rest = (l) => {
  return slice(l, n1, size(l))
}
const assert = (cond, ...lmsg) => {
  return flist(
    quote(form_slash_word('if')),
    cond,
    quote(form_slash_list([form_slash_word('do')])),
    flist(quote(form_slash_word('do')), flist(quote(form_slash_word('abort')), quote_list(lmsg))),
  )
}
const logq_abort = (...lmsg) => {
  return flist(quote(form_slash_word('do')), flist(quote(form_slash_word('abort')), quote_list(lmsg)))
}
const identity = (x) => {
  return x
}
const ifs = (...clauses) => {
  {
    const s = size(clauses)
    {
      if (is_odd(s)) {
      } else {
        {
          abort(
            list(
              quote(form_slash_word('ifs')),
              quote(form_slash_word('requires')),
              quote(form_slash_word('an')),
              quote(form_slash_word('odd')),
              quote(form_slash_word('number')),
              quote(form_slash_word('of')),
              quote(form_slash_word('arguments')),
            ),
          )
        }
      }
      return (() => {
        const go = (i, res) => {
          if (eq(i, n0)) {
            return res
          } else {
            return go(
              sub(i, n2),
              flist(quote(form_slash_word('if')), at(clauses, sub(i, n2)), at(clauses, dec(i)), res),
            )
          }
        }
        return go
      })()(dec(s), at(clauses, n_1))
    }
  }
}
const and = (...clauses) => {
  {
    const s = size(clauses)
    {
      if (is_zero(s)) {
        return quote(form_slash_list([form_slash_word('i32'), form_slash_word('1')]))
      } else {
        return (() => {
          const go = (i, res) => {
            if (eq(i, n0)) {
              return res
            } else {
              return go(
                dec(i),
                flist(
                  quote(form_slash_word('if')),
                  at(clauses, dec(i)),
                  res,
                  quote(form_slash_list([form_slash_word('i32'), form_slash_word('0')])),
                ),
              )
            }
          }
          return go
        })()(dec(s), at(clauses, n_1))
      }
    }
  }
}
const atom = externs['host']['atom']
const atom_get = externs['host']['atom-get']
const atom_set = externs['host']['atom-set']
const inc_atom = (atom) => {
  {
    const prev_val = atom_get(atom)
    {
      atom_set(atom, inc(prev_val))
      return prev_val
    }
  }
}
const word_counter = atom(n0)
const char_code_to_word = externs['host']['char-code-to-word']
const i32_dot_rem_s = (() => {
  const i32_dot_rem_s = (a, b) => {
    return a % b | 0
  }
  return i32_dot_rem_s
})()
const i32_dot_div_s = (() => {
  const i32_dot_div_s = (a, b) => {
    return (a / b) | 0
  }
  return i32_dot_div_s
})()
const int_to_word = externs['host']['int-to-word']
const i32_to_form = (i) => {
  return flist(quote(form_slash_word('i32')), form_slash_word(int_to_word(i)))
}
const char_code_at = externs['host']['char-code-at']
const word_to_char_code = (w) => {
  return i32_to_form(char_code_at(form_to_word(w), n0))
}
const le_s = (() => {
  const le_s = (a, b) => {
    return (a <= b) | 0
  }
  return le_s
})()
const is_between_inclusive = (lower, c, upper) => {
  if (le_s(lower, c)) {
    return le_s(c, upper)
  } else {
    return 0
  }
}
const word_byte_size = externs['host']['word-byte-size']
const genword_prefix = (prefix) => {
  return form_slash_word(concat_words(concat_words('gen', prefix), int_to_word(inc_atom(word_counter))))
}
const genword = () => {
  return form_slash_word(concat_words('genword', int_to_word(inc_atom(word_counter))))
}
const or = (...clauses) => {
  {
    const s = size(clauses)
    {
      if (is_zero(s)) {
        return quote(form_slash_list([form_slash_word('i32'), form_slash_word('0')]))
      } else {
        return (() => {
          const go = (i, res) => {
            if (eq(i, n0)) {
              return res
            } else {
              return go(
                dec(i),
                (() => {
                  const w = genword()
                  {
                    return flist(
                      quote(form_slash_word('let')),
                      flist(w, at(clauses, dec(i))),
                      flist(quote(form_slash_word('if')), w, w, res),
                    )
                  }
                })(),
              )
            }
          }
          return go
        })()(dec(s), at(clauses, n_1))
      }
    }
  }
}
const form_to_list = (form) => {
  {
    const tmp8 = form
    const tmp9 = tmp8['args']
    switch (externs['host']['get-tag'](tmp8)) {
      case 'form/word': {
        const w = tmp9[0]
        {
          return abort(
            list(
              quote(form_slash_word('form-to-list')),
              quote(form_slash_word('requires')),
              quote(form_slash_word('a')),
              quote(form_slash_word('list')),
              quote(form_slash_word('as')),
              quote(form_slash_word('its')),
              quote(form_slash_word('argument')),
            ),
          )
        }
      }
      case 'form/list': {
        const l = tmp9[0]
        return l
      }
      default:
        throw 'unmatched-match'
    }
  }
}
const is_list = (form) => {
  {
    const tmp10 = form
    const tmp11 = tmp10['args']
    switch (externs['host']['get-tag'](tmp10)) {
      case 'form/list': {
        const l = tmp11[0]
        return n1
      }
      default:
        return n0
    }
  }
}
const option_slash_none = () => externs['host']['make-tagged-value']('option/none', [])
const option_slash_some = (p0) => externs['host']['make-tagged-value']('option/some', [p0])
const none = option_slash_none
const some = option_slash_some
const try_get_word = (form) => {
  {
    const tmp12 = form
    const tmp13 = tmp12['args']
    switch (externs['host']['get-tag'](tmp12)) {
      case 'form/word': {
        const w = tmp13[0]
        return some(w)
      }
      case 'form/list': {
        const l = tmp13[0]
        return none()
      }
      default:
        throw 'unmatched-match'
    }
  }
}
const try_get_list = (form) => {
  {
    const tmp14 = form
    const tmp15 = tmp14['args']
    switch (externs['host']['get-tag'](tmp14)) {
      case 'form/word': {
        const w = tmp15[0]
        return none()
      }
      case 'form/list': {
        const l = tmp15[0]
        return some(l)
      }
      default:
        throw 'unmatched-match'
    }
  }
}
const if_let = (binding_form, true_form, false_form) => {
  {
    const tmp16 = binding_form
    const tmp17 = tmp16['args']
    switch (externs['host']['get-tag'](tmp16)) {
      case 'form/list': {
        const binding = tmp17[0]
        {
          if (eq(n2, size(binding))) {
          } else {
            {
              abort(
                list(
                  quote(form_slash_word('if-let')),
                  quote(form_slash_word('bindings')),
                  quote(form_slash_word('should')),
                  quote(form_slash_word('have')),
                  quote(form_slash_word('exactly')),
                  quote(form_slash_word('two')),
                  quote(form_slash_word('elements')),
                ),
              )
            }
          }
          {
            const v = first(binding)
            const cond = second(binding)
            {
              if (is_word(v)) {
              } else {
                {
                  abort(
                    list(
                      quote(form_slash_word('if-let-option')),
                      quote(form_slash_word('requires')),
                      quote(form_slash_word('a')),
                      quote(form_slash_word('word')),
                      quote(form_slash_word('as')),
                      quote(form_slash_word('the')),
                      quote(form_slash_word('first')),
                      quote(form_slash_word('element')),
                      quote(form_slash_word('of')),
                      quote(form_slash_word('the')),
                      quote(form_slash_word('first')),
                      quote(form_slash_word('argument')),
                    ),
                  )
                }
              }
              return flist(
                quote(form_slash_word('match')),
                cond,
                flist(quote(form_slash_word('option/some')), v),
                true_form,
                false_form,
              )
            }
          }
        }
      }
      default: {
        return abort(
          list(
            quote(form_slash_word('if-let')),
            quote(form_slash_word('requires')),
            quote(form_slash_word('a')),
            quote(form_slash_word('list')),
            quote(form_slash_word('as')),
            quote(form_slash_word('the')),
            quote(form_slash_word('first')),
            quote(form_slash_word('argument')),
          ),
        )
      }
    }
  }
}
const when_let = (binding_form, ...forms) => {
  {
    const tmp18 = binding_form
    const tmp19 = tmp18['args']
    switch (externs['host']['get-tag'](tmp18)) {
      case 'form/list': {
        const binding = tmp19[0]
        {
          if (eq(n2, size(binding))) {
          } else {
            {
              abort(
                list(
                  quote(form_slash_word('when-let')),
                  quote(form_slash_word('bindings')),
                  quote(form_slash_word('should')),
                  quote(form_slash_word('have')),
                  quote(form_slash_word('exactly')),
                  quote(form_slash_word('two')),
                  quote(form_slash_word('elements')),
                ),
              )
            }
          }
          {
            const v = first(binding)
            const cond = second(binding)
            {
              if (is_word(v)) {
              } else {
                {
                  abort(
                    list(
                      quote(form_slash_word('when-let-option')),
                      quote(form_slash_word('requires')),
                      quote(form_slash_word('a')),
                      quote(form_slash_word('word')),
                      quote(form_slash_word('as')),
                      quote(form_slash_word('the')),
                      quote(form_slash_word('first')),
                      quote(form_slash_word('element')),
                      quote(form_slash_word('of')),
                      quote(form_slash_word('the')),
                      quote(form_slash_word('first')),
                      quote(form_slash_word('argument')),
                    ),
                  )
                }
              }
              return flist(
                quote(form_slash_word('match')),
                cond,
                flist(quote(form_slash_word('option/some')), v),
                form_concat(list(quote(form_slash_word('do'))), forms),
                quote(form_slash_list([form_slash_word('do')])),
              )
            }
          }
        }
      }
      default: {
        return abort(
          list(
            quote(form_slash_word('when-let')),
            quote(form_slash_word('requires')),
            quote(form_slash_word('a')),
            quote(form_slash_word('list')),
            quote(form_slash_word('as')),
            quote(form_slash_word('the')),
            quote(form_slash_word('first')),
            quote(form_slash_word('argument')),
          ),
        )
      }
    }
  }
}
const eq_word = (wa, wb) => {
  {
    const sa = word_byte_size(wa)
    const sb = word_byte_size(wb)
    {
      if (eq(sa, sb)) {
        return (() => {
          const go = (i) => {
            if (lt_s(i, sa)) {
              if (eq(char_code_at(wa, i), char_code_at(wb, i))) {
                return go(inc(i))
              } else {
                return n0
              }
            } else {
              return n1
            }
          }
          return go
        })()(n0)
      } else {
        return 0
      }
    }
  }
}
const eq_form_word = (fa, fb) => {
  {
    const tmp20 = fa
    const tmp21 = tmp20['args']
    switch (externs['host']['get-tag'](tmp20)) {
      case 'form/word': {
        const wa = tmp21[0]
        {
          const tmp22 = fb
          const tmp23 = tmp22['args']
          switch (externs['host']['get-tag'](tmp22)) {
            case 'form/word': {
              const wb = tmp23[0]
              return eq_word(wa, wb)
            }
            default:
              return n0
          }
        }
      }
      default:
        return n0
    }
  }
}
const eq_form = (a, b) => {
  {
    const genword0 = eq_form_word(a, b)
    {
      if (genword0) {
        return genword0
      } else {
        if (is_list(a)) {
          if (is_list(b)) {
            {
              const la = form_to_list(a)
              const lb = form_to_list(b)
              const sa = size(la)
              {
                if (eq(sa, size(lb))) {
                  return (() => {
                    const go = (i) => {
                      if (lt_s(i, sa)) {
                        if (eq_form(at(la, i), at(lb, i))) {
                          return go(inc(i))
                        } else {
                          return n0
                        }
                      } else {
                        return n1
                      }
                    }
                    return go
                  })()(n0)
                } else {
                  return 0
                }
              }
            }
          } else {
            return 0
          }
        } else {
          return 0
        }
      }
    }
  }
}
const for_func = (iw, start, increment, end, forms) => {
  if (lt_s(n0, increment)) {
  } else {
    {
      abort(
        list(
          quote(form_slash_word('for-func')),
          quote(form_slash_word('increment')),
          quote(form_slash_word('must')),
          quote(form_slash_word('be')),
          quote(form_slash_word('positive')),
        ),
      )
    }
  }
  {
    const ew = genword()
    const loopw = genword()
    {
      return flist(
        quote(form_slash_word('let')),
        flist(ew, end),
        flist(
          flist(
            quote(form_slash_word('func')),
            loopw,
            flist(iw),
            flist(
              quote(form_slash_word('if')),
              flist(quote(form_slash_word('lt-s')), iw, ew),
              form_concat(
                list(quote(form_slash_word('do'))),
                forms,
                list(flist(loopw, flist(quote(form_slash_word('add')), iw, i32_to_form(increment)))),
              ),
              quote(form_slash_list([form_slash_word('do')])),
            ),
          ),
          start,
        ),
      )
    }
  }
}
const _for = (iw, start, end, ...forms) => {
  return for_func(iw, start, 1, end, forms)
}
const for_3 = (iw, start, end, ...forms) => {
  return for_func(iw, start, 3, end, forms)
}
const for_pair = (iw, start, end, ...forms) => {
  return for_func(iw, start, 2, end, forms)
}
const for_each = (element_var, collection, ...forms) => {
  {
    const iteration_var = genword_prefix('it')
    const col_var = genword_prefix('col')
    const col_size_var = genword_prefix('col-size')
    const loopw = genword_prefix('loop-fun')
    {
      if (is_word(element_var)) {
      } else {
        {
          abort(
            list(
              quote(form_slash_word('for-each')),
              quote(form_slash_word('requires')),
              quote(form_slash_word('a')),
              quote(form_slash_word('word')),
              quote(form_slash_word('as')),
              quote(form_slash_word('the')),
              quote(form_slash_word('first')),
              quote(form_slash_word('argument')),
            ),
          )
        }
      }
      return flist(
        quote(form_slash_word('let')),
        flist(col_var, collection, col_size_var, flist(quote(form_slash_word('size')), col_var)),
        flist(
          flist(
            quote(form_slash_word('func')),
            loopw,
            flist(iteration_var),
            flist(
              quote(form_slash_word('if')),
              flist(quote(form_slash_word('lt-s')), iteration_var, col_size_var),
              form_concat(
                list(quote(form_slash_word('let'))),
                list(flist(element_var, flist(quote(form_slash_word('at')), col_var, iteration_var))),
                list(
                  form_concat(
                    list(quote(form_slash_word('do'))),
                    forms,
                    list(
                      flist(
                        loopw,
                        flist(
                          quote(form_slash_word('add')),
                          iteration_var,
                          quote(form_slash_list([form_slash_word('i32'), form_slash_word('1')])),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              quote(form_slash_list([form_slash_word('do')])),
            ),
          ),
          quote(form_slash_list([form_slash_word('i32'), form_slash_word('0')])),
        ),
      )
    }
  }
}
const list_map = (element_var, collection, form) => {
  {
    if (is_word(element_var)) {
    } else {
      {
        abort(
          list(
            quote(form_slash_word('list-map')),
            quote(form_slash_word('requires')),
            quote(form_slash_word('a')),
            quote(form_slash_word('word')),
            quote(form_slash_word('as')),
            quote(form_slash_word('the')),
            quote(form_slash_word('first')),
            quote(form_slash_word('argument')),
          ),
        )
      }
    }
    return flist(
      quote(form_slash_word('list-map-fn')),
      flist(quote(form_slash_word('func')), genword(), flist(element_var), form),
      collection,
    )
  }
}
const half = (x) => {
  return i32_dot_div_s(x, n2)
}
const transient_kv_map = externs['host']['transient-kv-map']
const set_kv_map = externs['host']['set-kv-map']
const kv_map_size = externs['host']['kv-map-size']
const kv_map_values = externs['host']['kv-map-values']
const mk_word = (w) => {
  return flist(quote(form_slash_word('word')), w)
}
const has = externs['host']['has']
const hasq = (m, w) => {
  return flist(quote(form_slash_word('has')), m, mk_word(w))
}
const get = externs['host']['get']
const getq = (m, w) => {
  return flist(quote(form_slash_word('get')), m, mk_word(w))
}
const try_get = (m, k) => {
  if (has(m, k)) {
    return some(get(m, k))
  } else {
    return none()
  }
}
const try_getq = (m, w) => {
  return flist(quote(form_slash_word('try-get')), m, mk_word(w))
}
const setq = (m, w, v) => {
  return flist(quote(form_slash_word('set-kv-map')), m, flist(quote(form_slash_word('word')), w), v)
}
const is_identical = externs['host']['is-identical']
const syntax_node_location = (row, column) =>
  externs['host']['make-record-from-object']('syntax-node-location', { row: row, column: column })
const syntax_node_location_slash_row = (record) => record['row']
const syntax_node_location_slash_column = (record) => record['column']
const read_file = externs['host']['read-file']
const try_get_syntax_node = externs['host']['try-get-syntax-node']
const syntax_node_content_name = externs['host']['syntax-node-content-name']
const get_syntax_node_location = externs['host']['get-syntax-node-location']
const stdout_print = externs['host']['stdout-print']
const stdout_write_code_point = externs['host']['stdout-write-code-point']
const log_fn = (forms) => {
  if (is_empty(forms)) {
  } else {
    {
      stdout_print(first(forms))
      {
        const gencol2 = rest(forms)
        const gencol_size3 = size(gencol2)
        {
          ;(() => {
            const genloop_fun4 = (genit1) => {
              if (lt_s(genit1, gencol_size3)) {
                {
                  const f = at(gencol2, genit1)
                  {
                    {
                      stdout_write_code_point(32)
                      stdout_print(f)
                      return genloop_fun4(add(genit1, 1))
                    }
                  }
                }
              } else {
                return 'wuns-undefined'
              }
            }
            return genloop_fun4
          })()(0)
        }
      }
    }
  }
  return stdout_write_code_point(10)
}
const log = (...forms) => {
  return flist(quote(form_slash_word('log-fn')), form_slash_list(concat(list(quote(form_slash_word('list'))), forms)))
}
const logq = (...lmsg) => {
  {
    const qforms = list_map_fn(
      (() => {
        const genword5 = (form) => {
          {
            const tmp24 = form
            const tmp25 = tmp24['args']
            switch (externs['host']['get-tag'](tmp24)) {
              case 'form/word': {
                const w = tmp25[0]
                return mk_quote(form)
              }
              case 'form/list': {
                const l = tmp25[0]
                return form
              }
              default:
                throw 'unmatched-match'
            }
          }
        }
        return genword5
      })(),
      lmsg,
    )
    {
      return form_slash_list(
        concat(
          list(quote(form_slash_word('do'))),
          concat(
            is_empty(lmsg)
              ? list()
              : concat(
                  list(flist(quote(form_slash_word('stdout-print')), first(qforms))),
                  list_map_fn(
                    (() => {
                      const genword6 = (qform) => {
                        return flist(
                          quote(form_slash_word('do')),
                          quote(
                            form_slash_list([
                              form_slash_word('stdout-write-code-point'),
                              form_slash_list([form_slash_word('i32'), form_slash_word('32')]),
                            ]),
                          ),
                          flist(quote(form_slash_word('stdout-print')), qform),
                        )
                      }
                      return genword6
                    })(),
                    rest(qforms),
                  ),
                ),
            list(
              quote(
                form_slash_list([
                  form_slash_word('stdout-write-code-point'),
                  form_slash_list([form_slash_word('i32'), form_slash_word('10')]),
                ]),
              ),
            ),
          ),
        ),
      )
    }
  }
}
const try_get_syntax_node_rec = (form) => {
  {
    const tmp26 = try_get_syntax_node(form)
    const tmp27 = tmp26['args']
    switch (externs['host']['get-tag'](tmp26)) {
      case 'option/some': {
        const node = tmp27[0]
        return some(node)
      }
      default: {
        const tmp28 = form
        const tmp29 = tmp28['args']
        switch (externs['host']['get-tag'](tmp28)) {
          case 'form/word': {
            const w = tmp29[0]
            return none()
          }
          case 'form/list': {
            const l = tmp29[0]
            return (() => {
              const go = (i) => {
                if (lt_s(i, size(l))) {
                  {
                    const tmp30 = try_get_syntax_node_rec(at(l, i))
                    const tmp31 = tmp30['args']
                    switch (externs['host']['get-tag'](tmp30)) {
                      case 'option/some': {
                        const node = tmp31[0]
                        return some(node)
                      }
                      default:
                        return go(inc(i))
                    }
                  }
                } else {
                  return none()
                }
              }
              return go
            })()(n0)
          }
          default:
            throw 'unmatched-match'
        }
      }
    }
  }
}
const log_node_location = (node) => {
  {
    const loc = get_syntax_node_location(node)
    {
      stdout_print(syntax_node_content_name(node))
      stdout_write_code_point(58)
      stdout_print(inc(syntax_node_location_slash_row(loc)))
      stdout_write_code_point(58)
      stdout_print(inc(syntax_node_location_slash_column(loc)))
      return stdout_write_code_point(10)
    }
  }
}
const log_location = (form) => {
  {
    const tmp32 = try_get_syntax_node_rec(form)
    const tmp33 = tmp32['args']
    switch (externs['host']['get-tag'](tmp32)) {
      case 'option/some': {
        const node = tmp33[0]
        return log_node_location(node)
      }
      default: {
        log_fn(list(form))
        {
          stdout_print(quote(form_slash_word('log-location')))
          {
            stdout_write_code_point(32)
            stdout_print(quote(form_slash_word('unable')))
          }
          {
            stdout_write_code_point(32)
            stdout_print(quote(form_slash_word('to')))
          }
          {
            stdout_write_code_point(32)
            stdout_print(quote(form_slash_word('log')))
          }
          {
            stdout_write_code_point(32)
            stdout_print(quote(form_slash_word('location')))
          }
          {
            stdout_write_code_point(32)
            stdout_print(quote(form_slash_word('no')))
          }
          {
            stdout_write_code_point(32)
            stdout_print(quote(form_slash_word('node')))
          }
          {
            stdout_write_code_point(32)
            stdout_print(quote(form_slash_word('found')))
          }
          return stdout_write_code_point(10)
        }
      }
    }
  }
}
const byte_array = externs['host']['byte-array']
const byte_array_size = externs['host']['byte-array-size']
const byte_array_get = externs['host']['byte-array-get']
const byte_array_set = externs['host']['byte-array-set']
const byte_array_log_as_string = externs['host']['byte-array-log-as-string']
const word_list_contains = (w, ...words) => {
  {
    const s_words = size(words)
    {
      return (() => {
        const go = (i) => {
          if (lt_s(i, s_words)) {
            if (eq_word(w, at(words, i))) {
              return n1
            } else {
              return go(inc(i))
            }
          } else {
            return n0
          }
        }
        return go
      })()(n0)
    }
  }
}
const is_i32_bin_inst = (w2) => {
  return word_list_contains(
    w2,
    'i32.add',
    'i32.sub',
    'i32.mul',
    'i32.rem-s',
    'i32.div-s',
    'i32.and',
    'i32.or',
    'i32.eq',
    'i32.lt-s',
    'i32.le-s',
  )
}
const is_f64_bin_inst = (w2) => {
  return word_list_contains(w2, 'f64.add', 'f64.sub', 'f64.mul')
}
const is_f64_comp_inst = (w2) => {
  return word_list_contains(w2, 'f64.eq', 'f64.lt', 'f64.le')
}
const pairwise = externs['host']['pairwise']
const triplewise = externs['host']['triplewise']
const _false = 0
const _true = 1
const all = (l, pred) => {
  return (() => {
    const go = (i) => {
      if (lt_s(i, size(l))) {
        if (pred(at(l, i))) {
          return go(inc(i))
        } else {
          return _false
        }
      } else {
        return _true
      }
    }
    return go
  })()(n0)
}
const exists = (l, pred) => {
  return (() => {
    const go = (i) => {
      if (lt_s(i, size(l))) {
        if (pred(at(l, i))) {
          return _true
        } else {
          return go(inc(i))
        }
      } else {
        return _false
      }
    }
    return go
  })()(n0)
}
const growable_list = externs['host']['growable-list']
const push = externs['host']['push']
const clone_growable_to_frozen_list = externs['host']['clone-growable-to-frozen-list']
const pair = (fst, snd) => externs['host']['make-record-from-object']('pair', { fst: fst, snd: snd })
const pair_slash_fst = (record) => record['fst']
const pair_slash_snd = (record) => record['snd']
const pairwise_pairs = (l) => {
  {
    const gl = growable_list()
    {
      {
        const genword9 = dec(size(l))
        {
          ;(() => {
            const genword10 = (i) => {
              if (lt_s(i, genword9)) {
                {
                  push(gl, pair(at(l, i), at(l, inc(i))))
                  return genword10(add(i, 2))
                }
              } else {
                return 'wuns-undefined'
              }
            }
            return genword10
          })()(n0)
        }
      }
      return clone_growable_to_frozen_list(gl)
    }
  }
}
const set = externs['host']['set']
const set_add = externs['host']['set-add']
const set_has = externs['host']['set-has']
const set_to_list = externs['host']['set-to-list']
const filter = (l, pred) => {
  {
    const filtered = growable_list()
    {
      {
        const gencol12 = l
        const gencol_size13 = size(gencol12)
        {
          ;(() => {
            const genloop_fun14 = (genit11) => {
              if (lt_s(genit11, gencol_size13)) {
                {
                  const x = at(gencol12, genit11)
                  {
                    {
                      if (pred(x)) {
                        {
                          push(filtered, x)
                        }
                      } else {
                      }
                      return genloop_fun14(add(genit11, 1))
                    }
                  }
                }
              } else {
                return 'wuns-undefined'
              }
            }
            return genloop_fun14
          })()(0)
        }
      }
      return clone_growable_to_frozen_list(filtered)
    }
  }
}
const result_slash_ok = (p0) => externs['host']['make-tagged-value']('result/ok', [p0])
const result_slash_error = (p0) => externs['host']['make-tagged-value']('result/error', [p0])
const map_result = (l, f) => {
  {
    const gl = growable_list()
    {
      return (() => {
        const go = (i) => {
          if (lt_s(i, size(l))) {
            {
              const tmp34 = f(at(l, i))
              const tmp35 = tmp34['args']
              switch (externs['host']['get-tag'](tmp34)) {
                case 'result/error': {
                  const e = tmp35[0]
                  return result_slash_error(e)
                }
                case 'result/ok': {
                  const v = tmp35[0]
                  {
                    push(gl, v)
                    return go(inc(i))
                  }
                }
                default:
                  throw 'unmatched-match'
              }
            }
          } else {
            return result_slash_ok(clone_growable_to_frozen_list(gl))
          }
        }
        return go
      })()(n0)
    }
  }
}
const current_dir = externs['current-dir']
const performance_now = externs['performance-now']
const to_js_value = externs['js']['identity']
const is_undefined = externs['js']['is-undefined']
const object_to_kv_map = externs['js']['object-to-kv-map']
const kv_map_to_object = externs['js']['kv-map-to-object']
const f = n0
const make_eval_context = externs['interpreter']['make-context']
const macro_expand = externs['interpreter']['macro-expand']
const try_get_macro = externs['interpreter']['try-get-macro']
const interpreter_apply = externs['interpreter']['apply']
const make_evaluator = externs['evaluation']['make-evaluator']
const externs_object_value = externs
const evaluate = externs['evaluation']['evaluate']
const evaluate_result = externs['evaluation']['evaluate-result']
const syntax_word = (word, node) =>
  externs['host']['make-record-from-object']('syntax-word', { word: word, node: node })
const syntax_word_slash_word = (record) => record['word']
const syntax_word_slash_node = (record) => record['node']
const btype_slash_var = (p0) => externs['host']['make-tagged-value']('btype/var', [p0])
const btype_slash_func = (p0, p1, p2) => externs['host']['make-tagged-value']('btype/func', [p0, p1, p2])
const btype_slash_apply = (p0, p1) => externs['host']['make-tagged-value']('btype/apply', [p0, p1])
const btype_slash_error = () => externs['host']['make-tagged-value']('btype/error', [])
const btype_scheme = (type_params, type) =>
  externs['host']['make-record-from-object']('btype-scheme', { 'type-params': type_params, type: type })
const btype_scheme_slash_type_params = (record) => record['type-params']
const btype_scheme_slash_type = (record) => record['type']
const type_decl_kind_slash_union = (p0) => externs['host']['make-tagged-value']('type-decl-kind/union', [p0])
const type_decl_kind_slash_record = (p0) => externs['host']['make-tagged-value']('type-decl-kind/record', [p0])
const type_decl = (name, type_params, kind) =>
  externs['host']['make-record-from-object']('type-decl', { name: name, 'type-params': type_params, kind: kind })
const type_decl_slash_name = (record) => record['name']
const type_decl_slash_type_params = (record) => record['type-params']
const type_decl_slash_kind = (record) => record['kind']
const match_pattern = (ctor, params) =>
  externs['host']['make-record-from-object']('match-pattern', { ctor: ctor, params: params })
const match_pattern_slash_ctor = (record) => record['ctor']
const match_pattern_slash_params = (record) => record['params']
const literal_slash_i32 = (p0) => externs['host']['make-tagged-value']('literal/i32', [p0])
const literal_slash_f64 = (p0) => externs['host']['make-tagged-value']('literal/f64', [p0])
const literal_slash_word = (p0) => externs['host']['make-tagged-value']('literal/word', [p0])
const bfunc = (name, parameters, rest_param, body) =>
  externs['host']['make-record-from-object']('bfunc', {
    name: name,
    parameters: parameters,
    'rest-param': rest_param,
    body: body,
  })
const bfunc_slash_name = (record) => record['name']
const bfunc_slash_parameters = (record) => record['parameters']
const bfunc_slash_rest_param = (record) => record['rest-param']
const bfunc_slash_body = (record) => record['body']
const bexp_slash_var = (p0) => externs['host']['make-tagged-value']('bexp/var', [p0])
const bexp_slash_literal = (p0) => externs['host']['make-tagged-value']('bexp/literal', [p0])
const bexp_slash_intrinsic = (p0) => externs['host']['make-tagged-value']('bexp/intrinsic', [p0])
const bexp_slash_extern = (p0) => externs['host']['make-tagged-value']('bexp/extern', [p0])
const bexp_slash_func = (p0) => externs['host']['make-tagged-value']('bexp/func', [p0])
const bexp_slash_if = (p0, p1, p2) => externs['host']['make-tagged-value']('bexp/if', [p0, p1, p2])
const bexp_slash_do = (p0) => externs['host']['make-tagged-value']('bexp/do', [p0])
const bexp_slash_switch = (p0, p1, p2) => externs['host']['make-tagged-value']('bexp/switch', [p0, p1, p2])
const bexp_slash_match = (p0, p1, p2) => externs['host']['make-tagged-value']('bexp/match', [p0, p1, p2])
const bexp_slash_letfn = (p0, p1) => externs['host']['make-tagged-value']('bexp/letfn', [p0, p1])
const bexp_slash_let = (p0, p1) => externs['host']['make-tagged-value']('bexp/let', [p0, p1])
const bexp_slash_loop = (p0, p1) => externs['host']['make-tagged-value']('bexp/loop', [p0, p1])
const bexp_slash_continue = (p0) => externs['host']['make-tagged-value']('bexp/continue', [p0])
const bexp_slash_call = (p0, p1) => externs['host']['make-tagged-value']('bexp/call', [p0, p1])
const bexp_slash_call_fexpr = (p0, p1) => externs['host']['make-tagged-value']('bexp/call-fexpr', [p0, p1])
const bexp_slash_type_anno = (p0, p1) => externs['host']['make-tagged-value']('bexp/type-anno', [p0, p1])
const bdefunc_kind_slash_func = () => externs['host']['make-tagged-value']('bdefunc-kind/func', [])
const bdefunc_kind_slash_fexpr = () => externs['host']['make-tagged-value']('bdefunc-kind/fexpr', [])
const bdefunc_kind_slash_macro = () => externs['host']['make-tagged-value']('bdefunc-kind/macro', [])
const btop_slash_defunc = (p0, p1) => externs['host']['make-tagged-value']('btop/defunc', [p0, p1])
const btop_slash_type = (p0) => externs['host']['make-tagged-value']('btop/type', [p0])
const btop_slash_def = (p0, p1) => externs['host']['make-tagged-value']('btop/def', [p0, p1])
const btop_slash_do = (p0) => externs['host']['make-tagged-value']('btop/do', [p0])
const btop_slash_export = (p0) => externs['host']['make-tagged-value']('btop/export', [p0])
const bexp_recur = (f) => {
  return (() => {
    const go = (bform) => {
      if (f(bform)) {
        {
          {
            const tmp36 = bform
            const tmp37 = tmp36['args']
            switch (externs['host']['get-tag'](tmp36)) {
              case 'bexp/var': {
                const sw = tmp37[0]
                return 'wuns-undefined'
              }
              case 'bexp/literal': {
                const l = tmp37[0]
                return 'wuns-undefined'
              }
              case 'bexp/intrinsic': {
                const i = tmp37[0]
                return 'wuns-undefined'
              }
              case 'bexp/call': {
                const f = tmp37[0]
                const args = tmp37[1]
                {
                  go(f)
                  {
                    const gencol1 = args
                    const gencol_size2 = size(gencol1)
                    {
                      return (() => {
                        const genloop_fun3 = (genit0) => {
                          if (lt_s(genit0, gencol_size2)) {
                            {
                              const a = at(gencol1, genit0)
                              {
                                {
                                  go(a)
                                  return genloop_fun3(add(genit0, 1))
                                }
                              }
                            }
                          } else {
                            return 'wuns-undefined'
                          }
                        }
                        return genloop_fun3
                      })()(0)
                    }
                  }
                }
              }
              case 'bexp/if': {
                const c = tmp37[0]
                const t = tmp37[1]
                const e = tmp37[2]
                {
                  go(c)
                  go(t)
                  return go(e)
                }
              }
              case 'bexp/do': {
                const bs = tmp37[0]
                {
                  const gencol5 = bs
                  const gencol_size6 = size(gencol5)
                  {
                    return (() => {
                      const genloop_fun7 = (genit4) => {
                        if (lt_s(genit4, gencol_size6)) {
                          {
                            const b = at(gencol5, genit4)
                            {
                              {
                                go(b)
                                return genloop_fun7(add(genit4, 1))
                              }
                            }
                          }
                        } else {
                          return 'wuns-undefined'
                        }
                      }
                      return genloop_fun7
                    })()(0)
                  }
                }
              }
              case 'bexp/let': {
                const bs = tmp37[0]
                const body = tmp37[1]
                {
                  {
                    const gencol9 = bs
                    const gencol_size10 = size(gencol9)
                    {
                      ;(() => {
                        const genloop_fun11 = (genit8) => {
                          if (lt_s(genit8, gencol_size10)) {
                            {
                              const b = at(gencol9, genit8)
                              {
                                {
                                  go(pair_slash_snd(b))
                                  return genloop_fun11(add(genit8, 1))
                                }
                              }
                            }
                          } else {
                            return 'wuns-undefined'
                          }
                        }
                        return genloop_fun11
                      })()(0)
                    }
                  }
                  {
                    const gencol13 = body
                    const gencol_size14 = size(gencol13)
                    {
                      return (() => {
                        const genloop_fun15 = (genit12) => {
                          if (lt_s(genit12, gencol_size14)) {
                            {
                              const b = at(gencol13, genit12)
                              {
                                {
                                  go(b)
                                  return genloop_fun15(add(genit12, 1))
                                }
                              }
                            }
                          } else {
                            return 'wuns-undefined'
                          }
                        }
                        return genloop_fun15
                      })()(0)
                    }
                  }
                }
              }
              case 'bexp/loop': {
                const bs = tmp37[0]
                const body = tmp37[1]
                {
                  {
                    const gencol17 = bs
                    const gencol_size18 = size(gencol17)
                    {
                      ;(() => {
                        const genloop_fun19 = (genit16) => {
                          if (lt_s(genit16, gencol_size18)) {
                            {
                              const b = at(gencol17, genit16)
                              {
                                {
                                  go(pair_slash_snd(b))
                                  return genloop_fun19(add(genit16, 1))
                                }
                              }
                            }
                          } else {
                            return 'wuns-undefined'
                          }
                        }
                        return genloop_fun19
                      })()(0)
                    }
                  }
                  {
                    const gencol21 = body
                    const gencol_size22 = size(gencol21)
                    {
                      return (() => {
                        const genloop_fun23 = (genit20) => {
                          if (lt_s(genit20, gencol_size22)) {
                            {
                              const b = at(gencol21, genit20)
                              {
                                {
                                  go(b)
                                  return genloop_fun23(add(genit20, 1))
                                }
                              }
                            }
                          } else {
                            return 'wuns-undefined'
                          }
                        }
                        return genloop_fun23
                      })()(0)
                    }
                  }
                }
              }
              case 'bexp/continue': {
                const ass = tmp37[0]
                {
                  const gencol25 = ass
                  const gencol_size26 = size(gencol25)
                  {
                    return (() => {
                      const genloop_fun27 = (genit24) => {
                        if (lt_s(genit24, gencol_size26)) {
                          {
                            const as = at(gencol25, genit24)
                            {
                              {
                                go(pair_slash_snd(as))
                                return genloop_fun27(add(genit24, 1))
                              }
                            }
                          }
                        } else {
                          return 'wuns-undefined'
                        }
                      }
                      return genloop_fun27
                    })()(0)
                  }
                }
              }
              default: {
                log_fn(list(bform))
                {
                  return abort(
                    list(
                      quote(form_slash_word('bform-recur')),
                      quote(form_slash_word('not')),
                      quote(form_slash_word('implemented')),
                    ),
                  )
                }
              }
            }
          }
        }
      } else {
        return 'wuns-undefined'
      }
    }
    return go
  })()
}
const local_var_kind_slash_param = (p0, p1) => externs['host']['make-tagged-value']('local-var-kind/param', [p0, p1])
const local_var_kind_slash_match_param = () => externs['host']['make-tagged-value']('local-var-kind/match-param', [])
const local_var_kind_slash_let = () => externs['host']['make-tagged-value']('local-var-kind/let', [])
const local_var_kind_slash_loop = () => externs['host']['make-tagged-value']('local-var-kind/loop', [])
const local_var_kind_slash_letfn = () => externs['host']['make-tagged-value']('local-var-kind/letfn', [])
const local_var_kind_slash_func_internal_self = () =>
  externs['host']['make-tagged-value']('local-var-kind/func-internal-self', [])
const local_context_kind_slash_let = () => externs['host']['make-tagged-value']('local-context-kind/let', [])
const local_context_kind_slash_loop = () => externs['host']['make-tagged-value']('local-context-kind/loop', [])
const local_context_kind_slash_letfn = () => externs['host']['make-tagged-value']('local-context-kind/letfn', [])
const local_context_kind_slash_match = () => externs['host']['make-tagged-value']('local-context-kind/match', [])
const local_context_kind_slash_func = () => externs['host']['make-tagged-value']('local-context-kind/func', [])
const local_context = (vars, kind) =>
  externs['host']['make-record-from-object']('local-context', { vars: vars, kind: kind })
const local_context_slash_vars = (record) => record['vars']
const local_context_slash_kind = (record) => record['kind']
const local_stack_slash_empty = () => externs['host']['make-tagged-value']('local-stack/empty', [])
const local_stack_slash_frame = (p0, p1) => externs['host']['make-tagged-value']('local-stack/frame', [p0, p1])
const try_get_local = (lstack, w) => {
  {
    const tmp38 = lstack
    const tmp39 = tmp38['args']
    switch (externs['host']['get-tag'](tmp38)) {
      case 'local-stack/empty': {
        return none()
      }
      case 'local-stack/frame': {
        const outer = tmp39[0]
        const lctx = tmp39[1]
        {
          const tmp40 = try_get(local_context_slash_vars(lctx), w)
          const tmp41 = tmp40['args']
          switch (externs['host']['get-tag'](tmp40)) {
            case 'option/none': {
              return try_get_local(outer, w)
            }
            case 'option/some': {
              const kind = tmp41[0]
              return some(kind)
            }
            default:
              throw 'unmatched-match'
          }
        }
      }
      default:
        throw 'unmatched-match'
    }
  }
}
const record_desc = (name, type_params, fields) =>
  externs['host']['make-record-from-object']('record-desc', { name: name, 'type-params': type_params, fields: fields })
const record_desc_slash_name = (record) => record['name']
const record_desc_slash_type_params = (record) => record['type-params']
const record_desc_slash_fields = (record) => record['fields']
const union_desc = (name, type_params, ctors) =>
  externs['host']['make-record-from-object']('union-desc', { name: name, 'type-params': type_params, ctors: ctors })
const union_desc_slash_name = (record) => record['name']
const union_desc_slash_type_params = (record) => record['type-params']
const union_desc_slash_ctors = (record) => record['ctors']
const def_desc_slash_defunc = (p0) => externs['host']['make-tagged-value']('def-desc/defunc', [p0])
const def_desc_slash_any = () => externs['host']['make-tagged-value']('def-desc/any', [])
const def_desc_slash_type = () => externs['host']['make-tagged-value']('def-desc/type', [])
const def_desc_slash_union_ctor = (p0, p1) => externs['host']['make-tagged-value']('def-desc/union-ctor', [p0, p1])
const def_desc_slash_record_ctor = () => externs['host']['make-tagged-value']('def-desc/record-ctor', [])
const def_desc_slash_record_proj = (p0, p1) => externs['host']['make-tagged-value']('def-desc/record-proj', [p0, p1])
const report_message = (message, form) =>
  externs['host']['make-record-from-object']('report-message', { message: message, form: form })
const report_message_slash_message = (record) => record['message']
const report_message_slash_form = (record) => record['form']
const builtin_type_arity_ok = (type_name, n_of_type_args) => {
  switch (type_name) {
    case 'tuple':
      return some(_true)
    case 'i32':
    case 'f64':
    case 'word':
      return some(eq(n_of_type_args, n0))
    case 'list':
      return some(eq(n_of_type_args, n1))
    default:
      return none()
  }
}
const is_reserved_type_name = (type_name) => {
  switch (type_name) {
    case 'type-scheme':
    case 'func':
      return _true
    default: {
      const tmp42 = builtin_type_arity_ok(type_name, n0)
      const tmp43 = tmp42['args']
      switch (externs['host']['get-tag'](tmp42)) {
        case 'option/some': {
          const arity = tmp43[0]
          return _true
        }
        default:
          return _false
      }
    }
  }
}
const log_report_message = (error) => {
  log_location(report_message_slash_form(error))
  return log_fn(list(report_message_slash_message(error)))
}
const sword = (form) => {
  {
    const tmp44 = try_get_word(form)
    const tmp45 = tmp44['args']
    switch (externs['host']['get-tag'](tmp44)) {
      case 'option/some': {
        const w = tmp45[0]
        return syntax_word(w, try_get_syntax_node(form))
      }
      default: {
        return abort(
          list(quote(form_slash_word('sword')), quote(form_slash_word('expected')), quote(form_slash_word('word'))),
        )
      }
    }
  }
}
const try_get_enclosing_loop_context = (lstack) => {
  {
    const tmp46 = lstack
    const tmp47 = tmp46['args']
    switch (externs['host']['get-tag'](tmp46)) {
      case 'local-stack/empty': {
        return none()
      }
      case 'local-stack/frame': {
        const outer = tmp47[0]
        const lctx = tmp47[1]
        {
          const tmp48 = local_context_slash_kind(lctx)
          const tmp49 = tmp48['args']
          switch (externs['host']['get-tag'](tmp48)) {
            case 'local-context-kind/loop': {
              return some(lctx)
            }
            case 'local-context-kind/func': {
              return none()
            }
            default:
              return try_get_enclosing_loop_context(outer)
          }
        }
      }
      default:
        throw 'unmatched-match'
    }
  }
}
const form_to_ast_converter = (form_to_ast, errors, node_to_ldesc, node_to_def_desc, bst_to_form) =>
  externs['host']['make-record-from-object']('form-to-ast-converter', {
    'form-to-ast': form_to_ast,
    errors: errors,
    'node-to-ldesc': node_to_ldesc,
    'node-to-def-desc': node_to_def_desc,
    'bst-to-form': bst_to_form,
  })
const form_to_ast_converter_slash_form_to_ast = (record) => record['form-to-ast']
const form_to_ast_converter_slash_errors = (record) => record['errors']
const form_to_ast_converter_slash_node_to_ldesc = (record) => record['node-to-ldesc']
const form_to_ast_converter_slash_node_to_def_desc = (record) => record['node-to-def-desc']
const form_to_ast_converter_slash_bst_to_form = (record) => record['bst-to-form']
const mk_form_to_ast = () => {
  {
    const eval_ctx = make_eval_context(current_dir())
    const evaluator = make_evaluator(externs_object_value, eval_ctx)
    const errors = growable_list()
    const push_error = (() => {
      const pe = (form, msg) => {
        return push(errors, report_message(msg, form))
      }
      return pe
    })()
    const eval_form = (() => {
      const ef = (top_form) => {
        {
          const tmp50 = evaluate_result(evaluator, top_form)
          const tmp51 = tmp50['args']
          switch (externs['host']['get-tag'](tmp50)) {
            case 'result/error': {
              const error = tmp51[0]
              return push_error(
                top_form,
                quote(
                  form_slash_list([
                    form_slash_word('runtime'),
                    form_slash_word('error'),
                    form_slash_word('when'),
                    form_slash_word('evaluating'),
                    form_slash_word('form'),
                  ]),
                ),
              )
            }
            case 'result/ok': {
              const _ = tmp51[0]
              return 'wuns-undefined'
            }
            default:
              throw 'unmatched-match'
          }
        }
      }
      return ef
    })()
    const def_ctx = transient_kv_map()
    const node_to_ldesc = transient_kv_map()
    const node_to_def_desc = transient_kv_map()
    const try_get_word_report = (() => {
      const gw = (form) => {
        {
          const tmp52 = form
          const tmp53 = tmp52['args']
          switch (externs['host']['get-tag'](tmp52)) {
            case 'form/word': {
              const w = tmp53[0]
              return some(w)
            }
            default: {
              push_error(form, quote(form_slash_list([form_slash_word('expected'), form_slash_word('word')])))
              return none()
            }
          }
        }
      }
      return gw
    })()
    const get_word = (() => {
      const gw = (form) => {
        {
          const tmp54 = try_get_word_report(form)
          const tmp55 = tmp54['args']
          switch (externs['host']['get-tag'](tmp54)) {
            case 'option/some': {
              const w = tmp55[0]
              return w
            }
            default:
              return '---word-not-found---'
          }
        }
      }
      return gw
    })()
    const get_sword = (() => {
      const gw = (form) => {
        {
          const tmp56 = try_get_word_report(form)
          const tmp57 = tmp56['args']
          switch (externs['host']['get-tag'](tmp56)) {
            case 'option/some': {
              const w = tmp57[0]
              return sword(form)
            }
            default:
              return syntax_word('---word-not-found---', none())
          }
        }
      }
      return gw
    })()
    const get_list = (() => {
      const gl = (form) => {
        {
          const tmp58 = form
          const tmp59 = tmp58['args']
          switch (externs['host']['get-tag'](tmp58)) {
            case 'form/list': {
              const l = tmp59[0]
              return l
            }
            default: {
              push_error(form, quote(form_slash_list([form_slash_word('expected'), form_slash_word('list')])))
              return list()
            }
          }
        }
      }
      return gl
    })()
    const set_local = (() => {
      const sl = (lvars, f, kind) => {
        {
          const w = get_word(f)
          {
            if (has(lvars, w)) {
              {
                push_error(f, quote(form_slash_list([form_slash_word('redeclaring'), form_slash_word('local')])))
              }
            } else {
            }
            return set_kv_map(lvars, w, kind)
          }
        }
      }
      return sl
    })()
    const set_def = (() => {
      const sd = (f, kind) => {
        {
          const w = get_word(f)
          {
            if (has(def_ctx, w)) {
              {
                push_error(f, quote(form_slash_list([form_slash_word('redefing'), form_slash_word('def')])))
              }
            } else {
            }
            return set_kv_map(def_ctx, w, kind)
          }
        }
      }
      return sd
    })()
    const type_ctx = transient_kv_map()
    const set_type = (() => {
      const st = (f, arity) => {
        {
          const w = get_word(f)
          {
            if (is_reserved_type_name(w)) {
              return push_error(
                f,
                quote(
                  form_slash_list([
                    form_slash_word('type'),
                    form_slash_word('name'),
                    form_slash_word('is'),
                    form_slash_word('reserved'),
                  ]),
                ),
              )
            } else {
              {
                if (has(type_ctx, w)) {
                  {
                    push_error(f, quote(form_slash_list([form_slash_word('redefing'), form_slash_word('type')])))
                  }
                } else {
                }
                return set_kv_map(type_ctx, w, arity)
              }
            }
          }
        }
      }
      return st
    })()
    const parse_param_list = (() => {
      const parse_param_list = (param_list) => {
        {
          const n_of_param_forms = size(param_list)
          {
            if (
              lt_s(n1, n_of_param_forms)
                ? (() => {
                    {
                      const tmp60 = try_get_word(at(param_list, n_2))
                      const tmp61 = tmp60['args']
                      switch (externs['host']['get-tag'](tmp60)) {
                        case 'option/some': {
                          const but_last_param = tmp61[0]
                          return eq_word(but_last_param, '..')
                        }
                        default:
                          return _false
                      }
                    }
                  })()
                : 0
            ) {
              return pair(slice(param_list, n0, sub(n_of_param_forms, n2)), some(last(param_list)))
            } else {
              return pair(param_list, none())
            }
          }
        }
      }
      return parse_param_list
    })()
    const bst_to_form = transient_kv_map()
    const insert_form = (() => {
      const i = (form, bform) => {
        {
          set_kv_map(bst_to_form, to_js_value(bform), form)
          return bform
        }
      }
      return i
    })()
    {
      return (() => {
        const mk_form_to_type = (type_param_map) => {
          return (() => {
            const f2t = (form) => {
              {
                const tmp62 = form
                const tmp63 = tmp62['args']
                switch (externs['host']['get-tag'](tmp62)) {
                  case 'form/word': {
                    const w = tmp63[0]
                    {
                      const tmp64 = builtin_type_arity_ok(w, n0)
                      const tmp65 = tmp64['args']
                      switch (externs['host']['get-tag'](tmp64)) {
                        case 'option/some': {
                          const arity_ok = tmp65[0]
                          {
                            if (arity_ok) {
                            } else {
                              {
                                push_error(
                                  form,
                                  quote(
                                    form_slash_list([
                                      form_slash_word('wrong'),
                                      form_slash_word('number'),
                                      form_slash_word('of'),
                                      form_slash_word('type'),
                                      form_slash_word('arguments'),
                                      form_slash_word('to'),
                                      form_slash_word('builtin'),
                                    ]),
                                  ),
                                )
                              }
                            }
                            return btype_slash_apply(sword(form), list())
                          }
                        }
                        default:
                          if (has(type_param_map, w)) {
                            return btype_slash_var(sword(form))
                          } else {
                            {
                              const tmp66 = try_get(type_ctx, w)
                              const tmp67 = tmp66['args']
                              switch (externs['host']['get-tag'](tmp66)) {
                                case 'option/some': {
                                  const arity = tmp67[0]
                                  {
                                    if (eq(n0, arity)) {
                                    } else {
                                      {
                                        push_error(
                                          form,
                                          quote(
                                            form_slash_list([
                                              form_slash_word('wrong'),
                                              form_slash_word('number'),
                                              form_slash_word('of'),
                                              form_slash_word('type'),
                                              form_slash_word('arguments'),
                                            ]),
                                          ),
                                        )
                                      }
                                    }
                                    return btype_slash_apply(sword(form), list())
                                  }
                                }
                                default: {
                                  push_error(
                                    form,
                                    quote(
                                      form_slash_list([
                                        form_slash_word('undefined'),
                                        form_slash_word('type'),
                                        form_slash_word('or'),
                                        form_slash_word('type'),
                                        form_slash_word('param'),
                                      ]),
                                    ),
                                  )
                                  return btype_slash_var(sword(form))
                                }
                              }
                            }
                          }
                      }
                    }
                  }
                  case 'form/list': {
                    const l = tmp63[0]
                    if (is_empty(l)) {
                      {
                        push_error(
                          form,
                          quote(
                            form_slash_list([form_slash_word('type'), form_slash_word('is'), form_slash_word('empty')]),
                          ),
                        )
                        return btype_slash_error()
                      }
                    } else {
                      {
                        const fw = get_word(first(l))
                        {
                          switch (fw) {
                            case 'type-scheme': {
                              push_error(
                                form,
                                quote(
                                  form_slash_list([
                                    form_slash_word('does'),
                                    form_slash_word('not'),
                                    form_slash_word('accept'),
                                    form_slash_word('type-scheme'),
                                  ]),
                                ),
                              )
                              return btype_slash_error()
                            }
                            case 'func':
                              if (lt_s(size(l), n3)) {
                                {
                                  push_error(
                                    form,
                                    quote(
                                      form_slash_list([
                                        form_slash_word('func'),
                                        form_slash_word('expects'),
                                        form_slash_word('a'),
                                        form_slash_word('parameter'),
                                        form_slash_word('list'),
                                        form_slash_word('and'),
                                        form_slash_word('a'),
                                        form_slash_word('return'),
                                        form_slash_word('type'),
                                      ]),
                                    ),
                                  )
                                  return btype_slash_error()
                                }
                              } else {
                                {
                                  const parsed_params = parse_param_list(get_list(second(l)))
                                  {
                                    return btype_slash_func(
                                      list_map_fn(
                                        (() => {
                                          const genword28 = (p) => {
                                            return f2t(p)
                                          }
                                          return genword28
                                        })(),
                                        pair_slash_fst(parsed_params),
                                      ),
                                      (() => {
                                        {
                                          const tmp68 = pair_slash_snd(parsed_params)
                                          const tmp69 = tmp68['args']
                                          switch (externs['host']['get-tag'](tmp68)) {
                                            case 'option/some': {
                                              const rest_param = tmp69[0]
                                              return some(f2t(rest_param))
                                            }
                                            default:
                                              return none()
                                          }
                                        }
                                      })(),
                                      f2t(third(l)),
                                    )
                                  }
                                }
                              }
                            default: {
                              const n_of_args = dec(size(l))
                              {
                                {
                                  const tmp70 = builtin_type_arity_ok(fw, n_of_args)
                                  const tmp71 = tmp70['args']
                                  switch (externs['host']['get-tag'](tmp70)) {
                                    case 'option/some': {
                                      const arity_ok = tmp71[0]
                                      if (arity_ok) {
                                      } else {
                                        {
                                          push_error(
                                            form,
                                            quote(
                                              form_slash_list([
                                                form_slash_word('wrong'),
                                                form_slash_word('number'),
                                                form_slash_word('of'),
                                                form_slash_word('type'),
                                                form_slash_word('arguments'),
                                                form_slash_word('to'),
                                                form_slash_word('builtin'),
                                              ]),
                                            ),
                                          )
                                        }
                                      }
                                      break
                                    }
                                    default: {
                                      const tmp72 = try_get(type_ctx, fw)
                                      const tmp73 = tmp72['args']
                                      switch (externs['host']['get-tag'](tmp72)) {
                                        case 'option/some': {
                                          const arity = tmp73[0]
                                          if (eq(n_of_args, arity)) {
                                          } else {
                                            {
                                              push_error(
                                                form,
                                                quote(
                                                  form_slash_list([
                                                    form_slash_word('wrong'),
                                                    form_slash_word('number'),
                                                    form_slash_word('of'),
                                                    form_slash_word('type'),
                                                    form_slash_word('arguments'),
                                                  ]),
                                                ),
                                              )
                                            }
                                          }
                                          break
                                        }
                                        default:
                                          push_error(
                                            form,
                                            quote(
                                              form_slash_list([form_slash_word('undefined'), form_slash_word('type')]),
                                            ),
                                          )
                                      }
                                    }
                                  }
                                }
                                return btype_slash_apply(
                                  sword(first(l)),
                                  list_map_fn(
                                    (() => {
                                      const genword29 = (arg) => {
                                        return f2t(arg)
                                      }
                                      return genword29
                                    })(),
                                    rest(l),
                                  ),
                                )
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  default:
                    throw 'unmatched-match'
                }
              }
            }
            return f2t
          })()
        }
        const form_to_type = (form) => {
          return mk_form_to_type(transient_kv_map())(form)
        }
        const form_to_type_param_list = (form) => {
          {
            const type_param_words = growable_list()
            const word_to_form = transient_kv_map()
            {
              {
                const gencol31 = get_list(form)
                const gencol_size32 = size(gencol31)
                {
                  ;(() => {
                    const genloop_fun33 = (genit30) => {
                      if (lt_s(genit30, gencol_size32)) {
                        {
                          const tpf = at(gencol31, genit30)
                          {
                            {
                              {
                                const tmp74 = try_get_word_report(tpf)
                                const tmp75 = tmp74['args']
                                switch (externs['host']['get-tag'](tmp74)) {
                                  case 'option/some': {
                                    const tpw = tmp75[0]
                                    {
                                      {
                                        if (has(word_to_form, tpw)) {
                                          {
                                            push_error(
                                              tpf,
                                              quote(
                                                form_slash_list([
                                                  form_slash_word('duplicate'),
                                                  form_slash_word('type'),
                                                  form_slash_word('param'),
                                                ]),
                                              ),
                                            )
                                          }
                                        } else {
                                        }
                                        if (is_reserved_type_name(tpw)) {
                                          {
                                            push_error(
                                              tpf,
                                              quote(
                                                form_slash_list([
                                                  form_slash_word('reserved'),
                                                  form_slash_word('types'),
                                                  form_slash_word('cannot'),
                                                  form_slash_word('be'),
                                                  form_slash_word('used'),
                                                  form_slash_word('as'),
                                                  form_slash_word('type'),
                                                  form_slash_word('params'),
                                                ]),
                                              ),
                                            )
                                          }
                                        } else {
                                        }
                                        set_kv_map(word_to_form, tpw, tpf)
                                        push(type_param_words, sword(tpf))
                                      }
                                    }
                                    break
                                  }
                                  default:
                                }
                              }
                              return genloop_fun33(add(genit30, 1))
                            }
                          }
                        }
                      } else {
                        return 'wuns-undefined'
                      }
                    }
                    return genloop_fun33
                  })()(0)
                }
              }
              return pair(clone_growable_to_frozen_list(type_param_words), word_to_form)
            }
          }
        }
        const form_to_type_scheme = (form) => {
          {
            const tmp76 = form
            const tmp77 = tmp76['args']
            switch (externs['host']['get-tag'](tmp76)) {
              case 'form/word': {
                const w = tmp77[0]
                return btype_scheme(list(), form_to_type(form))
              }
              case 'form/list': {
                const l = tmp77[0]
                if (is_empty(l)) {
                  {
                    push_error(
                      form,
                      quote(
                        form_slash_list([form_slash_word('type'), form_slash_word('is'), form_slash_word('empty')]),
                      ),
                    )
                    return btype_scheme(list(), btype_slash_error())
                  }
                } else {
                  if (eq_word(get_word(first(l)), 'type-scheme')) {
                    {
                      const param_pair = form_to_type_param_list(second(l))
                      {
                        return btype_scheme(
                          pair_slash_fst(param_pair),
                          mk_form_to_type(pair_slash_snd(param_pair))(third(l)),
                        )
                      }
                    }
                  } else {
                    return btype_scheme(list(), form_to_type(form))
                  }
                }
              }
              default:
                throw 'unmatched-match'
            }
          }
        }
        const form_to_func = (lstack, form) => {
          {
            const form_list = get_list(form)
            const _ = lt_s(size(form_list), n3)
              ? (() => {
                  {
                    return push_error(
                      form,
                      quote(
                        form_slash_list([
                          form_slash_word('function-like'),
                          form_slash_word('form'),
                          form_slash_word('expected'),
                          form_slash_word('at'),
                          form_slash_word('least'),
                          form_slash_word('3'),
                          form_slash_word('elements'),
                        ]),
                      ),
                    )
                  }
                })()
              : (() => {
                  return 'wuns-undefined'
                })()
            const name = get_word(second(form_list))
            const parsed_params = parse_param_list(get_list(third(form_list)))
            const regular_param_forms = pair_slash_fst(parsed_params)
            const opt_rest_param = pair_slash_snd(parsed_params)
            const lvars = transient_kv_map()
            const lctx = local_context(lvars, local_context_kind_slash_func())
            const new_lstack = local_stack_slash_frame(lstack, lctx)
            const counter_atom = atom(n0)
            {
              set_local(lvars, second(form_list), local_var_kind_slash_func_internal_self())
              {
                const gencol35 = regular_param_forms
                const gencol_size36 = size(gencol35)
                {
                  ;(() => {
                    const genloop_fun37 = (genit34) => {
                      if (lt_s(genit34, gencol_size36)) {
                        {
                          const param = at(gencol35, genit34)
                          {
                            {
                              set_local(lvars, param, local_var_kind_slash_param(name, inc_atom(counter_atom)))
                              return genloop_fun37(add(genit34, 1))
                            }
                          }
                        }
                      } else {
                        return 'wuns-undefined'
                      }
                    }
                    return genloop_fun37
                  })()(0)
                }
              }
              {
                const tmp78 = opt_rest_param
                const tmp79 = tmp78['args']
                switch (externs['host']['get-tag'](tmp78)) {
                  case 'option/some': {
                    const rest_param = tmp79[0]
                    {
                      set_local(lvars, rest_param, local_var_kind_slash_param(name, inc_atom(counter_atom)))
                    }
                    break
                  }
                  default:
                }
              }
              return insert_form(
                form,
                bfunc(
                  sword(second(form_list)),
                  list_map_fn(
                    (() => {
                      const genword38 = (param) => {
                        return sword(param)
                      }
                      return genword38
                    })(),
                    regular_param_forms,
                  ),
                  (() => {
                    {
                      const tmp80 = opt_rest_param
                      const tmp81 = tmp80['args']
                      switch (externs['host']['get-tag'](tmp80)) {
                        case 'option/none': {
                          return option_slash_none()
                        }
                        case 'option/some': {
                          const v = tmp81[0]
                          return option_slash_some(sword(v))
                        }
                        default:
                          throw 'unmatched-match'
                      }
                    }
                  })(),
                  list_map_fn(
                    (() => {
                      const genword39 = (f) => {
                        return form_to_ast(new_lstack, f)
                      }
                      return genword39
                    })(),
                    slice(form_list, n3, size(form_list)),
                  ),
                ),
              )
            }
          }
        }
        const form_to_top = (form) => {
          {
            const report_error = (() => {
              const r = (msg) => {
                return push_error(form, msg)
              }
              return r
            })()
            {
              return insert_form(
                form,
                (() => {
                  {
                    const tmp82 = form
                    const tmp83 = tmp82['args']
                    switch (externs['host']['get-tag'](tmp82)) {
                      case 'form/word': {
                        const w = tmp83[0]
                        {
                          return abort(
                            list(
                              quote(form_slash_word('form-to-top')),
                              quote(form_slash_word('word')),
                              quote(form_slash_word('form')),
                              quote(form_slash_word('not')),
                              quote(form_slash_word('implemented')),
                            ),
                          )
                        }
                      }
                      case 'form/list': {
                        const l = tmp83[0]
                        {
                          const n_of_args = dec(size(l))
                          const assert_n_args = (() => {
                            const ana = (n) => {
                              if (eq(n_of_args, n)) {
                                return 'wuns-undefined'
                              } else {
                                {
                                  return report_error(
                                    quote(
                                      form_slash_list([
                                        form_slash_word('expected'),
                                        form_slash_word('n-of-args'),
                                        form_slash_word('arguments'),
                                      ]),
                                    ),
                                  )
                                }
                              }
                            }
                            return ana
                          })()
                          const get_arg = (() => {
                            const get_arg = (i) => {
                              if (lt_s(i, n_of_args)) {
                                return at(l, inc(i))
                              } else {
                                return quote(form_slash_word('0'))
                              }
                            }
                            return get_arg
                          })()
                          const first_form = first(l)
                          {
                            {
                              const tmp84 = first_form
                              const tmp85 = tmp84['args']
                              switch (externs['host']['get-tag'](tmp84)) {
                                case 'form/word': {
                                  const first_word = tmp85[0]
                                  switch (first_word) {
                                    case 'do':
                                      return btop_slash_do(
                                        list_map_fn(
                                          (() => {
                                            const genword40 = (arg) => {
                                              return form_to_top(arg)
                                            }
                                            return genword40
                                          })(),
                                          rest(l),
                                        ),
                                      )
                                    case 'def': {
                                      assert_n_args(n2)
                                      {
                                        const bf = btop_slash_def(
                                          sword(get_arg(n0)),
                                          form_to_ast(local_stack_slash_empty(), third(l)),
                                        )
                                        {
                                          set_def(get_arg(n0), def_desc_slash_any())
                                          eval_form(form)
                                          return bf
                                        }
                                      }
                                    }
                                    case 'defn':
                                    case 'defexpr':
                                    case 'defmacro': {
                                      const f2f = form_to_func(local_stack_slash_empty(), form)
                                      const def_desc = (() => {
                                        switch (first_word) {
                                          case 'defn':
                                            return bdefunc_kind_slash_func()
                                          case 'defexpr':
                                            return bdefunc_kind_slash_fexpr()
                                          case 'defmacro':
                                            return bdefunc_kind_slash_macro()
                                          default: {
                                            return abort(
                                              list(
                                                quote(form_slash_word('form-to-top')),
                                                quote(form_slash_word('def')),
                                                quote(form_slash_word('kind')),
                                                quote(form_slash_word('not')),
                                                quote(form_slash_word('recognized')),
                                              ),
                                            )
                                          }
                                        }
                                      })()
                                      {
                                        set_def(get_arg(n0), def_desc_slash_defunc(def_desc))
                                        eval_form(form)
                                        return btop_slash_defunc(def_desc, f2f)
                                      }
                                    }
                                    case 'load': {
                                      assert_n_args(n1)
                                      {
                                        const bforms = list_map_fn(
                                          (() => {
                                            const genword41 = (bf) => {
                                              return form_to_top(bf)
                                            }
                                            return genword41
                                          })(),
                                          read_file(get_word(get_arg(n0))),
                                        )
                                        {
                                          eval_form(form)
                                          return btop_slash_do(bforms)
                                        }
                                      }
                                    }
                                    case 'type': {
                                      const triples = triplewise(rest(l))
                                      const _ = (() => {
                                        const gencol43 = triples
                                        const gencol_size44 = size(gencol43)
                                        {
                                          return (() => {
                                            const genloop_fun45 = (genit42) => {
                                              if (lt_s(genit42, gencol_size44)) {
                                                {
                                                  const triple = at(gencol43, genit42)
                                                  {
                                                    {
                                                      set_type(first(triple), size(get_list(second(triple))))
                                                      return genloop_fun45(add(genit42, 1))
                                                    }
                                                  }
                                                }
                                              } else {
                                                return 'wuns-undefined'
                                              }
                                            }
                                            return genloop_fun45
                                          })()(0)
                                        }
                                      })()
                                      const fb = btop_slash_type(
                                        list_map_fn(
                                          (() => {
                                            const genword46 = (triple) => {
                                              {
                                                const type_name_form = first(triple)
                                                const stype_name = get_sword(type_name_form)
                                                const type_name = syntax_word_slash_word(stype_name)
                                                const type_prefix = concat_words(type_name, '/')
                                                const def_prefix = (() => {
                                                  const dp = (name, desc) => {
                                                    {
                                                      const full_name = concat_words(type_prefix, name)
                                                      {
                                                        if (has(def_ctx, full_name)) {
                                                          {
                                                            report_error(
                                                              quote(
                                                                form_slash_list([
                                                                  form_slash_word('redefining'),
                                                                  form_slash_word('type'),
                                                                  form_slash_word('thing'),
                                                                ]),
                                                              ),
                                                            )
                                                          }
                                                        } else {
                                                        }
                                                        return set_kv_map(def_ctx, full_name, desc)
                                                      }
                                                    }
                                                  }
                                                  return dp
                                                })()
                                                const param_pair = form_to_type_param_list(second(triple))
                                                const type_params = pair_slash_fst(param_pair)
                                                const type_params_map = pair_slash_snd(param_pair)
                                                const form_to_type_with_params = mk_form_to_type(type_params_map)
                                                {
                                                  return type_decl(
                                                    stype_name,
                                                    type_params,
                                                    (() => {
                                                      {
                                                        const tmp86 = third(triple)
                                                        const tmp87 = tmp86['args']
                                                        switch (externs['host']['get-tag'](tmp86)) {
                                                          case 'form/list': {
                                                            const l = tmp87[0]
                                                            {
                                                              if (not(is_empty(l))) {
                                                              } else {
                                                                {
                                                                  abort(
                                                                    list(
                                                                      quote(form_slash_word('type')),
                                                                      quote(form_slash_word('decl')),
                                                                      quote(form_slash_word('kind')),
                                                                      quote(form_slash_word('form')),
                                                                      quote(form_slash_word('is')),
                                                                      quote(form_slash_word('empty')),
                                                                    ),
                                                                  )
                                                                }
                                                              }
                                                              switch (get_word(first(l))) {
                                                                case 'union': {
                                                                  const ctors = list_map_fn(
                                                                    (() => {
                                                                      const genword47 = (ctor) => {
                                                                        {
                                                                          const ctor_list = get_list(ctor)
                                                                          const ctor_name_form = first(ctor_list)
                                                                          {
                                                                            if (not(is_empty(ctor_list))) {
                                                                            } else {
                                                                              {
                                                                                abort(
                                                                                  list(
                                                                                    quote(form_slash_word('type')),
                                                                                    quote(form_slash_word('decl')),
                                                                                    quote(form_slash_word('kind')),
                                                                                    quote(form_slash_word('union')),
                                                                                    quote(form_slash_word('ctor')),
                                                                                    quote(form_slash_word('is')),
                                                                                    quote(form_slash_word('empty')),
                                                                                  ),
                                                                                )
                                                                              }
                                                                            }
                                                                            return pair(
                                                                              sword(ctor_name_form),
                                                                              list_map_fn(
                                                                                (() => {
                                                                                  const genword48 = (arg) => {
                                                                                    return form_to_type_with_params(arg)
                                                                                  }
                                                                                  return genword48
                                                                                })(),
                                                                                rest(ctor_list),
                                                                              ),
                                                                            )
                                                                          }
                                                                        }
                                                                      }
                                                                      return genword47
                                                                    })(),
                                                                    rest(l),
                                                                  )
                                                                  const lunion_desc = union_desc(
                                                                    stype_name,
                                                                    type_params,
                                                                    ctors,
                                                                  )
                                                                  {
                                                                    {
                                                                      const genword49 = size(ctors)
                                                                      {
                                                                        ;(() => {
                                                                          const genword50 = (i) => {
                                                                            if (lt_s(i, genword49)) {
                                                                              {
                                                                                def_prefix(
                                                                                  syntax_word_slash_word(
                                                                                    pair_slash_fst(at(ctors, i)),
                                                                                  ),
                                                                                  def_desc_slash_union_ctor(
                                                                                    lunion_desc,
                                                                                    i,
                                                                                  ),
                                                                                )
                                                                                return genword50(add(i, 1))
                                                                              }
                                                                            } else {
                                                                              return 'wuns-undefined'
                                                                            }
                                                                          }
                                                                          return genword50
                                                                        })()(n0)
                                                                      }
                                                                    }
                                                                    return type_decl_kind_slash_union(ctors)
                                                                  }
                                                                }
                                                                case 'record': {
                                                                  const fields = list_map_fn(
                                                                    (() => {
                                                                      const genword51 = (field) => {
                                                                        {
                                                                          const field_list = get_list(field)
                                                                          const field_name_form = first(field_list)
                                                                          const field_name = get_word(field_name_form)
                                                                          {
                                                                            if (not(is_empty(field_list))) {
                                                                            } else {
                                                                              {
                                                                                abort(
                                                                                  list(
                                                                                    quote(form_slash_word('type')),
                                                                                    quote(form_slash_word('decl')),
                                                                                    quote(form_slash_word('kind')),
                                                                                    quote(form_slash_word('record')),
                                                                                    quote(form_slash_word('field')),
                                                                                    quote(form_slash_word('is')),
                                                                                    quote(form_slash_word('empty')),
                                                                                  ),
                                                                                )
                                                                              }
                                                                            }
                                                                            return pair(
                                                                              sword(field_name_form),
                                                                              form_to_type_with_params(
                                                                                second(field_list),
                                                                              ),
                                                                            )
                                                                          }
                                                                        }
                                                                      }
                                                                      return genword51
                                                                    })(),
                                                                    rest(l),
                                                                  )
                                                                  const lrecord_desc = record_desc(
                                                                    stype_name,
                                                                    type_params,
                                                                    fields,
                                                                  )
                                                                  {
                                                                    {
                                                                      const genword52 = size(fields)
                                                                      {
                                                                        ;(() => {
                                                                          const genword53 = (i) => {
                                                                            if (lt_s(i, genword52)) {
                                                                              {
                                                                                def_prefix(
                                                                                  syntax_word_slash_word(
                                                                                    pair_slash_fst(at(fields, i)),
                                                                                  ),
                                                                                  def_desc_slash_record_proj(
                                                                                    lrecord_desc,
                                                                                    i,
                                                                                  ),
                                                                                )
                                                                                return genword53(add(i, 1))
                                                                              }
                                                                            } else {
                                                                              return 'wuns-undefined'
                                                                            }
                                                                          }
                                                                          return genword53
                                                                        })()(n0)
                                                                      }
                                                                    }
                                                                    set_def(first(triple), def_desc_slash_record_ctor())
                                                                    return type_decl_kind_slash_record(fields)
                                                                  }
                                                                }
                                                                default: {
                                                                  return abort(
                                                                    list(
                                                                      quote(form_slash_word('unknown')),
                                                                      quote(form_slash_word('type')),
                                                                      quote(form_slash_word('kind')),
                                                                    ),
                                                                  )
                                                                }
                                                              }
                                                            }
                                                          }
                                                          default: {
                                                            return abort(
                                                              list(
                                                                quote(form_slash_word('form-to-type-decl-kind')),
                                                                quote(form_slash_word('not')),
                                                                quote(form_slash_word('implemented')),
                                                              ),
                                                            )
                                                          }
                                                        }
                                                      }
                                                    })(),
                                                  )
                                                }
                                              }
                                            }
                                            return genword46
                                          })(),
                                          triples,
                                        ),
                                      )
                                      {
                                        eval_form(form)
                                        return fb
                                      }
                                    }
                                    case 'export':
                                      return btop_slash_export(
                                        list_map_fn(
                                          (() => {
                                            const genword54 = (f) => {
                                              {
                                                const sw = get_sword(f)
                                                {
                                                  {
                                                    const tmp88 = try_get(def_ctx, syntax_word_slash_word(sw))
                                                    const tmp89 = tmp88['args']
                                                    switch (externs['host']['get-tag'](tmp88)) {
                                                      case 'option/some': {
                                                        const ddesc = tmp89[0]
                                                        set_kv_map(node_to_def_desc, sw, ddesc)
                                                        break
                                                      }
                                                      default:
                                                        push_error(
                                                          f,
                                                          quote(
                                                            form_slash_list([
                                                              form_slash_word('not'),
                                                              form_slash_word('a'),
                                                              form_slash_word('defined'),
                                                              form_slash_word('name'),
                                                            ]),
                                                          ),
                                                        )
                                                    }
                                                  }
                                                  return sw
                                                }
                                              }
                                            }
                                            return genword54
                                          })(),
                                          rest(l),
                                        ),
                                      )
                                    default: {
                                      const tmp90 = try_get(def_ctx, first_word)
                                      const tmp91 = tmp90['args']
                                      switch (externs['host']['get-tag'](tmp90)) {
                                        case 'option/some': {
                                          const ddesc = tmp91[0]
                                          {
                                            set_kv_map(node_to_def_desc, get_sword(first_form), ddesc)
                                            {
                                              const tmp92 = ddesc
                                              const tmp93 = tmp92['args']
                                              switch (externs['host']['get-tag'](tmp92)) {
                                                case 'def-desc/defunc': {
                                                  const defunc_desc = tmp93[0]
                                                  {
                                                    const tmp94 = defunc_desc
                                                    const tmp95 = tmp94['args']
                                                    switch (externs['host']['get-tag'](tmp94)) {
                                                      case 'bdefunc-kind/macro': {
                                                        {
                                                          const tmp96 = try_get_macro(eval_ctx, first_word)
                                                          const tmp97 = tmp96['args']
                                                          switch (externs['host']['get-tag'](tmp96)) {
                                                            case 'option/some': {
                                                              const macro_func = tmp97[0]
                                                              return form_to_top(interpreter_apply(macro_func, rest(l)))
                                                            }
                                                            default: {
                                                              return abort(
                                                                list(
                                                                  quote(form_slash_word('form-to-top')),
                                                                  quote(form_slash_word('macro')),
                                                                  quote(form_slash_word('not')),
                                                                  quote(form_slash_word('found')),
                                                                ),
                                                              )
                                                            }
                                                          }
                                                        }
                                                      }
                                                      default: {
                                                        return abort(
                                                          list(
                                                            quote(form_slash_word('form-to-top')),
                                                            quote(form_slash_word('func/fexpr')),
                                                            quote(form_slash_word('call')),
                                                            quote(form_slash_word('at')),
                                                            quote(form_slash_word('top')),
                                                            quote(form_slash_word('level')),
                                                            quote(form_slash_word('not')),
                                                            quote(form_slash_word('supported')),
                                                          ),
                                                        )
                                                      }
                                                    }
                                                  }
                                                }
                                                default: {
                                                  log_fn(list(form))
                                                  {
                                                    return abort(
                                                      list(
                                                        quote(form_slash_word('form-to-top')),
                                                        quote(form_slash_word('any')),
                                                        quote(form_slash_word('call')),
                                                        quote(form_slash_word('at')),
                                                        quote(form_slash_word('top')),
                                                        quote(form_slash_word('level')),
                                                        quote(form_slash_word('not')),
                                                        quote(form_slash_word('supported')),
                                                      ),
                                                    )
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                        default: {
                                          report_error(
                                            quote(
                                              form_slash_list([form_slash_word('undefined'), form_slash_word('word')]),
                                            ),
                                          )
                                          return btop_slash_do(list())
                                        }
                                      }
                                    }
                                  }
                                }
                                case 'form/list': {
                                  const fl = tmp85[0]
                                  {
                                    return abort(
                                      list(
                                        quote(form_slash_word('direct')),
                                        quote(form_slash_word('call')),
                                        quote(form_slash_word('at')),
                                        quote(form_slash_word('top')),
                                        quote(form_slash_word('not')),
                                        quote(form_slash_word('supported')),
                                      ),
                                    )
                                  }
                                }
                                default:
                                  throw 'unmatched-match'
                              }
                            }
                          }
                        }
                      }
                      default:
                        throw 'unmatched-match'
                    }
                  }
                })(),
              )
            }
          }
        }
        const form_to_ast = (lstack, form) => {
          {
            const report_error = (() => {
              const r = (msg) => {
                return push_error(form, msg)
              }
              return r
            })()
            const assert_empty_stack = (() => {
              const aes = () => {
                {
                  const tmp98 = lstack
                  const tmp99 = tmp98['args']
                  switch (externs['host']['get-tag'](tmp98)) {
                    case 'local-stack/empty': {
                      return 'wuns-undefined'
                    }
                    case 'local-stack/frame': {
                      const lvars = tmp99[0]
                      const lctx = tmp99[1]
                      return report_error(
                        quote(
                          form_slash_list([
                            form_slash_word('not'),
                            form_slash_word('allowed'),
                            form_slash_word('in'),
                            form_slash_word('local'),
                            form_slash_word('context'),
                          ]),
                        ),
                      )
                    }
                    default:
                      throw 'unmatched-match'
                  }
                }
              }
              return aes
            })()
            {
              return insert_form(
                form,
                (() => {
                  {
                    const tmp100 = form
                    const tmp101 = tmp100['args']
                    switch (externs['host']['get-tag'](tmp100)) {
                      case 'form/word': {
                        const w = tmp101[0]
                        {
                          const sname = get_sword(form)
                          const bf = bexp_slash_var(sname)
                          {
                            {
                              const tmp102 = try_get_local(lstack, w)
                              const tmp103 = tmp102['args']
                              switch (externs['host']['get-tag'](tmp102)) {
                                case 'option/some': {
                                  const ldesc = tmp103[0]
                                  set_kv_map(node_to_ldesc, sname, ldesc)
                                  break
                                }
                                default: {
                                  const tmp104 = try_get(def_ctx, w)
                                  const tmp105 = tmp104['args']
                                  switch (externs['host']['get-tag'](tmp104)) {
                                    case 'option/some': {
                                      const ddesc = tmp105[0]
                                      set_kv_map(node_to_def_desc, get_sword(form), ddesc)
                                      break
                                    }
                                    default:
                                      report_error(
                                        quote(form_slash_list([form_slash_word('undefined'), form_slash_word('word')])),
                                      )
                                  }
                                }
                              }
                            }
                            return bf
                          }
                        }
                      }
                      case 'form/list': {
                        const l = tmp101[0]
                        {
                          const n_of_args = dec(size(l))
                          const assert_n_args = (() => {
                            const ana = (n) => {
                              if (eq(n_of_args, n)) {
                                return 'wuns-undefined'
                              } else {
                                {
                                  return report_error(
                                    quote(
                                      form_slash_list([
                                        form_slash_word('expected'),
                                        form_slash_word('n-of-args'),
                                        form_slash_word('arguments'),
                                      ]),
                                    ),
                                  )
                                }
                              }
                            }
                            return ana
                          })()
                          const get_arg = (() => {
                            const get_arg = (i) => {
                              if (lt_s(i, n_of_args)) {
                                return at(l, inc(i))
                              } else {
                                return quote(form_slash_word('0'))
                              }
                            }
                            return get_arg
                          })()
                          const first_form = first(l)
                          {
                            {
                              const tmp106 = first_form
                              const tmp107 = tmp106['args']
                              switch (externs['host']['get-tag'](tmp106)) {
                                case 'form/word': {
                                  const first_word = tmp107[0]
                                  switch (first_word) {
                                    case 'i32':
                                      return bexp_slash_literal(literal_slash_i32(get_sword(get_arg(n0))))
                                    case 'f64':
                                      return bexp_slash_literal(literal_slash_f64(get_sword(get_arg(n0))))
                                    case 'i64':
                                    case 'f32':
                                    case 'v128': {
                                      return abort(
                                        list(
                                          quote(form_slash_word('form-to-ast')),
                                          quote(form_slash_word('not')),
                                          quote(form_slash_word('implemented')),
                                          identity(first_form),
                                        ),
                                      )
                                    }
                                    case 'word':
                                      return bexp_slash_literal(literal_slash_word(get_sword(get_arg(n0))))
                                    case 'extern':
                                      return bexp_slash_extern(
                                        list_map_fn(
                                          (() => {
                                            const genword55 = (w) => {
                                              return get_sword(w)
                                            }
                                            return genword55
                                          })(),
                                          rest(l),
                                        ),
                                      )
                                    case 'intrinsic':
                                      return bexp_slash_intrinsic(get_sword(get_arg(n0)))
                                    case 'func':
                                      return bexp_slash_func(form_to_func(lstack, form))
                                    case 'if': {
                                      assert_n_args(n3)
                                      return bexp_slash_if(
                                        form_to_ast(lstack, get_arg(n0)),
                                        form_to_ast(lstack, get_arg(n1)),
                                        form_to_ast(lstack, get_arg(n2)),
                                      )
                                    }
                                    case 'switch': {
                                      if (is_odd(size(l))) {
                                      } else {
                                        {
                                          report_error(
                                            quote(
                                              form_slash_list([
                                                form_slash_word('expected'),
                                                form_slash_word('even'),
                                                form_slash_word('number'),
                                                form_slash_word('of'),
                                                form_slash_word('arguments'),
                                              ]),
                                            ),
                                          )
                                        }
                                      }
                                      return bexp_slash_switch(
                                        form_to_ast(lstack, get_arg(n0)),
                                        list_map_fn(
                                          (() => {
                                            const genword56 = (p) => {
                                              return pair(
                                                list_map_fn(
                                                  (() => {
                                                    const genword57 = (v) => {
                                                      return form_to_ast(lstack, v)
                                                    }
                                                    return genword57
                                                  })(),
                                                  get_list(first(p)),
                                                ),
                                                form_to_ast(lstack, second(p)),
                                              )
                                            }
                                            return genword56
                                          })(),
                                          pairwise(slice(l, n2, dec(size(l)))),
                                        ),
                                        form_to_ast(lstack, last(l)),
                                      )
                                    }
                                    case 'match': {
                                      const union_type_name_atom = atom(none())
                                      const clauses = list_map_fn(
                                        (() => {
                                          const genword58 = (p) => {
                                            {
                                              const pat_list = get_list(pair_slash_fst(p))
                                              {
                                                {
                                                  if (not(is_empty(pat_list))) {
                                                  } else {
                                                    {
                                                      abort(
                                                        list(
                                                          quote(form_slash_word('match')),
                                                          quote(form_slash_word('pattern')),
                                                          quote(form_slash_word('is')),
                                                          quote(form_slash_word('empty')),
                                                        ),
                                                      )
                                                    }
                                                  }
                                                  {
                                                    const ctor_form = first(pat_list)
                                                    const ctor_sname = get_sword(ctor_form)
                                                    const params = rest(pat_list)
                                                    const lvars = transient_kv_map()
                                                    const lctx = local_context(lvars, local_context_kind_slash_match())
                                                    const new_lstack = local_stack_slash_frame(lstack, lctx)
                                                    {
                                                      {
                                                        const tmp108 = try_get(
                                                          def_ctx,
                                                          syntax_word_slash_word(ctor_sname),
                                                        )
                                                        const tmp109 = tmp108['args']
                                                        switch (externs['host']['get-tag'](tmp108)) {
                                                          case 'option/some': {
                                                            const ddesc = tmp109[0]
                                                            {
                                                              set_kv_map(node_to_def_desc, ctor_sname, ddesc)
                                                              {
                                                                const tmp110 = ddesc
                                                                const tmp111 = tmp110['args']
                                                                switch (externs['host']['get-tag'](tmp110)) {
                                                                  case 'def-desc/union-ctor': {
                                                                    const union_desc = tmp111[0]
                                                                    const index = tmp111[1]
                                                                    {
                                                                      const union_type_name = syntax_word_slash_word(
                                                                        union_desc_slash_name(union_desc),
                                                                      )
                                                                      const ctors = union_desc_slash_ctors(union_desc)
                                                                      const ctor_pair = at(ctors, index)
                                                                      const ctor_params = pair_slash_snd(ctor_pair)
                                                                      {
                                                                        {
                                                                          const tmp112 = atom_get(union_type_name_atom)
                                                                          const tmp113 = tmp112['args']
                                                                          switch (externs['host']['get-tag'](tmp112)) {
                                                                            case 'option/some': {
                                                                              const prev_union_type_name = tmp113[0]
                                                                              {
                                                                                if (
                                                                                  eq_word(
                                                                                    prev_union_type_name,
                                                                                    union_type_name,
                                                                                  )
                                                                                ) {
                                                                                } else {
                                                                                  {
                                                                                    push_error(
                                                                                      ctor_form,
                                                                                      quote(
                                                                                        form_slash_list([
                                                                                          form_slash_word('mismatched'),
                                                                                          form_slash_word('union'),
                                                                                          form_slash_word('types'),
                                                                                        ]),
                                                                                      ),
                                                                                    )
                                                                                  }
                                                                                }
                                                                              }
                                                                              break
                                                                            }
                                                                            default:
                                                                          }
                                                                        }
                                                                        atom_set(
                                                                          union_type_name_atom,
                                                                          some(union_type_name),
                                                                        )
                                                                        if (eq(size(ctor_params), size(params))) {
                                                                        } else {
                                                                          {
                                                                            push_error(
                                                                              pair_slash_fst(p),
                                                                              quote(
                                                                                form_slash_list([
                                                                                  form_slash_word('wrong'),
                                                                                  form_slash_word('number'),
                                                                                  form_slash_word('of'),
                                                                                  form_slash_word('arguments'),
                                                                                  form_slash_word('to'),
                                                                                  form_slash_word('union'),
                                                                                  form_slash_word('ctor'),
                                                                                ]),
                                                                              ),
                                                                            )
                                                                          }
                                                                        }
                                                                        {
                                                                          const genword59 = min(
                                                                            size(ctor_params),
                                                                            size(params),
                                                                          )
                                                                          {
                                                                            ;(() => {
                                                                              const genword60 = (i) => {
                                                                                if (lt_s(i, genword59)) {
                                                                                  {
                                                                                    set_local(
                                                                                      lvars,
                                                                                      at(params, i),
                                                                                      local_var_kind_slash_match_param(),
                                                                                    )
                                                                                    return genword60(add(i, 1))
                                                                                  }
                                                                                } else {
                                                                                  return 'wuns-undefined'
                                                                                }
                                                                              }
                                                                              return genword60
                                                                            })()(n0)
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                    break
                                                                  }
                                                                  default:
                                                                    push_error(
                                                                      ctor_form,
                                                                      quote(
                                                                        form_slash_list([
                                                                          form_slash_word('not'),
                                                                          form_slash_word('bound'),
                                                                          form_slash_word('to'),
                                                                          form_slash_word('a'),
                                                                          form_slash_word('union'),
                                                                          form_slash_word('constructor'),
                                                                        ]),
                                                                      ),
                                                                    )
                                                                }
                                                              }
                                                            }
                                                            break
                                                          }
                                                          default:
                                                            push_error(
                                                              ctor_form,
                                                              quote(
                                                                form_slash_list([
                                                                  form_slash_word('not'),
                                                                  form_slash_word('bound'),
                                                                  form_slash_word('to'),
                                                                  form_slash_word('def'),
                                                                  form_slash_word('at'),
                                                                  form_slash_word('all'),
                                                                ]),
                                                              ),
                                                            )
                                                        }
                                                      }
                                                      return pair(
                                                        match_pattern(
                                                          ctor_sname,
                                                          list_map_fn(
                                                            (() => {
                                                              const genword61 = (param) => {
                                                                return get_sword(param)
                                                              }
                                                              return genword61
                                                            })(),
                                                            params,
                                                          ),
                                                        ),
                                                        form_to_ast(new_lstack, pair_slash_snd(p)),
                                                      )
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                          return genword58
                                        })(),
                                        pairwise_pairs(slice(l, n2, size(l))),
                                      )
                                      {
                                        return bexp_slash_match(
                                          form_to_ast(lstack, get_arg(n0)),
                                          clauses,
                                          is_odd(size(l)) ? some(form_to_ast(lstack, last(l))) : none(),
                                        )
                                      }
                                    }
                                    case 'do':
                                      return bexp_slash_do(
                                        list_map_fn(
                                          (() => {
                                            const genword62 = (arg) => {
                                              return form_to_ast(lstack, arg)
                                            }
                                            return genword62
                                          })(),
                                          rest(l),
                                        ),
                                      )
                                    case 'loop': {
                                      const bindings = get_list(get_arg(n0))
                                      const lvars = transient_kv_map()
                                      const lctx = local_context(lvars, local_context_kind_slash_loop())
                                      const new_lstack = local_stack_slash_frame(lstack, lctx)
                                      {
                                        if (lt_s(n_of_args, n2)) {
                                          {
                                            report_error(
                                              quote(
                                                form_slash_list([
                                                  form_slash_word('expected'),
                                                  form_slash_word('at'),
                                                  form_slash_word('least'),
                                                  form_slash_word('2'),
                                                  form_slash_word('arguments'),
                                                ]),
                                              ),
                                            )
                                          }
                                        } else {
                                        }
                                        return bexp_slash_loop(
                                          list_map_fn(
                                            (() => {
                                              const genword63 = (p) => {
                                                {
                                                  const name = first(p)
                                                  const name_word = get_word(name)
                                                  const be = form_to_ast(new_lstack, second(p))
                                                  {
                                                    {
                                                      const tmp114 = try_get_local(lstack, name_word)
                                                      const tmp115 = tmp114['args']
                                                      switch (externs['host']['get-tag'](tmp114)) {
                                                        case 'option/some': {
                                                          const ldesc = tmp115[0]
                                                          push_error(
                                                            name,
                                                            quote(
                                                              form_slash_list([
                                                                form_slash_word('let'),
                                                                form_slash_word('var'),
                                                                form_slash_word('shadows'),
                                                                form_slash_word('local'),
                                                              ]),
                                                            ),
                                                          )
                                                          break
                                                        }
                                                        default: {
                                                          const tmp116 = try_get(def_ctx, name_word)
                                                          const tmp117 = tmp116['args']
                                                          switch (externs['host']['get-tag'](tmp116)) {
                                                            case 'option/some': {
                                                              const ddesc = tmp117[0]
                                                              {
                                                                push_error(
                                                                  name,
                                                                  quote(
                                                                    form_slash_list([
                                                                      form_slash_word('let'),
                                                                      form_slash_word('var'),
                                                                      form_slash_word('shadows'),
                                                                      form_slash_word('def'),
                                                                    ]),
                                                                  ),
                                                                )
                                                              }
                                                              break
                                                            }
                                                            default:
                                                          }
                                                        }
                                                      }
                                                    }
                                                    set_local(lvars, name, local_var_kind_slash_loop())
                                                    return pair(sword(name), be)
                                                  }
                                                }
                                              }
                                              return genword63
                                            })(),
                                            pairwise(bindings),
                                          ),
                                          list_map_fn(
                                            (() => {
                                              const genword64 = (f) => {
                                                return form_to_ast(new_lstack, f)
                                              }
                                              return genword64
                                            })(),
                                            slice(l, n2, size(l)),
                                          ),
                                        )
                                      }
                                    }
                                    case 'continue': {
                                      const loop_vars = (() => {
                                        {
                                          const tmp118 = try_get_enclosing_loop_context(lstack)
                                          const tmp119 = tmp118['args']
                                          switch (externs['host']['get-tag'](tmp118)) {
                                            case 'option/some': {
                                              const loop_context = tmp119[0]
                                              return local_context_slash_vars(loop_context)
                                            }
                                            default: {
                                              push_error(
                                                form,
                                                quote(
                                                  form_slash_list([
                                                    form_slash_word('not'),
                                                    form_slash_word('in'),
                                                    form_slash_word('a'),
                                                    form_slash_word('loop'),
                                                    form_slash_word('context'),
                                                  ]),
                                                ),
                                              )
                                              return transient_kv_map()
                                            }
                                          }
                                        }
                                      })()
                                      {
                                        return bexp_slash_continue(
                                          list_map_fn(
                                            (() => {
                                              const genword65 = (p) => {
                                                {
                                                  const name = pair_slash_fst(p)
                                                  const sname = sword(name)
                                                  const name_word = get_word(name)
                                                  const be = form_to_ast(lstack, pair_slash_snd(p))
                                                  {
                                                    {
                                                      const tmp120 = try_get(loop_vars, name_word)
                                                      const tmp121 = tmp120['args']
                                                      switch (externs['host']['get-tag'](tmp120)) {
                                                        case 'option/some': {
                                                          const ldesc = tmp121[0]
                                                          set_kv_map(node_to_ldesc, sname, ldesc)
                                                          break
                                                        }
                                                        default:
                                                          push_error(
                                                            name,
                                                            quote(
                                                              form_slash_list([
                                                                form_slash_word('not'),
                                                                form_slash_word('a'),
                                                                form_slash_word('loop'),
                                                                form_slash_word('var'),
                                                                form_slash_word('of'),
                                                                form_slash_word('the'),
                                                                form_slash_word('current'),
                                                                form_slash_word('loop'),
                                                              ]),
                                                            ),
                                                          )
                                                      }
                                                    }
                                                    return pair(sname, be)
                                                  }
                                                }
                                              }
                                              return genword65
                                            })(),
                                            pairwise_pairs(rest(l)),
                                          ),
                                        )
                                      }
                                    }
                                    case 'let': {
                                      const bindings = get_list(get_arg(n0))
                                      const lvars = transient_kv_map()
                                      const lctx = local_context(lvars, local_context_kind_slash_let())
                                      const new_lstack = local_stack_slash_frame(lstack, lctx)
                                      {
                                        if (lt_s(n_of_args, n2)) {
                                          {
                                            report_error(
                                              quote(
                                                form_slash_list([
                                                  form_slash_word('expected'),
                                                  form_slash_word('at'),
                                                  form_slash_word('least'),
                                                  form_slash_word('2'),
                                                  form_slash_word('arguments'),
                                                ]),
                                              ),
                                            )
                                          }
                                        } else {
                                        }
                                        return bexp_slash_let(
                                          list_map_fn(
                                            (() => {
                                              const genword66 = (p) => {
                                                {
                                                  const name = first(p)
                                                  const name_word = get_word(name)
                                                  const be = form_to_ast(new_lstack, second(p))
                                                  {
                                                    {
                                                      const tmp122 = try_get_local(lstack, name_word)
                                                      const tmp123 = tmp122['args']
                                                      switch (externs['host']['get-tag'](tmp122)) {
                                                        case 'option/some': {
                                                          const ldesc = tmp123[0]
                                                          push_error(
                                                            name,
                                                            quote(
                                                              form_slash_list([
                                                                form_slash_word('let'),
                                                                form_slash_word('var'),
                                                                form_slash_word('shadows'),
                                                                form_slash_word('local'),
                                                              ]),
                                                            ),
                                                          )
                                                          break
                                                        }
                                                        default: {
                                                          const tmp124 = try_get(def_ctx, name_word)
                                                          const tmp125 = tmp124['args']
                                                          switch (externs['host']['get-tag'](tmp124)) {
                                                            case 'option/some': {
                                                              const ddesc = tmp125[0]
                                                              {
                                                                push_error(
                                                                  name,
                                                                  quote(
                                                                    form_slash_list([
                                                                      form_slash_word('let'),
                                                                      form_slash_word('var'),
                                                                      form_slash_word('shadows'),
                                                                      form_slash_word('def'),
                                                                    ]),
                                                                  ),
                                                                )
                                                              }
                                                              break
                                                            }
                                                            default:
                                                          }
                                                        }
                                                      }
                                                    }
                                                    set_local(lvars, name, local_var_kind_slash_let())
                                                    return pair(sword(name), be)
                                                  }
                                                }
                                              }
                                              return genword66
                                            })(),
                                            pairwise(bindings),
                                          ),
                                          list_map_fn(
                                            (() => {
                                              const genword67 = (f) => {
                                                return form_to_ast(new_lstack, f)
                                              }
                                              return genword67
                                            })(),
                                            slice(l, n2, size(l)),
                                          ),
                                        )
                                      }
                                    }
                                    case 'letfn': {
                                      const funcs = get_list(get_arg(n0))
                                      const lvars = transient_kv_map()
                                      const lctx = local_context(lvars, local_context_kind_slash_letfn())
                                      const new_lstack = local_stack_slash_frame(lstack, lctx)
                                      {
                                        if (lt_s(n_of_args, n2)) {
                                          {
                                            report_error(
                                              quote(
                                                form_slash_list([
                                                  form_slash_word('expected'),
                                                  form_slash_word('at'),
                                                  form_slash_word('least'),
                                                  form_slash_word('2'),
                                                  form_slash_word('arguments'),
                                                ]),
                                              ),
                                            )
                                          }
                                        } else {
                                        }
                                        {
                                          const gencol69 = funcs
                                          const gencol_size70 = size(gencol69)
                                          {
                                            ;(() => {
                                              const genloop_fun71 = (genit68) => {
                                                if (lt_s(genit68, gencol_size70)) {
                                                  {
                                                    const ff = at(gencol69, genit68)
                                                    {
                                                      {
                                                        {
                                                          const name = second(get_list(ff))
                                                          {
                                                            set_local(lvars, name, local_var_kind_slash_letfn())
                                                          }
                                                        }
                                                        return genloop_fun71(add(genit68, 1))
                                                      }
                                                    }
                                                  }
                                                } else {
                                                  return 'wuns-undefined'
                                                }
                                              }
                                              return genloop_fun71
                                            })()(0)
                                          }
                                        }
                                        return bexp_slash_letfn(
                                          list_map_fn(
                                            (() => {
                                              const genword72 = (ff) => {
                                                {
                                                  return form_to_func(new_lstack, ff)
                                                }
                                              }
                                              return genword72
                                            })(),
                                            funcs,
                                          ),
                                          list_map_fn(
                                            (() => {
                                              const genword73 = (f) => {
                                                return form_to_ast(new_lstack, f)
                                              }
                                              return genword73
                                            })(),
                                            slice(l, n2, size(l)),
                                          ),
                                        )
                                      }
                                    }
                                    case 'type-anno': {
                                      assert_n_args(n2)
                                      return bexp_slash_type_anno(
                                        form_to_ast(lstack, get_arg(n0)),
                                        form_to_type_scheme(get_arg(n1)),
                                      )
                                    }
                                    default: {
                                      const tmp126 = try_get_local(lstack, first_word)
                                      const tmp127 = tmp126['args']
                                      switch (externs['host']['get-tag'](tmp126)) {
                                        case 'option/some': {
                                          const ldesc = tmp127[0]
                                          return bexp_slash_call(
                                            form_to_ast(lstack, first_form),
                                            list_map_fn(
                                              (() => {
                                                const genword74 = (arg) => {
                                                  return form_to_ast(lstack, arg)
                                                }
                                                return genword74
                                              })(),
                                              rest(l),
                                            ),
                                          )
                                        }
                                        default: {
                                          const tmp128 = try_get(def_ctx, first_word)
                                          const tmp129 = tmp128['args']
                                          switch (externs['host']['get-tag'](tmp128)) {
                                            case 'option/some': {
                                              const ddesc = tmp129[0]
                                              {
                                                set_kv_map(node_to_def_desc, get_sword(first_form), ddesc)
                                                {
                                                  const tmp130 = ddesc
                                                  const tmp131 = tmp130['args']
                                                  switch (externs['host']['get-tag'](tmp130)) {
                                                    case 'def-desc/defunc': {
                                                      const defunc_desc = tmp131[0]
                                                      {
                                                        const tmp132 = defunc_desc
                                                        const tmp133 = tmp132['args']
                                                        switch (externs['host']['get-tag'](tmp132)) {
                                                          case 'bdefunc-kind/fexpr': {
                                                            return bexp_slash_call_fexpr(
                                                              bexp_slash_var(get_sword(first_form)),
                                                              rest(l),
                                                            )
                                                          }
                                                          case 'bdefunc-kind/macro': {
                                                            {
                                                              const tmp134 = try_get_macro(eval_ctx, first_word)
                                                              const tmp135 = tmp134['args']
                                                              switch (externs['host']['get-tag'](tmp134)) {
                                                                case 'option/some': {
                                                                  const macro_func = tmp135[0]
                                                                  return form_to_ast(
                                                                    lstack,
                                                                    interpreter_apply(macro_func, rest(l)),
                                                                  )
                                                                }
                                                                default: {
                                                                  return abort(
                                                                    list(
                                                                      quote(form_slash_word('form-to-top')),
                                                                      quote(form_slash_word('macro')),
                                                                      quote(form_slash_word('not')),
                                                                      quote(form_slash_word('found')),
                                                                    ),
                                                                  )
                                                                }
                                                              }
                                                            }
                                                          }
                                                          default:
                                                            return bexp_slash_call(
                                                              form_to_ast(lstack, first_form),
                                                              list_map_fn(
                                                                (() => {
                                                                  const genword75 = (arg) => {
                                                                    return form_to_ast(lstack, arg)
                                                                  }
                                                                  return genword75
                                                                })(),
                                                                rest(l),
                                                              ),
                                                            )
                                                        }
                                                      }
                                                    }
                                                    default:
                                                      return bexp_slash_call(
                                                        form_to_ast(lstack, first_form),
                                                        list_map_fn(
                                                          (() => {
                                                            const genword76 = (arg) => {
                                                              return form_to_ast(lstack, arg)
                                                            }
                                                            return genword76
                                                          })(),
                                                          rest(l),
                                                        ),
                                                      )
                                                  }
                                                }
                                              }
                                            }
                                            default: {
                                              report_error(
                                                quote(
                                                  form_slash_list([
                                                    form_slash_word('undefined'),
                                                    form_slash_word('word'),
                                                  ]),
                                                ),
                                              )
                                              return bexp_slash_do(list())
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                                case 'form/list': {
                                  const fl = tmp107[0]
                                  return bexp_slash_call(
                                    form_to_ast(lstack, first(l)),
                                    list_map_fn(
                                      (() => {
                                        const genword77 = (arg) => {
                                          return form_to_ast(lstack, arg)
                                        }
                                        return genword77
                                      })(),
                                      rest(l),
                                    ),
                                  )
                                }
                                default:
                                  throw 'unmatched-match'
                              }
                            }
                          }
                        }
                      }
                      default:
                        throw 'unmatched-match'
                    }
                  }
                })(),
              )
            }
          }
        }
        {
          return form_to_ast_converter(
            (() => {
              const f2a = (top_form) => {
                {
                  const bform = form_to_top(top_form)
                  const lerrors = clone_growable_to_frozen_list(errors)
                  {
                    if (is_empty(lerrors)) {
                      return result_slash_ok(bform)
                    } else {
                      return result_slash_error(lerrors)
                    }
                  }
                }
              }
              return f2a
            })(),
            errors,
            node_to_ldesc,
            node_to_def_desc,
            bst_to_form,
          )
        }
      })()
    }
  }
}
export { mk_form_to_ast as 'mk-form-to-ast' }
