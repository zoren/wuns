#include <stdbool.h>
#include <stdlib.h>
#include <stdio.h>
#include <assert.h>
#include <errno.h>
#include <string.h>

bool is_whitespace(char c)
{
  return c == ' ' || c == '\n';
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

typedef long ssize_t;

typedef struct word
{
  ssize_t size;
  const char *chars;
} word_t;

typedef enum form_type
{
  T_WORD,
  T_LIST
} form_type_t;

typedef struct form_list
{
  ssize_t size;
  const struct form **cells;
} form_list_t;

typedef struct form
{
  form_type_t type;
  union
  {
    const word_t *word;
    const form_list_t *list;
  };
} form_t;

#define MAX_FORM_DEPTH 128

const word_t *make_word(const char *start, const char *end)
{
  const ssize_t size = end - start;
  char *chars = malloc(size + 1);
  memcpy(chars, start, size);
  chars[size] = '\0';

  word_t *word = malloc(sizeof(word_t));
  word->size = size;
  word->chars = chars;
  return (const word_t *)word;
}

const form_t *make_form_word(const word_t *word)
{
  form_t *new_form = malloc(sizeof(form_t));
  new_form->type = T_WORD;
  new_form->word = word;
  return new_form;
}

const form_t *make_form_list(const form_list_t *list)
{
  form_t *new_form = malloc(sizeof(form_t));
  new_form->type = T_LIST;
  new_form->list = list;
  return new_form;
}

typedef struct form_list_buffer
{
  ssize_t capacity;
  ssize_t size;
  form_t **cells;
} form_list_buffer_t;

void append_form(form_list_buffer_t *buffer, const form_t *form)
{
  if (buffer->size == buffer->capacity)
  {
    buffer->capacity *= 2;
    buffer->cells = realloc(buffer->cells, sizeof(form_t *) * buffer->capacity);
  }
  buffer->cells[buffer->size++] = form;
}

const form_list_t *make_form_list_from_buffer(form_list_buffer_t *buffer)
{
  form_list_t *list = malloc(sizeof(form_list_t));
  ssize_t size = buffer->size;
  list->size = size;
  size_t byte_size = sizeof(form_t *) * size;
  const form_t **cells = malloc(byte_size);
  memcpy(cells, buffer->cells, byte_size);
  list->cells = cells;
  return list;
}

const form_t *parse_one(const char **start, const char *end)
{
  char *cur = (char *)*start;
  assert(cur != nullptr && "expected non-null start");
  form_list_buffer_t stack[MAX_FORM_DEPTH];
  int depth = -1;
  while (cur < end)
  {
    const char c = *cur;
    if (is_word_char(c))
    {
      const char *word_start = cur;
      cur++;
      while (is_word_char(*cur))
        cur++;
      const form_t *f = make_form_word(make_word(word_start, (const char *)cur));
      if (depth == -1)
        return f;
      append_form(&stack[depth], f);
    }
    else if (is_whitespace(c))
    {
      cur++;
    }
    else if (c == '[')
    {
      cur++;
      if (depth == MAX_FORM_DEPTH)
      {
        printf("Error: form depth exceeded\n");
        exit(1);
      }
      depth++;
      stack[depth].capacity = 8;
      stack[depth].size = 0;
      stack[depth].cells = malloc(sizeof(form_t *) * stack[depth].capacity);
    }
    else if (c == ']')
    {
      cur++;
      if (depth == -1)
      {
        printf("Error: unexpected ']'\n");
        exit(1);
      }
      const form_list_t *list = make_form_list_from_buffer(&stack[depth]);
      depth--;
      const form_t *f = make_form_list(list);
      if (depth == -1)
        return f;
      append_form(&stack[depth], f);
    }
    else
    {
      printf("Error: unknown character %c\n", c);
      exit(1);
    }
  }
  if (depth != -1)
    return make_form_list(make_form_list_from_buffer(&stack[0]));
  return nullptr;
}

void print_form(const form_t *form)
{
  switch (form->type)
  {
  case T_WORD:
    printf("%s", form->word->chars);
    break;
  case T_LIST:
    if (form->list->size == 0)
    {
      printf("[]");
      return;
    }
    printf("[");
    print_form(form->list->cells[0]);
    for (int i = 1; i < form->list->size; i++)
    {
      printf(" ");
      print_form(form->list->cells[i]);
    }
    printf("]");
    break;
  }
}

typedef enum runtime_value_tag
{
  rtval_i32,
  rtval_f64,
  rtval_undefined,
  rtval_continue
} rtval_tag;

typedef struct rtval
{
  rtval_tag tag;
  union
  {
    int32_t i32;
    double f64;
  };
} rtval_t;

void print_rtval(const rtval_t *val)
{
  switch (val->tag)
  {
  case rtval_i32:
    printf("%i", val->i32);
    break;
  case rtval_f64:
    printf("%f", val->f64);
    break;
  case rtval_undefined:
    printf("*undefined*");
  case rtval_continue:
    printf("*continue*");
    break;
  }
}

const word_t *get_word(const form_t *form)
{
  assert(form->type == T_WORD && "expected word");
  return form->word;
}

const form_list_t *get_list(const form_t *form)
{
  assert(form->type == T_LIST && "expected list");
  return form->list;
}

int32_t parse_i32(const char *word)
{
  char *endptr;
  errno = 0;
  const long result = strtol(word, &endptr, 10);
  if (errno != 0)
  {
    perror("strtol");
    assert(false && "Error: non-integer argument for 'i32'!");
  }
  assert(*endptr == '\0' && "Error: non-integer argument for 'i32'!");
  assert(result >= INT32_MIN && result <= INT32_MAX && "Error: integer out of range for 'i32'!");
  return (int32_t)result;
}

double parse_f64(const char *word)
{
  char *endptr;
  errno = 0;
  const double result = strtod(word, &endptr);
  if (errno != 0)
  {
    perror("strtod");
    assert(false && "Error: non-float argument for 'f64'!");
  }
  assert(*endptr == '\0' && "Error: non-float argument for 'f64'!");
  return result;
}

typedef enum
{
  SF_I32,
  SF_F64,
  SF_INTRINSIC,
  SF_IF,
  SF_DO,
  SF_LET,
  SF_LOOP,
  SF_CONTINUE,
  SF_SWITCH
} special_form_type_t;

typedef struct special_form
{
  char *name;
  special_form_type_t type;
} special_form_t;

typedef enum
{
  INTRINSIC_I32_ADD,
  INTRINSIC_I32_SUB,
  INTRINSIC_I32_MUL,
  INTRINSIC_I32_DIV_S,
  INTRINSIC_I32_REM_S,

  INTRINSIC_I32_EQ,
  INTRINSIC_I32_NE,
  INTRINSIC_I32_LT_S,
  INTRINSIC_I32_GT_S,
  INTRINSIC_I32_LE_S,
  INTRINSIC_I32_GE_S,

  INTRINSIC_I32_AND,
  INTRINSIC_I32_OR,
  INTRINSIC_I32_XOR,
  INTRINSIC_I32_SHL,
  INTRINSIC_I32_SHR_S,
  INTRINSIC_I32_SHR_U,

  INTRINSIC_F64_ADD,
  INTRINSIC_F64_SUB,
  INTRINSIC_F64_MUL,
  INTRINSIC_F64_DIV,

  INTRINSIC_F64_EQ,
  INTRINSIC_F64_NE,
  INTRINSIC_F64_LT,
  INTRINSIC_F64_GT,
  INTRINSIC_F64_LE,
  INTRINSIC_F64_GE
} intrinsic_type_t;

typedef struct intrinsic
{
  char *name;
  intrinsic_type_t type;
} intrinsic_t;

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wmissing-field-initializers"
#include "special_forms.h"

#include "intrinsics.h"
#pragma clang diagnostic pop

int32_t eval_i32_bin_intrinsic(intrinsic_type_t t, int32_t a, int32_t b)
{
  switch (t)
  {
  case INTRINSIC_I32_ADD:
    return a + b;
  case INTRINSIC_I32_SUB:
    return a - b;
  case INTRINSIC_I32_MUL:
    return a * b;
  case INTRINSIC_I32_DIV_S:
    return a / b;
  case INTRINSIC_I32_REM_S:
    return a % b;

  case INTRINSIC_I32_EQ:
    return a == b;
  case INTRINSIC_I32_NE:
    return a != b;
  case INTRINSIC_I32_LT_S:
    return a < b;
  case INTRINSIC_I32_GT_S:
    return a > b;
  case INTRINSIC_I32_LE_S:
    return a <= b;
  case INTRINSIC_I32_GE_S:
    return a >= b;

  case INTRINSIC_I32_AND:
    return a & b;
  case INTRINSIC_I32_OR:
    return a | b;
  case INTRINSIC_I32_XOR:
    return a ^ b;
  case INTRINSIC_I32_SHL:
    return a << b;
  case INTRINSIC_I32_SHR_S:
    return a >> b;
  case INTRINSIC_I32_SHR_U:
    return (unsigned)a >> (unsigned)b;
  default:
    break;
  }
  printf("Error: unknown intrinsic type\n");
  exit(1);
}

double eval_f64_bin_arith_intrinsic(intrinsic_type_t t, double a, double b)
{
  switch (t)
  {
  case INTRINSIC_F64_ADD:
    return a + b;
  case INTRINSIC_F64_SUB:
    return a - b;
  case INTRINSIC_F64_MUL:
    return a * b;
  case INTRINSIC_F64_DIV:
    return a / b;
  default:
    break;
  }
  printf("Error: unknown intrinsic type\n");
  exit(1);
}

rtval_t eval_f64_bin_cmp_intrinsic(intrinsic_type_t t, double a, double b)
{
  switch (t)
  {
  case INTRINSIC_F64_EQ:
    return (rtval_t){.tag = rtval_i32, .i32 = a == b};
  case INTRINSIC_F64_NE:
    return (rtval_t){.tag = rtval_i32, .i32 = a != b};
  case INTRINSIC_F64_LT:
    return (rtval_t){.tag = rtval_i32, .i32 = a < b};
  case INTRINSIC_F64_GT:
    return (rtval_t){.tag = rtval_i32, .i32 = a > b};
  case INTRINSIC_F64_LE:
    return (rtval_t){.tag = rtval_i32, .i32 = a <= b};
  default:
    break;
  }
  printf("Error: unknown intrinsic type\n");
  exit(1);
}

typedef struct binding
{
  word_t *name;
  rtval_t value;
} binding_t;

typedef struct env
{
  int len;
  struct binding *bindings;
  const struct env *parent;
  const special_form_type_t special_form_type;
} env_t;

const env_t *make_env(const struct binding *bindings, int len, const env_t *parent)
{
  env_t *env = malloc(sizeof(env_t));
  env->len = len;
  env->bindings = bindings;
  env->parent = parent;
  return env;
}

bool word_eq(const word_t *a, const word_t *b)
{
  if (a->size != b->size)
    return false;
  return memcmp(a->chars, b->chars, a->size) == 0;
}

const rtval_t lookup(const env_t *env, const word_t *word)
{
  const env_t *cur_env = env;
  while (cur_env != nullptr)
  {
    for (int i = cur_env->len; i-- > 0;)
    {
      if (word_eq(cur_env->bindings[i].name, word))
        return cur_env->bindings[i].value;
    }
    cur_env = cur_env->parent;
  }
  assert(false && "lookup: word not found in env");
}

void update_env_var(env_t *env, const word_t *word, rtval_t value)
{
  for(int i = env->len; i-- > 0;)
  {
    if (word_eq(env->bindings[i].name, word))
    {
      env->bindings[i].value = value;
      return;
    }
  }
  assert(false && "update_env_var: word not found in env");
}

rtval_t eval_form(const env_t *env, const form_t *form)
{
  switch (form->type)
  {
  case T_WORD:
  {
    return lookup(env, form->word);
  }
  case T_LIST:
  {
    const form_list_t *list = form->list;
    assert(list->size > 0 && "empty list");
    const word_t *name = get_word(list->cells[0]);
    const struct special_form *spec = try_get_wuns_special_form(name->chars, name->size);
    assert(spec && "unknown special form");
    switch (spec->type)
    {
    case SF_I32:
    {
      assert(list->size == 2 && "i32 requires exactly one argument");
      const word_t *arg_word = get_word(list->cells[1]);
      const int32_t arg_val = parse_i32(arg_word->chars);
      return (rtval_t){.tag = rtval_i32, .i32 = arg_val};
    }
    case SF_F64:
    {
      assert(list->size == 2 && "f64 requires exactly one argument");
      const word_t *arg_word = get_word(list->cells[1]);
      const double arg_val = parse_f64(arg_word->chars);
      return (rtval_t){.tag = rtval_f64, .f64 = arg_val};
    }
    case SF_INTRINSIC:
    {
      assert(list->size > 1 && "intrinsic requires at least one argument");
      const word_t *arg_word = get_word(list->cells[1]);
      const struct intrinsic *intrinsic = try_get_wuns_intrinsic(arg_word->chars, arg_word->size);
      assert(intrinsic && "unknown intrinsic");
      switch (intrinsic->type)
      {
      case INTRINSIC_I32_ADD:
      case INTRINSIC_I32_SUB:
      case INTRINSIC_I32_MUL:
      case INTRINSIC_I32_DIV_S:
      case INTRINSIC_I32_REM_S:

      case INTRINSIC_I32_EQ:
      case INTRINSIC_I32_NE:
      case INTRINSIC_I32_LT_S:
      case INTRINSIC_I32_GT_S:
      case INTRINSIC_I32_LE_S:
      case INTRINSIC_I32_GE_S:

      case INTRINSIC_I32_AND:
      case INTRINSIC_I32_OR:
      case INTRINSIC_I32_XOR:
      case INTRINSIC_I32_SHL:
      case INTRINSIC_I32_SHR_S:
      case INTRINSIC_I32_SHR_U:
      {
        assert(list->size == 4 && "intrinsic requires exactly two arguments");
        const rtval_t arg1 = eval_form(env, list->cells[2]);
        const rtval_t arg2 = eval_form(env, list->cells[3]);
        assert(arg1.tag == rtval_i32 && arg2.tag == rtval_i32 && "intrinsic requires i32 arguments");
        return (rtval_t){.tag = rtval_i32, .i32 = eval_i32_bin_intrinsic(intrinsic->type, arg1.i32, arg2.i32)};
      }
      case INTRINSIC_F64_ADD:
      case INTRINSIC_F64_SUB:
      case INTRINSIC_F64_MUL:
      case INTRINSIC_F64_DIV:
      {
        assert(list->size == 4 && "intrinsic requires exactly two arguments");
        const rtval_t arg1 = eval_form(env, list->cells[2]);
        const rtval_t arg2 = eval_form(env, list->cells[3]);
        assert(arg1.tag == rtval_f64 && arg2.tag == rtval_f64 && "intrinsic requires f64 arguments");
        return (rtval_t){.tag = rtval_f64, .f64 = eval_f64_bin_arith_intrinsic(intrinsic->type, arg1.f64, arg2.f64)};
      }
      case INTRINSIC_F64_EQ:
      case INTRINSIC_F64_NE:
      case INTRINSIC_F64_LT:
      case INTRINSIC_F64_GT:
      case INTRINSIC_F64_LE:
      case INTRINSIC_F64_GE:
      {
        assert(list->size == 4 && "intrinsic requires exactly two arguments");
        const rtval_t arg1 = eval_form(env, list->cells[2]);
        const rtval_t arg2 = eval_form(env, list->cells[3]);
        assert(arg1.tag == rtval_f64 && arg2.tag == rtval_f64 && "intrinsic requires f64 arguments");
        return eval_f64_bin_cmp_intrinsic(intrinsic->type, arg1.f64, arg2.f64);
      }
      }
    }
    case SF_IF:
    {
      assert(list->size == 4 && "if requires exactly three arguments");
      const rtval_t cond = eval_form(env, list->cells[1]);
      assert(cond.tag == rtval_i32 && "if requires i32 condition");
      return eval_form(env, list->cells[cond.i32 ? 2 : 3]);
    }
    case SF_DO:
    {
      if (list->size == 1)
        return (rtval_t){.tag = rtval_undefined, .i32 = 0};
      for (int i = 1; i < list->size - 1; i++)
        eval_form(env, list->cells[i]);
      return eval_form(env, list->cells[list->size - 1]);
    }
    case SF_LET:
    {
      assert(list->size >= 2 && "let requires at least two arguments");
      const form_list_t *bindingForms = get_list(list->cells[1]);
      assert(bindingForms->size % 2 == 0 && "let bindings must be a list of even length");
      const int number_of_bindings = bindingForms->size / 2;
      const form_t **binding_forms = bindingForms->cells;
      binding_t *bindingVals = number_of_bindings == 0 ? NULL : malloc(sizeof(struct binding) * number_of_bindings);
      env_t new_env = {.parent = env, .len = 0, .bindings = bindingVals, .special_form_type = SF_LET};
      for (int i = 0; i < number_of_bindings; i++)
      {
        const word_t *var = get_word(binding_forms[i * 2]);
        const rtval_t val = eval_form(&new_env, binding_forms[i * 2 + 1]);
        binding_t binding = {.name = var, .value = val};
        bindingVals[i] = binding;
        new_env.len++;
      }
      if (list->size == 2)
        return (rtval_t){.tag = rtval_undefined, .i32 = 0};
      for (int i = 2; i < list->size - 1; i++)
        eval_form(&new_env, list->cells[i]);
      return eval_form(&new_env, list->cells[list->size - 1]);
    }
    case SF_LOOP:
    {
      assert(list->size >= 2 && "let requires at least two arguments");
      const form_list_t *bindingForms = get_list(list->cells[1]);
      assert(bindingForms->size % 2 == 0 && "let bindings must be a list of even length");
      const int number_of_bindings = bindingForms->size / 2;
      const form_t **binding_forms = bindingForms->cells;
      binding_t *bindingVals = number_of_bindings == 0 ? NULL : malloc(sizeof(struct binding) * number_of_bindings);
      env_t new_env = {.parent = env, .len = 0, .bindings = bindingVals, .special_form_type = SF_LOOP};
      for (int i = 0; i < number_of_bindings; i++)
      {
        const word_t *var = get_word(binding_forms[i * 2]);
        const rtval_t val = eval_form(&new_env, binding_forms[i * 2 + 1]);
        binding_t binding = {.name = var, .value = val};
        bindingVals[i] = binding;
        new_env.len++;
      }
      if (list->size == 2)
        return (rtval_t){.tag = rtval_undefined, .i32 = 0};
      while (1)
      {
        for (int i = 2; i < list->size - 1; i++)
          eval_form(&new_env, list->cells[i]);
        rtval_t res = eval_form(&new_env, list->cells[list->size - 1]);
        if (res.tag == rtval_continue)
          continue;
        return res;
      }
    }
    case SF_CONTINUE:
    {
      assert(list->size % 2 != 0 && "continue requires an even number of arguments");
      env_t *loop_env = env;
      while (loop_env->special_form_type != SF_LOOP)
      {
        loop_env = loop_env->parent;
        assert(loop_env && "continue not in loop");
      }
      const int bindings_length = (list->size - 1) / 2;
      for(int i = 1; i < list->size; i+=2){
        const word_t *var = get_word(list->cells[i]);
        const rtval_t val = eval_form(env, list->cells[i+1]);
        update_env_var(loop_env, var, val);
      }
      return (rtval_t){.tag = rtval_continue};
    }
    case SF_SWITCH:
    {
      assert(list->size >= 3 && "switch requires at least two arguments");
      assert (list->size % 2 != 0 && "switch requires an odd number of arguments");
      const rtval_t cond = eval_form(env, list->cells[1]);
      for (int i = 2; i < list->size - 1; i+=2)
      {
        const form_list_t* case_values = get_list(list->cells[i]);
        for (int j = 0; j < case_values->size; j++)
        {
          const rtval_t case_val = eval_form(env, case_values->cells[j]);
          if (case_val.tag != cond.tag) continue;
          switch (case_val.tag)
          {
          case rtval_i32:
            if (case_val.i32 == cond.i32)
              return eval_form(env, list->cells[i+1]);
            break;
          case rtval_f64:
            if (case_val.f64 == cond.f64)
              return eval_form(env, list->cells[i+1]);
            break;
          default:
            break;
          }
        }
      }
      const form_t* default_case = list->cells[list->size-1];
      return eval_form(env, default_case);
    }
    }
    exit(1);
  }
  }
  exit(1);
}

const form_t *parse_one_string(const char *start)
{
  // printf("Parsing: %s\n", start);
  const char *end = start + strlen(start);
  const form_t *form = parse_one(&start, end);
  assert(form && "no form parsed");
  print_form(form);
  return form;
}

double parse_eval_f64(const char *start)
{
  const form_t *form = parse_one_string(start);
  const rtval_t result = eval_form(nullptr, form);
  switch (result.tag)
  {
  case rtval_f64:
    return result.f64;
    break;
  case rtval_i32:
    return result.i32;
    break;

  default:
    break;
  }
  assert(false && "expected f64");
}

rtval_t *parse_eval(const char *start)
{
  const form_t *form = parse_one_string(start);
  const rtval_t result = eval_form(nullptr, form);
  rtval_t *result_ptr = malloc(sizeof(rtval_t));
  memcpy(result_ptr, &result, sizeof(rtval_t));
  return result_ptr;
}

const char *get_type(rtval_t *val)
{
  switch (val->tag)
  {
  case rtval_i32:
    return "i32";
  case rtval_f64:
    return "f64";
  case rtval_undefined:
    return "undefined";
  default:
    return "unknown";
  }
}

double get_f64(rtval_t *val)
{
  switch (val->tag)
  {
  case rtval_f64:
    return val->f64;
    break;
  case rtval_i32:
    return val->i32;
    break;

  default:
    break;
  }
}

int main(int argc, char **argv)
{
  if (argc != 2)
  {
    printf("Usage: %s <expression>\n", argv[0]);
    return 1;
  }
  const form_t *form = parse_one_string(argv[1]);
  print_form(form);
  const rtval_t result = eval_form(nullptr, form);
  printf("\n");
  print_rtval(&result);
  printf("\n");
}
