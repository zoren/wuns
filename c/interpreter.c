#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdlib.h>
#include <limits.h>

typedef struct word
{
  ssize_t len;
  char* chars;
} word_t;

typedef struct rtlist
{
  ssize_t len;
  struct rtval** elements;
} rtlist_t;

typedef struct
{
  char *name;
  int arity;
  char **parameters;
  char *rest_param;
  int n_of_bodies;
  struct rtval* bodies;
} rt_closure_t;

typedef enum
{
  rtval_i32 = 1,
  rtval_word = 2,
  rtval_list = 3,
  rtval_form_word = 4,
  rtval_form_list = 5,
  rtval_builtin = 6,
} rtval_tag;

void assert_valid_tag(rtval_tag tag)
{
  assert(tag >= 1 && tag <= 6 && "tag must be word or list");
}

typedef struct rtval
{
  rtval_tag tag;
  union
  {
    int32_t i32;
    word_t* word;
    rtlist_t* list;
    // rt_closure_t closure;
    // ContinueBindings* continue_update_bindings;
  };
  struct rtval *metadata;
} rtval_t;

void print_form(rtval_t* form)
{
  switch (form->tag)
  {
  case rtval_word:
    printf("%s", form->word->chars);
    break;
  case rtval_list:{
    const rtlist_t* list = form->list;
    if (list->len == 0)
    {
      printf("[]");
      return;
    }
    printf("[");
    print_form(list->elements[0]);

    for (int i = 1; i < list->len; i++)
    {
      printf(" ");
      print_form((list->elements)[i]);
    }
    printf("]");
    break;}
  default:
    printf("print_form Error: unknown tag %d\n", form->tag);
    exit(1);
  }
}

rtval_t* alloc_val(rtval_tag tag)
{
  rtval_t* val = malloc(sizeof(rtval_t));
  val->tag = tag;
  return val;
}

rtlist_t* alloc_list(ssize_t len)
{
  rtlist_t* list = malloc(sizeof(rtlist_t));
  list->len = len;
  list->elements = malloc(sizeof(rtval_t*) * len);
  return list;
}

rtval_t* word_from_string(const char *s)
{
  const int len = strlen(s);
  char *chars = malloc(len + 1);
  memcpy(chars, s, len);
  chars[len] = '\0';
  word_t word = {.len = len, .chars = chars};
  // rtval_t* val = malloc(sizeof(rtval_t));
  // val->tag = rtval_word;
  rtval_t *val = alloc_val(rtval_word);
  val->word = &word;
  return val;
}

rtval_t zero;
rtval_t one;
rtval_t two;

rtval_t* unit;

// const rtval_t zero = {.tag = rtval_word, .word = &{.len = 1, .chars = "0"}};
// const rtval_t one = {.tag = rtval_word, .word = {.len = 1, .chars = "1"}};
// const rtval_t two = {.tag = rtval_word, .word = {.len = 1, .chars = "2"}};
// const rtlist_t rt_unit = {.len = 0, .elements = NULL};
// const rtval_t unit = {.tag = rtval_list, .list = rt_unit};

bool streq(const char *a, const char *b)
{
  return strcmp(a, b) == 0;
}

#include <tree_sitter/api.h>

rtval_t* form_from_node(const char *file_content, TSNode node)
{
  const char *node_type_str = ts_node_type(node);
  if (streq(node_type_str, "word"))
  {
    const uint32_t word = ts_node_start_byte(node);
    const uint32_t len = ts_node_end_byte(node) - word;
    char *new_chars = malloc(len + 1);
    memcpy(new_chars, file_content + word, len);
    new_chars[len] = '\0';
    word_t *new_word = malloc(sizeof(word_t));
    new_word->len = len;
    new_word->chars = new_chars;
    rtval_t *val = alloc_val(rtval_word);
    val->word = new_word;
    rtval_t* form_word = alloc_val(rtval_form_word);
    form_word->metadata = val;
    form_word->word = new_word;
    return form_word;
    return val;
    // return word_from_string(new_word);
  }
  if (streq(node_type_str, "list"))
  {
    const int len = ts_node_named_child_count(node);
    rtlist_t* list = alloc_list(len);
    for (int i = 0; i < len; i++)
      list->elements[i] = form_from_node(file_content, ts_node_named_child(node, i));
    rtval_t* val = alloc_val(rtval_list);
    val->list = list;
    return val;
  }
  printf("Error: form_from_node unknown node type %s\n", node_type_str);
  exit(1);
}

