#pragma once

typedef struct
{
  uint8_t size;
  char chars[];
} word_t;

typedef struct
{
  size_t size;
  const struct form *cells[];
} form_list_t;

typedef struct form
{
  enum
  {
    T_WORD,
    T_LIST
  } type;
  union
  {
    const word_t *word;
    const form_list_t *list;
  };
} form_t;

const form_t *parse_one(const char **start, const char *end);
void print_form(const form_t *form);


typedef enum runtime_value_tag
{
  rtval_i32,
  rtval_f64,
  rtval_func,
  rtval_list,
  // pseudo-values not meant to be returned
  rtval_undefined,
  rtval_continue,
} rtval_tag;

typedef struct
{
  const word_t *name;
  const int arity;
  const word_t **params;
  const word_t *rest_param;
  const form_list_t *bodies;
} rtfunc_t;

typedef struct
{
  rtval_tag tag;
  union
  {
    int32_t i32;
    double f64;
    rtfunc_t *func;
    struct rtval_list *list;
  };
} rtval_t;

typedef struct rtval_list
{
  size_t size;
  rtval_t values[];
} rtval_list_t;

typedef struct
{
  const word_t *name;
  rtval_t value;
} binding_t;

typedef struct
{
  int size;
  int capacity;
  binding_t *bindings;
} def_env_t;

rtval_t eval_top(def_env_t *denv, const form_t *form);
void form_free(const form_t *form);
void print_rtval(const rtval_t *val);
