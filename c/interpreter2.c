#include <stdbool.h>
#include <stdlib.h>
#include <stdio.h>
#include <assert.h>
#include <errno.h>
#include <string.h>

#include "interpreter2.h"

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

#define MAX_WORD_SIZE 127

const word_t *word_make(const char *start, const size_t size)
{
  assert(size <= MAX_WORD_SIZE && "word size exceeded");
  word_t *word = malloc(sizeof(word_t) + size + 1);
  word->size = size;
  memcpy(word->chars, start, size);
  word->chars[size] = '\0';
  return (const word_t *)word;
}

const word_t *word_copy(const word_t *word)
{
  return word_make(word->chars, word->size);
}

bool word_eq(const word_t *a, const word_t *b)
{
  if (a->size != b->size)
    return false;
  return memcmp(a->chars, b->chars, a->size) == 0;
}

const form_t *form_alloc(form_t f)
{
  form_t *form = malloc(sizeof(form_t));
  *form = f;
  return form;
}

const form_t *form_word_alloc(const word_t *word)
{
  return form_alloc((form_t){T_WORD, .word = word});
}

const form_t *form_list_alloc(const form_list_t *list)
{
  return form_alloc((form_t){T_LIST, .list = list});
}

void form_free(const form_t *form)
{
  switch (form->type)
  {
  case T_WORD:
    free((void *)form->word);
    break;
  case T_LIST:
  {
    const form_list_t *list = form->list;
    for (size_t i = 0; i < list->size; i++)
      form_free((form_t *)list->cells[i]);
    free((void *)list);
    break;
  }
  }
  free((void *)form);
}

const form_t *form_copy(const form_t *form);

form_list_t *form_list_slice_copy(const form_list_t *list, size_t start, size_t end)
{
  assert(start <= end && "invalid slice");
  assert(end <= list->size && "invalid slice");
  const size_t size = end - start;
  form_list_t *new_list = malloc(sizeof(form_list_t) + sizeof(form_t *) * size);
  new_list->size = size;
  for (size_t i = 0; i < size; i++)
    new_list->cells[i] = form_copy(list->cells[start + i]);
  return new_list;
}

const form_t *form_copy(const form_t *form)
{
  switch (form->type)
  {
  case T_WORD:
    return form_word_alloc(word_copy(form->word));
  case T_LIST:
    return form_list_alloc(form_list_slice_copy(form->list, 0, form->list->size));
  }
  assert(false && "unreachable");
}

typedef struct
{
  size_t capacity;
  size_t size;
  const form_t **elements;
} form_list_buffer_t;

void append_form(form_list_buffer_t *buffer, const form_t *form)
{
  if (buffer->size == buffer->capacity)
  {
    buffer->capacity *= 2;
    buffer->elements = realloc(buffer->elements, sizeof(form_t *) * buffer->capacity);
  }
  buffer->elements[buffer->size++] = form;
}

const form_list_t *make_form_list_from_buffer(form_list_buffer_t *buffer)
{
  size_t size = buffer->size;
  size_t byte_size = sizeof(form_t *) * size;
  form_list_t *list = malloc(sizeof(form_list_t) + byte_size);
  list->size = size;
  memcpy(list->cells, buffer->elements, byte_size);
  return list;
}

#define MAX_FORM_DEPTH 16
#define INIT_BUFFER_SIZE 8

void exitWithError(const char *message)
{
  if (message != NULL)
  {
    fprintf(stderr, "Error: %s\n", message);
  }
  exit(1);
}

#define check_exit(cond, message) \
  if (!(cond))                    \
  exitWithError(message)