const TSLanguage *tree_sitter_wuns(void);

rtlist_t parse_all(const char *file_content, uint32_t file_size)
{
  TSParser *parser = ts_parser_new();

  ts_parser_set_language(parser, tree_sitter_wuns());

  TSTree *tree = ts_parser_parse_string(
      parser,
      NULL,
      file_content,
      file_size);

  // Get the root node of the syntax tree.
  TSNode root_node = ts_tree_root_node(tree);
  const int n_of_top_level_forms = ts_node_named_child_count(root_node);
  rtval_t **forms = malloc(sizeof(rtval_t*) * n_of_top_level_forms);
  for (int i = 0; i < n_of_top_level_forms; i++)
  {
    TSNode child = ts_node_named_child(root_node, i);
    rtval_t* form = form_from_node(file_content, child);
    forms[i] = form;
  }

  ts_tree_delete(tree);
  ts_parser_delete(parser);
  return (rtlist_t){.len = n_of_top_level_forms, .elements = forms};
}

bool is_word(rtval_t* a)
{
  assert_valid_tag(a->tag);
  return a->tag == rtval_word;
}

bool is_list(rtval_t* a)
{
  assert_valid_tag(a->tag);
  return a->tag == rtval_list;
}

int rtval_to_int(rtval_t a)
{
  assert(a.tag == rtval_i32 && "form_to_int requires an integer value");
  return a.i32;
}

rtval_t rtval_from_int(int32_t n)
{
  return (rtval_t){.tag = rtval_i32, .i32 = n};
}

// rtval_t rtval_from_word(word_t word)
// {
//   return (rtval_t){.tag = rtval_word, .word = word};
// }

#define BUILTIN_TWO_DECIMAL_OP(name, op)            \
  rtval_t name(rtval_t a, rtval_t b)                   \
  {                                                 \
    const int r = rtval_to_int(a) op rtval_to_int(b); \
    return rtval_from_int(r);                        \
  }

BUILTIN_TWO_DECIMAL_OP(bi_add, +)
BUILTIN_TWO_DECIMAL_OP(bi_sub, -)
BUILTIN_TWO_DECIMAL_OP(bi_mul, *)
BUILTIN_TWO_DECIMAL_OP(bi_bit_and, &)
BUILTIN_TWO_DECIMAL_OP(bi_bit_or, |)
BUILTIN_TWO_DECIMAL_OP(bi_bit_xor, ^)
BUILTIN_TWO_DECIMAL_OP(bi_bit_shift_left, <<)
BUILTIN_TWO_DECIMAL_OP(bi_bit_shift_right_unsigned, >>)

int bit_shift_right_signed(int v, int shift)
{
  int result = v >> shift;
  if (v >= 0)
    return result;
  return (result | (~0 << (sizeof(int) * CHAR_BIT - shift)));
}

rtval_t bi_bit_shift_right_signed(rtval_t a, rtval_t b)
{
  return rtval_from_int(bit_shift_right_signed(rtval_to_int(a), rtval_to_int(b)));
}

// form_t bi_eq(form_t a, form_t b)
// {
//   assert(is_word(a) && is_word(b) && "eq requires words");
//   return a.len == b.len && memcmp(a.word, b.word, a.len) == 0 ? one : zero;
// }

#define BUILTIN_TWO_DECIMAL_CMP(name, op)                 \
  rtval_t name(rtval_t a, rtval_t b)                         \
  {                                                       \
    return rtval_to_int(a) op rtval_to_int(b) ? one : zero; \
  }

