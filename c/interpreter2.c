#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
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
  const form_t **cells = malloc(sizeof(form_t *) * size);
  memcpy(cells, buffer->cells, sizeof(form_t *) * size);
  list->cells = cells;
  return list;
}

const form_t *parse_one(char **start, const char *end)
{
  char *cur = *start;
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

      // while (cur < end && is_whitespace(*cur)) cur++;
      // while()
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
  rtval_f64
} rtval_tag;

typedef struct rtval
{
  rtval_tag tag;
  union
  {
    const int32_t i32;
    const double f64;
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
  }
}

const word_t *get_word(const form_t *form)
{
  if (form->type != T_WORD)
  {
    printf("Error: expected word\n");
    exit(1);
  }
  return form->word;
}

const form_list_t *get_form(const form_t *form)
{
  if (form->type != T_LIST)
  {
    printf("Error: expected list\n");
    exit(1);
  }
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
    exit(1);
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
    exit(1);
  }
  assert(*endptr == '\0' && "Error: non-float argument for 'f64'!");
  return result;
}

typedef enum
{
  SF_I32,
  SF_F64,
  SF_INTRINSIC
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

  INTRINSIC_I32_EQ,
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
  case INTRINSIC_I32_EQ:
    return a == b;
  }
  printf("Error: unknown intrinsic type\n");
  exit(1);
}

rtval_t eval_form(const form_t *form)
{
  switch (form->type)
  {
  case T_WORD: {
    assert(false && "Error: cannot evaluate word");
  }
  case T_LIST:
  {
    const form_list_t *list = form->list;
    if (list->size == 0)
    {
      printf("Error: empty list\n");
      exit(1);
    }
    const word_t *name = get_word(list->cells[0]);
    const struct special_form *spec = try_get_wuns_special_form(name->chars, name->size);
    if (!spec)
    {
      printf("Error: unknown special form %s\n", name->chars);
      exit(1);
    }
    switch (spec->type)
    {
    case SF_I32:
    {
      const word_t *arg_word = get_word(list->cells[1]);
      const int32_t arg_val = parse_i32(arg_word->chars);
      return (rtval_t){.tag = rtval_i32, .i32 = arg_val};
    }
    case SF_F64:
    {
      const word_t *arg_word = get_word(list->cells[1]);
      const double arg_val = parse_f64(arg_word->chars);
      return (rtval_t){.tag = rtval_f64, .f64 = arg_val};
    }
    case SF_INTRINSIC:
    {
      assert(list->size > 1 && "intrinsic requires at least one argument");
      const word_t *arg_word = get_word(list->cells[1]);
      const struct intrinsic *intrinsic = try_get_wuns_intrinsic(arg_word->chars, arg_word->size);
      assert(intrinsic && "Error: unknown intrinsic");
      switch (intrinsic->type)
      {
        case INTRINSIC_I32_ADD:
        case INTRINSIC_I32_SUB:
        case INTRINSIC_I32_MUL:
        case INTRINSIC_I32_EQ:
        {
          assert(list->size == 4 && "i32.add requires exactly two arguments");
          const rtval_t arg1 = eval_form(list->cells[2]);
          const rtval_t arg2 = eval_form(list->cells[3]);
          assert(arg1.tag == rtval_i32 && arg2.tag == rtval_i32 && "i32.add requires i32 arguments");
          return (rtval_t){.tag = rtval_i32, .i32 = eval_i32_bin_intrinsic(intrinsic->type, arg1.i32, arg2.i32)};
        }
      }

    }
    }
    exit(1);
  }
  }
  exit(1);
}

int main(int argc, char **argv)
{
  if (argc != 2)
  {
    printf("Usage: %s <expression>\n", argv[0]);
    return 1;
  }
  char *start = argv[1];
  const char *end = argv[1] + strlen(start);
  const form_t *form = parse_one(&start, end);
  if (form == nullptr)
  {
    printf("Error: no form parsed\n");
    return 1;
  }
  print_form(form);
  const rtval_t result = eval_form(form);
  printf("\n");
  print_rtval(&result);
  printf("\n");
  // for (int i = 1; i < argc; i++) {
  //   const char* name = argv[i];
  //   const char* res = is_wuns_special_form(name, strlen(name));
  //   if (res) {
  //     printf("%s is a special form %i\n", name, res == name);
  //   } else {
  //     printf("%s is not a special form\n", name);
  //   }
  // }
}