const form_t *parse_one(const char **start, const char *end)
{
  char *cur = (char *)*start;
  assert(cur != nullptr && "expected non-null start");
  form_list_buffer_t stack[MAX_FORM_DEPTH] = {0};
  int depth = -1;
  const form_t *cur_form = nullptr;
  while (cur < end)
  {
    const char c = *cur;
    if (is_word_char(c))
    {
      const char *word_start = cur;
      cur++;
      size_t word_len = 1;
      while (is_word_char(*cur))
      {
        cur++;
        word_len++;
        check_exit(word_len < MAX_WORD_SIZE, "word size exceeded");
      }
      cur_form = form_word_alloc(word_make(word_start, word_len));
      if (depth == -1)
        break;
      append_form(&stack[depth], cur_form);
    }
    else if (is_whitespace(c))
    {
      cur++;
    }
    else if (c == '[')
    {
      cur++;
      depth++;
      check_exit(depth < MAX_FORM_DEPTH, "form depth exceeded");
      assert(stack[depth].size == 0 && "unexpected non-empty stack");
      if (stack[depth].elements == nullptr)
      {
        stack[depth].capacity = INIT_BUFFER_SIZE;
        stack[depth].elements = malloc(sizeof(form_t *) * INIT_BUFFER_SIZE);
      }
    }
    else if (c == ']')
    {
      cur++;
      if (depth == -1)
        break;
      cur_form = form_list_alloc(make_form_list_from_buffer(&stack[depth]));
      stack[depth].size = 0;
      depth--;
      if (depth == -1)
        break;
      append_form(&stack[depth], cur_form);
    }
    else
    {
      exitWithError("unknown character");
    }
  }
  *start = cur;
  while (depth > -1)
  {
    // close open lists
    cur_form = form_list_alloc(make_form_list_from_buffer(&stack[depth]));
    stack[depth].size = 0;
    depth--;
    if (depth == -1)
      break;
    append_form(&stack[depth], cur_form);
  }
  for (int i = 0; i < MAX_FORM_DEPTH; i++)
  {
    const form_t **elems = stack[i].elements;
    if (elems == nullptr)
      break;
    free(elems);
  }
  return cur_form;
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
    for (size_t i = 1; i < form->list->size; i++)
    {
      printf(" ");
      print_form(form->list->cells[i]);
    }
    printf("]");
    break;
  }
}

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
  case rtval_list:
  {
    rtval_list_t *list = val->list;
    if (list->size == 0)
    {
      printf("[]");
      return;
    }
    printf("[");
    print_rtval(&list->values[0]);
    for (size_t i = 1; i < list->size; i++)
    {
      printf(" ");
      print_rtval(&list->values[i]);
    }
    printf("]");
    break;
  }
  case rtval_undefined:
    printf("*undefined*");
    break;
  case rtval_continue:
    printf("*continue*");
    break;
  case rtval_func:
    printf("[fn %s]", val->func->name->chars);
    break;
  }
}

const word_t *try_get_word(const form_t *form)
{
  if (form->type != T_WORD)
    return nullptr;
  return form->word;
}

const word_t *get_word(const form_t *form)
{
  check_exit(form->type == T_WORD, "expected word");
  return form->word;
}

const form_list_t *get_list(const form_t *form)
{
  check_exit(form->type == T_LIST, "expected list");
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
    exitWithError("non-integer argument for 'i32'");
  }
  check_exit(*endptr == '\0', "non-integer argument for 'i32'");
  check_exit(result >= INT32_MIN && result <= INT32_MAX, "integer out of range for 'i32'");
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
    exitWithError("non-float argument for 'f64'");
  }
  check_exit(*endptr == '\0', "non-float argument for 'f64'");
  return result;
}