BUILTIN_TWO_DECIMAL_CMP(bi_eq, ==)
BUILTIN_TWO_DECIMAL_CMP(bi_lt, <)
BUILTIN_TWO_DECIMAL_CMP(bi_le, <=)
BUILTIN_TWO_DECIMAL_CMP(bi_ge, >=)
BUILTIN_TWO_DECIMAL_CMP(bi_gt, >)

rtval_t bi_is_word(rtval_t* a)
{
  return is_word(a) ? one : zero;
}

rtval_t bi_is_list(rtval_t* a)
{
  return is_list(a) ? one : zero;
}

rtval_t bi_size(rtval_t* a)
{
  if (is_word(a))
    return rtval_from_int(a->word->len);
  if (is_list(a))
    return rtval_from_int(a->list->len);
  assert(false && "size requires a word or a list");
}

bool is_word_char(char c)
{
  switch (c)
  {
  case '-':
  case '.':
  case '/':
  case '0' ... '9':
  case 'a' ... 'z':
    return true;
  default:
    return false;
  }
}

rtval_t* bi_word_from_codepoints(rtval_t* a)
{
  assert(is_list(a) && "word_from_codepoints requires a list");
  const rtlist_t* codepoints = a->list;
  const int len = codepoints->len;
  char *word = malloc(len + 1);
  for (int i = 0; i < len; i++)
  {
    rtval_t* codepoint = codepoints->elements[i];
    int cp = rtval_to_int(codepoint);
    assert(is_word_char(cp) && "word_from_codepoints requires a list of decimal words corresponding to ascii codes for word characters");
    word[i] = cp;
  }
  word[len] = '\0';
  return word_from_string(word);
}

rtval_t* bi_log(rtval_t* a)
{
  printf("wuns: ");
  print_form(a);
  printf("\n");
  return unit;
}

rtval_t bi_abort()
{
  puts("wuns abort");
  exit(1);
  return unit;
}

rtval_t* bi_at(rtval_t* a, rtval_t* b)
{
  assert(is_list(a) && "at requires a list");
  const rtlist_t* list = a->list;
  int index = rtval_to_int(b);
  assert(index >= -list->len && index < list->len && "at index out of bounds");
  if (index < 0)
    index += list->len;
  return list->elements[index];
}

rtlist_t* rt_unit;

rtlist_t* slice(ssize_t len, rtval_t** elements, int start, int end)
{
  // do it like in js https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice
  // as ousterhout says as well don't throw errors, just return empty list
  if (start >= len)
    return rt_unit;
  if (start < -len)
    start = 0;
  else if (start < 0)
    start = len + start;

  if (end == 0 || end < -len)
    return rt_unit;
  if (end > len)
    end = len;
  else if (end < 0)
    end = len + end;

  const int length = end - start;
  if (length <= 0)
    return rt_unit;

  rtlist_t* result_list = alloc_list(length);
  for (int i = 0; i < length; i++)
    result_list->elements[i] = elements[start + i];

  return result_list;
}

rtval_t* bi_slice(rtval_t* v, rtval_t* i, rtval_t* j)
{
  assert(is_list(v) && "slice requires a list");
  const rtlist_t* list = v->list;
  const int start = rtval_to_int(i);
  const int end = rtval_to_int(j);
  // return (rtval_t){.tag = rtval_list, .list = slice(list->len, list->elements, start, end)};
  rtval_t* result = alloc_val(rtval_list);
  result->list = slice(list->len, list->elements, start, end);
  return result;
}

rtval_t* bi_gensym()
{
  static int counter = 0;
  char *result = malloc(12);
  sprintf(result, "gensym%d", counter++);
  return word_from_string(result);
}

// form_t bi_concat(size_t n, form_t *forms)
// {
//   ssize_t total_length = 0;
//   for (size_t i = 0; i < n; i++)
//   {
//     assert(is_list(forms[i]) && "concat requires lists");
//     total_length += forms[i].len;
//   }
//   if (total_length == 0)
//     return rt_unit;
//   form_t *concat_forms = malloc(sizeof(form_t) * total_length);
//   int k = 0;
//   for (size_t i = 0; i < n; i++)
//     for (int j = 0; j < forms[i].len; j++)
//       concat_forms[k++] = forms[i].forms[j];
//   return (form_t){.tag = form_list, .len = total_length, .forms = concat_forms};
// }

typedef struct
{
  const int parameters;
  union
  {
    rtval_t (*func0)();
    rtval_t (*func1)(rtval_t);
    rtval_t (*func2)(rtval_t, rtval_t);
    rtval_t (*func3)(rtval_t, rtval_t, rtval_t);
    rtval_t (*funcvar)(size_t, rtval_t *);
  };
} built_in_func_t;

typedef struct
{
  const char *name;
  built_in_func_t func;
} built_in_func_entry_t;

static const built_in_func_entry_t built_in_funcs[] = {
    {"abort", {.parameters = 0, .func0 = bi_abort}},
    {"gensym", {.parameters = 0, .func0 = bi_gensym}},

    {"is-word", {.parameters = 1, .func1 = bi_is_word}},
    {"is-list", {.parameters = 1, .func1 = bi_is_list}},
    {"size", {.parameters = 1, .func1 = bi_size}},
    {"log", {.parameters = 1, .func1 = bi_log}},

    {"add", {.parameters = 2, .func2 = bi_add}},
    {"sub", {.parameters = 2, .func2 = bi_sub}},
    {"mul", {.parameters = 2, .func2 = bi_mul}},
    {"bit-and", {.parameters = 2, .func2 = bi_bit_and}},
    {"bit-or", {.parameters = 2, .func2 = bi_bit_or}},
    {"bit-xor", {.parameters = 2, .func2 = bi_bit_xor}},
    {"bit-shift-left", {.parameters = 2, .func2 = bi_bit_shift_left}},
    {"bit-shift-right-signed", {.parameters = 2, .func2 = bi_bit_shift_right_signed}},
    {"bit-shift-right-unsigned", {.parameters = 2, .func2 = bi_bit_shift_right_unsigned}},

    {"eq", {.parameters = 2, .func2 = bi_eq}},
    {"lt", {.parameters = 2, .func2 = bi_lt}},
    {"le", {.parameters = 2, .func2 = bi_le}},
    {"ge", {.parameters = 2, .func2 = bi_ge}},
    {"gt", {.parameters = 2, .func2 = bi_gt}},

    {"at", {.parameters = 2, .func2 = bi_at}},
    {"word-from-codepoints", {.parameters = 1, .func1 = bi_word_from_codepoints}},

    {"slice", {.parameters = 3, .func3 = bi_slice}},

};

built_in_func_t get_builtin(const char *name)
{
  for (size_t i = 0; i < sizeof(built_in_funcs) / sizeof(built_in_func_entry_t); i++)
    if (streq(name, built_in_funcs[i].name))
      return built_in_funcs[i].func;
  return (built_in_func_t){.parameters = -1};
}

typedef struct
{
  const char *word;
  const rtval_t *form;
} Binding;

typedef struct Env
{
  const struct Env *parent;
  int len;
  const Binding *bindings;
} Env_t;

void print_env(const Env_t *env)
{
  while (env != NULL)
  {
    for (int i = 0; i < env->len; i++)
    {
      printf("print_env: %s: ", env->bindings[i].word);
      print_form(env->bindings[i].form);
      printf("\n");
    }
    env = env->parent;
  }
}

// typedef struct
// {
//   word_t name;
//   const rt_closure_t func_macro;
// } ClosureBinding;

// typedef struct
// {
//   int len;
//   ClosureBinding *bindings;
// } ClosureEnv;

// ClosureEnv func_macro_env = {
//     .len = 0,
//     .bindings = NULL,
// };

// void insert_func_macro_binding(ClosureBinding b)
// {
//   // todo handle overwriting properly
//   ClosureBinding *new_bindings = realloc(func_macro_env.bindings, sizeof(ClosureBinding) * (func_macro_env.len + 1));
//   memcpy(&new_bindings[func_macro_env.len], &b, sizeof(ClosureBinding));
//   func_macro_env.len++;
//   func_macro_env.bindings = new_bindings;
// }