typedef enum
{
  SF_I32,
  SF_F64,
  SF_WORD,
  SF_INTRINSIC,
  SF_IF,
  SF_DO,
  SF_LET,
  SF_LETFN,
  SF_TYPE_ANNO,
  SF_LOOP,
  SF_CONTINUE,
  SF_SWITCH,
  SF_FUNC,
  SF_DEF,
  SF_DEFN,
  SF_DEFEXPR,
  SF_DEFMACRO,
  SF_LOAD,
  SF_TYPE,
  SF_IMPORT,
  SF_EXPORT
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

typedef struct
{
  int len;
  binding_t *bindings;
  const special_form_type_t special_form_type;
} local_env_t;

typedef enum env_type
{
  ENV_DEF,
  ENV_LOCAL
} env_type_t;

typedef struct
{
  const struct local_stack *parent;
  local_env_t *env;
} local_stack_frame_t;

typedef struct local_stack
{
  env_type_t type;
  union
  {
    const def_env_t *def_env;
    local_stack_frame_t *frame;
  };
} local_stack_t;

const def_env_t *get_def_env(const local_stack_t *stackp)
{
  const local_stack_t *stack = stackp;
  while (stack->type == ENV_LOCAL)
  {
    stack = stack->frame->parent;
  }
  return stack->def_env;
}

local_env_t *get_outer_loop(const local_stack_t *stackp)
{
  local_stack_t *stack = (local_stack_t *)stackp;
  while (stack->type == ENV_LOCAL)
  {
    if (stack->frame->env->special_form_type == SF_LOOP)
      return stack->frame->env;
    stack = (local_stack_t *)stack->frame->parent;
  }
  return nullptr;
}

void def_env_set(def_env_t *denv, const word_t *word, rtval_t value)
{
  for (int i = 0; i < denv->size; i++)
  {
    if (word_eq(denv->bindings[i].name, word))
    {
      // here we need to free the old value, we leak memory here
      // but it could be referenced elsewhere
      denv->bindings[i].value = value;
      return;
    }
  }
  if (denv->size == denv->capacity)
  {
    denv->capacity *= 2;
    denv->bindings = realloc(denv->bindings, sizeof(binding_t) * denv->capacity);
  }
  denv->bindings[denv->size++] = (binding_t){.name = (word_t *)word_copy(word), .value = value};
}

rtval_t def_env_lookup(const def_env_t *denv, const word_t *word)
{
  for (int i = 0; i < denv->size; i++)
  {
    binding_t binding = denv->bindings[i];
    if (word_eq(binding.name, word))
      return binding.value;
  }
  exitWithError("word not found in env");
}

rtval_t lookup(const local_stack_t *env, const word_t *word)
{
  const local_stack_t *cur_stack = env;
  while (cur_stack != nullptr)
  {
    if (cur_stack->type == ENV_DEF)
      return def_env_lookup(cur_stack->def_env, word);
    assert(cur_stack->type == ENV_LOCAL && "expected local env");
    const local_env_t *cur_env = cur_stack->frame->env;
    for (int i = cur_env->len; i-- > 0;)
    {
      if (word_eq(cur_env->bindings[i].name, word))
        return cur_env->bindings[i].value;
    }
    cur_stack = cur_stack->frame->parent;
  }
  assert(false && "lookup: word not found in env");
}

void update_env_var(local_env_t *env, const word_t *word, rtval_t value)
{
  for (int i = env->len; i-- > 0;)
  {
    if (word_eq(env->bindings[i].name, word))
    {
      env->bindings[i].value = value;
      return;
    }
  }
  exitWithError("update_env_var: word not found in env");
}

rtval_t eval_exp(const local_stack_t *env, const form_t *form)
{
  if (form->type == T_WORD)
    return lookup(env, form->word);

  const form_list_t *list = form->list;
  check_exit(list->size > 0, "empty list");
  const word_t *name = try_get_word(list->cells[0]);
  check_exit(name, "direct form application not implemented");
  const struct special_form *spec = try_get_wuns_special_form(name->chars, name->size);
  if (!spec)
  {
    rtval_t fn = lookup(env, name);
    check_exit(fn.tag == rtval_func, "expected function");
    const rtfunc_t *func = fn.func;
    const int arity = func->arity;
    const int numOfArgs = list->size - 1;
    check_exit(numOfArgs >= arity, "too few arguments");
    const int numBindings = func->rest_param ? arity + 1 : arity;
    binding_t *bindings = malloc(sizeof(binding_t) * numBindings);
    for (int i = 0; i < arity; i++)
    {
      const word_t *var = func->params[i];
      const rtval_t val = eval_exp(env, list->cells[i + 1]);
      bindings[i] = (binding_t){.name = var, .value = val};
    }
    if (func->rest_param)
    {
      int numRest = numOfArgs - arity;
      rtval_list_t *rest = malloc(sizeof(rtval_list_t) + sizeof(rtval_t) * numRest);
      rest->size = numRest;
      for (int i = 0; i < numRest; i++)
        rest->values[i] = eval_exp(env, list->cells[arity + i + 1]);
      bindings[arity] = (binding_t){.name = func->rest_param, .value = (rtval_t){.tag = rtval_list, .list = rest}};
    }
    else
    {
      check_exit(numOfArgs == arity, "too many arguments");
    }
    const def_env_t *denv = get_def_env(env);
    const local_stack_t top_env = {.type = ENV_DEF, .def_env = denv};
    local_env_t new_lenv = {.len = numBindings, .bindings = bindings, .special_form_type = SF_LET};
    local_stack_t new_stack = {.type = ENV_LOCAL, .frame = &(local_stack_frame_t){.parent = &top_env, .env = &new_lenv}};
    const form_list_t *bodies = func->bodies;
    if (bodies->size == 0)
    {
      free(bindings);
      return (rtval_t){.tag = rtval_undefined, .i32 = 0};
    }
    for (size_t i = 0; i < bodies->size - 1; i++)
      eval_exp(&new_stack, bodies->cells[i]);
    const rtval_t result = eval_exp(&new_stack, bodies->cells[bodies->size - 1]);
    free(bindings);
    return result;
  }
  switch (spec->type)
  {
  case SF_I32:
  {
    check_exit(list->size == 2, "i32 requires exactly one argument");
    const word_t *arg_word = get_word(list->cells[1]);
    const int32_t arg_val = parse_i32(arg_word->chars);
    return (rtval_t){.tag = rtval_i32, .i32 = arg_val};
  }
  case SF_F64:
  {
    check_exit(list->size == 2, "f64 requires exactly one argument");
    const word_t *arg_word = get_word(list->cells[1]);
    const double arg_val = parse_f64(arg_word->chars);
    return (rtval_t){.tag = rtval_f64, .f64 = arg_val};
  }
  case SF_INTRINSIC:
  {
    check_exit(list->size > 1, "intrinsic requires at least one argument");
    const word_t *arg_word = get_word(list->cells[1]);
    const struct intrinsic *intrinsic = try_get_wuns_intrinsic(arg_word->chars, arg_word->size);
    check_exit(intrinsic, "unknown intrinsic");
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
      check_exit(list->size == 4, "intrinsic requires exactly two arguments");
      const rtval_t arg1 = eval_exp(env, list->cells[2]);
      const rtval_t arg2 = eval_exp(env, list->cells[3]);
      check_exit(arg1.tag == rtval_i32 && arg2.tag == rtval_i32, "intrinsic requires i32 arguments");
      return (rtval_t){.tag = rtval_i32, .i32 = eval_i32_bin_intrinsic(intrinsic->type, arg1.i32, arg2.i32)};
    }
    case INTRINSIC_F64_ADD:
    case INTRINSIC_F64_SUB:
    case INTRINSIC_F64_MUL:
    case INTRINSIC_F64_DIV:
    {
      check_exit(list->size == 4, "intrinsic requires exactly two arguments");
      const rtval_t arg1 = eval_exp(env, list->cells[2]);
      const rtval_t arg2 = eval_exp(env, list->cells[3]);
      check_exit(arg1.tag == rtval_f64 && arg2.tag == rtval_f64, "intrinsic requires f64 arguments");
      return (rtval_t){.tag = rtval_f64, .f64 = eval_f64_bin_arith_intrinsic(intrinsic->type, arg1.f64, arg2.f64)};
    }
    case INTRINSIC_F64_EQ:
    case INTRINSIC_F64_NE:
    case INTRINSIC_F64_LT:
    case INTRINSIC_F64_GT:
    case INTRINSIC_F64_LE:
    case INTRINSIC_F64_GE:
    {
      check_exit(list->size == 4, "intrinsic requires exactly two arguments");
      const rtval_t arg1 = eval_exp(env, list->cells[2]);
      const rtval_t arg2 = eval_exp(env, list->cells[3]);
      check_exit(arg1.tag == rtval_f64 && arg2.tag == rtval_f64, "intrinsic requires f64 arguments");
      return eval_f64_bin_cmp_intrinsic(intrinsic->type, arg1.f64, arg2.f64);
    }
    }
  }
  case SF_IF:
  {
    check_exit(list->size == 4, "if requires exactly three arguments");
    const rtval_t cond = eval_exp(env, list->cells[1]);
    check_exit(cond.tag == rtval_i32, "if requires i32 condition");
    return eval_exp(env, list->cells[cond.i32 ? 2 : 3]);
  }
  case SF_DO:
  {
    if (list->size == 1)
      return (rtval_t){.tag = rtval_undefined, .i32 = 0};
    for (size_t i = 1; i < list->size - 1; i++)
      eval_exp(env, list->cells[i]);
    return eval_exp(env, list->cells[list->size - 1]);
  }
  case SF_LET:
  {
    check_exit(list->size >= 2, "let requires at least two arguments");
    const form_list_t *bindingForms = get_list(list->cells[1]);
    check_exit(bindingForms->size % 2 == 0, "let bindings must be a list of even length");
    const int number_of_bindings = bindingForms->size / 2;
    binding_t *bindingVals = malloc(sizeof(binding_t) * number_of_bindings);
    local_env_t new_lenv = {.len = 0, .bindings = bindingVals, .special_form_type = SF_LET};
    local_stack_t new_stack = {.type = ENV_LOCAL, .frame = &(local_stack_frame_t){.parent = env, .env = &new_lenv}};
    for (int i = 0; i < number_of_bindings; i++)
    {
      const word_t *var = get_word(bindingForms->cells[i * 2]);
      const rtval_t val = eval_exp(&new_stack, bindingForms->cells[i * 2 + 1]);
      bindingVals[i] = (binding_t){.name = var, .value = val};
      new_lenv.len++;
    }
    if (list->size == 2)
      return (rtval_t){.tag = rtval_undefined, .i32 = 0};
    for (size_t i = 2; i < list->size - 1; i++)
      eval_exp(&new_stack, list->cells[i]);
    const rtval_t res = eval_exp(&new_stack, list->cells[list->size - 1]);
    free(bindingVals);
    return res;
  }
  case SF_LOOP:
  {
    check_exit(list->size >= 2, "let requires at least two arguments");
    const form_list_t *bindingForms = get_list(list->cells[1]);
    check_exit(bindingForms->size % 2 == 0, "let bindings must be a list of even length");
    const int number_of_bindings = bindingForms->size / 2;
    binding_t *bindingVals = malloc(sizeof(binding_t) * number_of_bindings);
    local_env_t new_lenv = {.len = 0, .bindings = bindingVals, .special_form_type = SF_LOOP};
    local_stack_t new_stack = {.type = ENV_LOCAL, .frame = &(local_stack_frame_t){.parent = env, .env = &new_lenv}};
    for (int i = 0; i < number_of_bindings; i++)
    {
      const word_t *var = get_word(bindingForms->cells[i * 2]);
      const rtval_t val = eval_exp(&new_stack, bindingForms->cells[i * 2 + 1]);
      bindingVals[i] = (binding_t){.name = var, .value = val};
      new_lenv.len++;
    }
    if (list->size == 2)
      return (rtval_t){.tag = rtval_undefined, .i32 = 0};
    while (1)
    {
      for (size_t i = 2; i < list->size - 1; i++)
        eval_exp(&new_stack, list->cells[i]);
      rtval_t res = eval_exp(&new_stack, list->cells[list->size - 1]);
      if (res.tag == rtval_continue)
        continue;
      free(bindingVals);
      return res;
    }
  }
  case SF_CONTINUE:
  {
    check_exit(list->size % 2 != 0, "continue requires an even number of arguments");
    local_env_t *loop_env = get_outer_loop(env);
    check_exit(loop_env, "continue not in loop");
    for (size_t i = 1; i < list->size; i += 2)
    {
      const word_t *var = get_word(list->cells[i]);
      const rtval_t val = eval_exp(env, list->cells[i + 1]);
      update_env_var(loop_env, var, val);
    }
    return (rtval_t){.tag = rtval_continue};
  }
  case SF_SWITCH:
  {
    check_exit(list->size >= 3, "switch requires at least two arguments");
    check_exit(list->size % 2 != 0, "switch requires an odd number of arguments");
    const rtval_t cond = eval_exp(env, list->cells[1]);
    for (size_t i = 2; i < list->size - 1; i += 2)
    {
      const form_list_t *case_values = get_list(list->cells[i]);
      for (size_t j = 0; j < case_values->size; j++)
      {
        const rtval_t case_val = eval_exp(env, case_values->cells[j]);
        if (case_val.tag != cond.tag)
          continue;
        switch (case_val.tag)
        {
        case rtval_i32:
          if (case_val.i32 == cond.i32)
            return eval_exp(env, list->cells[i + 1]);
          break;
        case rtval_f64:
          // maybe only allow i32...
          if (case_val.f64 == cond.f64)
            return eval_exp(env, list->cells[i + 1]);
          break;
        default:
          break;
        }
      }
    }
    const form_t *default_case = list->cells[list->size - 1];
    return eval_exp(env, default_case);
  }
  case SF_LETFN:
  case SF_TYPE_ANNO:
  case SF_FUNC:
  case SF_WORD:
  {
    exitWithError("not implemented");
  }
  case SF_DEF:
  case SF_DEFN:
  case SF_DEFEXPR:
  case SF_DEFMACRO:
  case SF_LOAD:
  case SF_TYPE:
  case SF_IMPORT:
  case SF_EXPORT:
    exitWithError("unexpected top special form in exp");
  default:
    printf("unknown special form: %s\n", name->chars);
    exitWithError("unknown special form");
  }
}