rtval_t* eval(rtval_t* form, const Env_t *env)
{
  if (is_word(form))
  {
    const char *word = form->word->chars;
    Env_t *cur_env = (Env_t *)env;
    while (cur_env != NULL)
    {
      for (int i = 0; i < cur_env->len; i++)
        if (streq(word, cur_env->bindings[i].word))
          return cur_env->bindings[i].form;
      cur_env = (Env_t *)cur_env->parent;
    }
    // to do proper error handling
    printf("Error: word not found in env %s\n", word);
    exit(1);
  }
  assert(is_list(form) && "eval requires a list at this point");
  const rtlist_t* list = form->list;
  const int length = list->len;
  if (length == 0)
    return unit;
  const rtval_t **forms = list->elements;
  const rtval_t* first = forms[0];
  assert(is_word(first) && "first element a list must be a word");
  const char *first_word = first->word->chars;
  if (streq(first_word, "quote"))
  {
    // assert(length == 2 && "quote takes exactly one argument");
    if (length == 2)
      return forms[1];
    rtlist_t* list = slice(length, forms, 1, length);
    rtval_t* val = alloc_val(rtval_list);
    val->list = list;
    return val;
  }
  if (streq(first_word, "if"))
  {
    assert(length == 4 && "if takes three arguments");
    const rtval_t* cond = eval(forms[1], env);
    bool b = is_word(cond) &&
             cond->word->len == 1 &&
             cond->word->chars[0] == '0';
    return eval(forms[b ? 3 : 2], env);
  }
  {
    bool is_let = streq(first_word, "let");
    bool is_loop = streq(first_word, "loop");
    if (is_let || is_loop)
    {
      assert(length >= 2 && "let/loop must have at least two arguments");
      rtval_t* binding_form = forms[1];
      assert(is_list(binding_form) && "let/loop and loop bindings must be a list");
      const rtlist_t* binding_list = binding_form->list;
      const int binding_length = binding_list->len;
      assert(binding_length % 2 == 0 && "let/loop bindings must be a list of even length");
      const rtval_t *binding_forms = binding_list->elements;
      const int number_of_bindings = binding_length / 2;
      Binding *bindings = number_of_bindings == 0 ? NULL : malloc(sizeof(Binding) * number_of_bindings);
      Env_t new_env = {.parent = env, .len = 0, .bindings = bindings};
      for (int i = 0; i < binding_length; i += 2)
      {
        const rtval_t var = binding_forms[i];
        assert(is_word(&var) && "let/loop bindings must be words");
        bindings[new_env.len].word = var.word->chars;
        bindings[new_env.len].form = eval(&binding_forms[i + 1], &new_env);
        new_env.len++;
      }
      if (is_let)
      {
        rtval_t* result = unit;
        for (int i = 2; i < length; i++)
          result = eval(forms[i], &new_env);
        free(bindings);
        return result;
      }

      // is loop
      // while (true)
      // {
      //   rtval_t result = unit;
      //   for (int i = 2; i < length; i++)
      //     result = eval(forms[i], &new_env);
      //   if (result.tag == rtval_continue_special)
      //   {
      //     const ContinueBindings* cont_bindings = result.continue_update_bindings;
      //     free(cont_bindings.bindings);
      //     continue;
      //   }
      //   free(bindings);
      //   return result;
      // }
    }
  }
  // if (streq(first_word, "continue"))
  // {
  //   int bindings_length = ((length-1)/2);
  //   ContinueBinding *cont_bindings = malloc(sizeof(ContinueBinding) * bindings_length);
  //   for (int i = 0; i < length; i++){
  //     const rtval_t var = forms[i*2+1];
  //     const rtval_t val = forms[i*2+2];
  //     assert(is_word(var) && "continue bindings must be words");
  //     cont_bindings[i] = (Binding){.word = var.word.chars, .form = eval(val, env)};
  //   }
  //   return (rtval_t){.tag = rtval_continue_special,
  //           .continue_update_bindings = (ContinueBindings){.len = bindings_length, .bindings = cont_bindings}};
  // }
    if (streq(first_word, "func"))
    {
      assert(length >= 3 && "func must have at least two arguments");
      const rtval_t* fname = forms[1];
      assert(is_word(fname) && "func name must be a word");
      const rtval_t* params = forms[2];
      assert(is_list(params) && "func params must be a list");
      const rtlist_t* params_list = params->list;
      const int param_length = params_list->len;
      const rtval_t *params_forms = params_list->elements;
      for (int i = 0; i < param_length; i++)
      {
        assert(is_word(params_list->elements[i]) && "func params must be words");
      }
      const char *rest_param = NULL;
      int arity;
      if (param_length >= 2 && streq(params_forms[param_length - 2].word->chars, ".."))
      {
        rest_param = params_forms[param_length - 1].word->chars;
        arity = param_length - 2;
      }
      else
      {
        arity = param_length;
      }
      const char **parameters = malloc(arity * sizeof(char *));
      for (int i = 0; i < arity; i++)
        parameters[i] = params_forms[i].word->chars;
      const int n_of_bodies = length - 3;
      rtval_t **bodies = malloc(sizeof(rtval_t*) * n_of_bodies);
      for (int i = 3; i < length; i++)
        bodies[i - 3] = forms[i];
      rt_closure_t closure = {
          .arity = arity,
          .parameters = parameters,
          .rest_param = rest_param,
          .n_of_bodies = n_of_bodies,
          .bodies = bodies,
      };
      // ClosureBinding func_macro_binding = {.name = fname.word, .func_macro = func_macro};
      // insert_func_macro_binding(func_macro_binding);
      // {
      //   const rt_closure_t *test_func_macro = get_func_macro(fname.word);
      //   assert(test_func_macro != NULL && "func/macro not found");
      //   assert(test_func_macro->arity == arity && "func/macro arity mismatch");
      // }
      return unit;
    }


  const int number_of_given_args = length - 1;
  // const rt_closure_t *func_macro = get_func_macro(first_word);
  // if (func_macro == NULL)
  {
    const built_in_func_t builtin = get_builtin(first_word);
    if (builtin.parameters == -1)
    {
      printf("Error: unknown function %s\n", first_word);
      exit(1);
    }
    assert(builtin.parameters >= 0 && "builtin not found");
    assert(builtin.parameters == number_of_given_args && "builtin arity mismatch");
    switch (number_of_given_args)
    {
    case 0:
      return builtin.func0();
    case 1:
      return builtin.func1(eval(forms[1], env));
    case 2:
      return builtin.func2(eval(forms[1], env), eval(forms[2], env));
    case 3:
      return builtin.func3(eval(forms[1], env), eval(forms[2], env), eval(forms[3], env));
    default:
      printf("Error: unknown builtin function %s with arity %d\n", first_word, number_of_given_args);
      exit(1);
    }
  }
  // const bool is_macro = func_macro->is_macro;
  // const int number_of_regular_params = func_macro->arity;
  // const char *rest_param = func_macro->rest_param;
  // const char **parameters = func_macro->parameters;
  int number_of_given_params;
  // if (rest_param == NULL)
  // {
  //   assert(number_of_given_args == number_of_regular_params && "func/macro call arity mismatch");
  //   number_of_given_params = number_of_regular_params;
  // }
  // else
  // {
  //   assert(number_of_given_args >= number_of_regular_params && "func/macro call arity mismatch");
  //   number_of_given_params = number_of_regular_params + 1;
  // }

  // eval args if func
  // we don't really need to make eval
  rtval_t **args = malloc(sizeof(rtval_t*) * number_of_given_args);
  {
    for (int i = 1; i < length; i++)
      args[i - 1] = eval(forms[i], env);
  }

  Binding *bindings = malloc(sizeof(Binding) * number_of_given_params);
  const Env_t new_env = {.parent = env, .len = number_of_given_params, .bindings = bindings};
  // for (int i = 0; i < number_of_regular_params; i++)
  //   bindings[i] = (Binding){.word = parameters[i], .form = args[i]};

  // if (rest_param != NULL)
  //   bindings[number_of_regular_params] =
  //       (Binding){
  //           .word = rest_param,
  //           .form = slice(number_of_given_args, args, number_of_regular_params, number_of_given_args)};
  // free(args);
  // const rtval_t *bodies = func_macro->bodies;
  // const int n_of_bodies = func_macro->n_of_bodies;
  rtval_t* result = unit;
  // for (int i = 0; i < n_of_bodies; i++)
  //   result = eval(bodies[i], &new_env);
  free(bindings);
  // if (is_macro)
  //   result = eval(result, env);

  return result;
}

void parse_eval(const char *file_content, uint32_t file_size)
{
  rtlist_t top_level_forms = parse_all(file_content, file_size);
  for (int i = 0; i < top_level_forms.len; i++)
  {
    rtval_t* form = top_level_forms.elements[i];
    // print_form(form);
    // printf("\n");
    rtval_t* result = eval(form, NULL);
    print_form(result);
    printf("\n");
  }
}

void eval_file(const char* filename) {
  FILE *file = fopen(filename, "r");
  if (file == NULL)
  {
    printf("Error: could not open file\n");
    exit(1);
  }
  // read entire file into memory
  int err = fseek(file, 0, SEEK_END);
  if (err != 0)
  {
    printf("Error: could not seek file\n");
    exit(1);
  }
  long file_size = ftell(file);
  if (file_size == -1)
  {
    printf("Error: could not get file size\n");
    exit(1);
  }
  err = fseek(file, 0, SEEK_SET);
  if (err != 0)
  {
    printf("Error: could not seek file\n");
    exit(1);
  }
  const void *file_content = malloc(file_size);
  if (file_content == NULL)
  {
    printf("Error: could not allocate memory\n");
    exit(1);
  }
  size_t read_size = fread(file_content, 1, file_size, file);
  if (read_size != file_size)
  {
    printf("Error: could not read file\n");
    exit(1);
  }

  parse_eval(file_content, file_size);

  fclose(file);
}