rtval_t eval_top(def_env_t *denv, const form_t *form)
{
  const local_stack_t* env = &(local_stack_t){.type = ENV_DEF, .def_env = denv};
  if (form->type == T_LIST)
  {
    const form_list_t *list = form->list;
    if (list->size > 0)
    {
      const word_t *name = try_get_word(list->cells[0]);
      if (name != nullptr)
      {
        const struct special_form *spec = try_get_wuns_special_form(name->chars, name->size);
        if (spec != nullptr)
        {
          switch (spec->type)
          {
          case SF_DEF:
          {
            check_exit(list->size == 3, "def requires exactly two arguments");
            const word_t *var = get_word(list->cells[1]);
            const word_t *cvar = word_copy(var);
            const rtval_t val = eval_exp(env, list->cells[2]);
            def_env_set(denv, cvar, val);
            return val;
          }
          case SF_DEFN:
          {
            check_exit(list->size >= 3, "defn requires at least three arguments");
            const word_t *fname = get_word(list->cells[1]);
            const form_list_t *paramForms = get_list(list->cells[2]);
            const word_t **params;
            const word_t *rest_param = nullptr;
            int arity;
            if (paramForms->size > 1 && strncmp(get_word(paramForms->cells[paramForms->size - 2])->chars, "..", 2) == 0)
            {
              arity = paramForms->size - 2;
              params = malloc(sizeof(word_t *) * arity);
              for (int i = 0; i < arity; i++)
              {
                params[i] = word_copy(get_word(paramForms->cells[i]));
              }
              rest_param = word_copy(get_word(paramForms->cells[paramForms->size - 1]));
            }
            else
            {
              arity = paramForms->size;
              params = malloc(sizeof(word_t *) * arity);
              for (int i = 0; i < arity; i++)
              {
                params[i] = word_copy(get_word(paramForms->cells[i]));
              }
            }
            const form_list_t *bodies = form_list_slice_copy(list, 3, list->size);
            rtfunc_t func = (rtfunc_t){
                .name = word_copy(fname),
                .arity = arity,
                .params = (const word_t **)params,
                .rest_param = rest_param,
                .bodies = bodies};
            rtfunc_t *funcp = malloc(sizeof(rtfunc_t));
            memcpy(funcp, &func, sizeof(rtfunc_t));
            rtval_t result = (rtval_t){.tag = rtval_func, .func = funcp};
            def_env_set(denv, fname, result);
            return result;
          }
          case SF_DEFEXPR:
          case SF_DEFMACRO:
          case SF_LOAD:
          case SF_TYPE:
          case SF_IMPORT:
          case SF_EXPORT:
          {
            exitWithError("not implemented");
          }

          default:
          {
            return eval_exp(env, form);
          }
          }
        }
      }
    }
  }
  return eval_exp(env, form);
}