#include <stdio.h>
#include <string.h>

#define OK       0
#define NO_INPUT 1
#define TOO_LONG 2
static int getLine (char *prmpt, char *buff, size_t sz) {
    int ch, extra;

    // Get line with buffer overrun protection.
    if (prmpt != NULL) {
        printf ("%s", prmpt);
        fflush (stdout);
    }
    if (fgets (buff, sz, stdin) == NULL)
        return NO_INPUT;

    // If it was too long, there'll be no newline. In that case, we flush
    // to end of line so that excess doesn't affect the next call.
    if (buff[strlen(buff)-1] != '\n') {
        extra = 0;
        while (((ch = getchar()) != '\n') && (ch != EOF))
            extra = 1;
        return (extra == 1) ? TOO_LONG : OK;
    }

    // Otherwise remove newline and give string back to caller.
    buff[strlen(buff)-1] = '\0';
    return OK;
}

int main(int argc, char **argv)
{
  zero = rtval_from_int(0);
  one = rtval_from_int(1);
  two = rtval_from_int(2);

  rt_unit = &(rtlist_t){.len = 0, .elements = NULL};

  unit = &(rtval_t){.tag = rtval_list, .list = rt_unit};

  for (int i = 1; i < argc; i++)
    eval_file(argv[i]);
  while(1)
  {
    char buff[128];

    int rc = getLine ("cwuns> ", buff, sizeof(buff));
    if (rc == NO_INPUT) {
        // Extra NL since my system doesn't output that on EOF.
        printf ("\nNo input\n");
        return 1;
    }

    if (rc == TOO_LONG) {
        printf ("Input too long [%s]\n", buff);
        return 1;
    }
    int len = strlen(buff);
    if (len == 0){
      printf ("bye\n");
      break;
    }
    parse_eval(buff, len);
  }

  return 0;
}