const form_t *parse_one_string(const char *start)
{
  const char *end = start + strlen(start);
  const form_t *form = parse_one(&start, end);
  assert(form && "no form parsed");
  print_form(form);
  return form;
}

rtval_t *parse_eval(const char *start)
{
  const form_t *form = parse_one_string(start);
  const int initial_capacity = 1;
  binding_t *defBindings = malloc(sizeof(binding_t) * initial_capacity);
  def_env_t denv = (def_env_t){.size = 0, .capacity = initial_capacity, .bindings = defBindings};
  const local_stack_t env = {.type = ENV_DEF, .def_env = &denv};
  const rtval_t result = eval_exp(&env, form);
  rtval_t *result_ptr = malloc(sizeof(rtval_t));
  memcpy(result_ptr, &result, sizeof(rtval_t));
  free(defBindings);
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
  case rtval_continue:
    return "continue";
  case rtval_func:
    return "func";
  case rtval_list:
    return "list";
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
    assert(false && "expected i32 or f64");
  }
}

int32_t rt_get_size(rtval_t *val)
{
  switch (val->tag)
  {
  case rtval_list:
    return val->list->size;
  default:
    assert(false && "expected list");
  }
}

rtval_t *rt_get_list(rtval_t *val, int index)
{
  switch (val->tag)
  {
  case rtval_list:
    assert(index >= 0 && "index out of bounds");
    assert(index < (int)val->list->size && "index out of bounds");
    return &val->list->values[index];
  default:
    assert(false && "expected list");
  }
}

rtval_t *parse_eval_top_forms(const char *start)
{
  const int initial_capacity = 128;
  binding_t *defBindings = malloc(sizeof(binding_t) * initial_capacity);
  def_env_t denv = (def_env_t){.size = 0, .capacity = initial_capacity, .bindings = defBindings};
  const char *end = start + strlen(start);
  const char **cur = &start;
  rtval_t result = (rtval_t){.tag = rtval_undefined, .i32 = 0};
  while (start < end)
  {
    const form_t *form = parse_one(cur, end);
    if (!form)
      break;
    result = eval_top(&denv, form);
    form_free((form_t *)form);
  }
  free(defBindings);
  rtval_t *result_ptr = malloc(sizeof(rtval_t));
  memcpy(result_ptr, &result, sizeof(rtval_t));
  return result_ptr;
}
