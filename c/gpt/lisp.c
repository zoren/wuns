#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <errno.h>

#define MAX_TOKEN_LENGTH 120
#define MAX_LIST_DEPTH 128

typedef enum { T_WORD, T_LIST } form_type_t;

typedef struct form {
    form_type_t type;
    union {
        const char* word;
        struct {
            int count;
            struct form** cells;
        } list;
    };
} form_t;

void* safe_malloc(size_t size) {
    void* ptr = malloc(size);
    assert(ptr && "Memory allocation failed!");
    return ptr;
}

/* Constructors */
form_t* form_word(const char* sym) {
    form_t* v = safe_malloc(sizeof(form_t));
    v->type = T_WORD;
    v->word = strdup(sym);
    return v;
}

form_t* form_list(void) {
    form_t* v = safe_malloc(sizeof(form_t));
    v->type = T_LIST;
    v->list.count = 0;
    v->list.cells = NULL;
    return v;
}

/* List management */
void form_add(form_t* list, form_t* x) {
    list->list.count++;
    list->list.cells = realloc(list->list.cells, sizeof(form_t*) * list->list.count);
    list->list.cells[list->list.count - 1] = x;
}

/* Memory cleanup */
void form_del(form_t* v) {
    switch (v->type)
    {
    case T_WORD:
        free((void*)v->word);
        break;
    case T_LIST:
        for (int i = 0; i < v->list.count; i++) {
            form_del(v->list.cells[i]);
        }
        free(v->list.cells);
        break;
    default:
        break;
    }
    free(v);
}

/* Tokenize input and parse into form_t structures */
form_t* parse_all_forms(char* input) {
    char token[MAX_TOKEN_LENGTH];
    char* cur = input;
    form_t* stack[MAX_LIST_DEPTH];
    int depth = 0;

    form_t* current = form_list();

    while (*cur) {
        while (*cur == ' ' || *cur == '\n' || *cur == '\t') cur++;
        int token_cur = 0;
        if (*cur == '[' || *cur == ']') {
            token[token_cur++] = *cur++;
        } else {
            while (*cur != ' ' && *cur != '[' && *cur != ']' && *cur != '\0') {
                assert(token_cur < MAX_TOKEN_LENGTH && "Token too long!");
                token[token_cur++] = *cur++;
            }
        }
        token[token_cur] = '\0';
        switch (token[0]) {
            case '\0':
                continue;
            case '[':
                assert(depth < MAX_LIST_DEPTH && "Parse stack overflow!");
                stack[depth++] = current;
                current = form_list();
                break;
            case ']':
                assert(depth > 0 && "Unexpected ']'!");
                form_t* parent = stack[--depth];
                form_add(parent, current);
                current = parent;
                break;
            default:
                form_add(current, form_word(token));
                continue;
        }
    }

    if (depth != 0) {
        fprintf(stderr, "Unexpected end of input!\n");
        exit(1);
    }

    return current;
}

typedef enum { RT_I32 } rtval_type_t;

typedef struct rtval {
    rtval_type_t type;
    union {
        int32_t i32;
    };
} rtval_t;

rtval_t* rtval_i32(int32_t i) {
    rtval_t* v = safe_malloc(sizeof(rtval_t));
    v->type = RT_I32;
    v->i32 = i;
    return v;
}

void rtval_print(rtval_t* v) {
    switch (v->type) {
        case RT_I32:
            printf("[i32 %d]", v->i32);
            break;
    }
}

typedef struct rtenv {
    int count;
    char** syms;
    rtval_t** vals;
} rtenv_t;

rtenv_t* rtenv_new(void) {
    rtenv_t* env = safe_malloc(sizeof(rtenv_t));
    env->count = 0;
    env->syms = NULL;
    env->vals = NULL;
    return env;
}

void rtenv_set(rtenv_t* env, const char* sym, rtval_t* val) {
    for (int i = 0; i < env->count; i++) {
        if (strcmp(env->syms[i], sym) == 0) {
            env->vals[i] = val;
            return;
        }
    }
    int prev_count = env->count;
    env->count++;
    env->syms = realloc(env->syms, sizeof(char*) * env->count);
    env->vals = realloc(env->vals, sizeof(rtval_t*) * env->count);
    env->syms[prev_count] = strdup(sym);
    env->vals[prev_count] = val;
}

rtenv_t* env;

int32_t parse_i32(const char* word){
    char* endptr;
    errno = 0;
    const long result = strtol(word, &endptr, 10);
    if (errno != 0) {
        perror("strtol");
        exit(1);
    }
    assert(*endptr == '\0' && "Error: non-integer argument for 'i32'!");
    assert(result >= INT32_MIN && result <= INT32_MAX && "Error: integer out of range for 'i32'!");
    return (int32_t)result;
}

const char* get_form_word(form_t* v) {
    assert(v->type == T_WORD);
    return v->word;
}

/* Eval function */
rtval_t* eval(form_t* v) {
    if (v->type == T_WORD) {
        for (int i = 0; i < env->count; i++)
            if (strcmp(env->syms[i], v->word) == 0) return env->vals[i];
        assert(0 && "Unbound symbol!");
    }
    assert(v->type == T_LIST);
    int count = v->list.count;
    struct form** cells = v->list.cells;
    assert(count > 0);

    form_t* first = cells[0];
    assert(first->type == T_WORD && "First element of list must be a symbol!");
    const char* first_word = first->word;

    if (strcmp(first_word, "i32") == 0) {
        assert(count == 2 && "i32 expects exactly one argument!");
        return rtval_i32(parse_i32(get_form_word(cells[1])));
    }

    if (strcmp(first_word, "def") == 0) {
        assert(count == 3 && "def expects exactly two arguments!");
        form_t* arg1 = cells[1];
        assert(arg1->type == T_WORD);
        rtval_t* val = eval(cells[2]);
        rtenv_set(env, arg1->word, val);
        return val;
    }
    assert(0 && "Unknown symbol" && first->word);
}

/* Main */
int main(int argc, char** argv) {
    if (argc != 2) {
        printf("Usage: %s <expression>\n", argv[0]);
        return 1;
    }

    form_t* exprs = parse_all_forms(argv[1]);
    assert(exprs->type == T_LIST);
    env = rtenv_new();
    for (int i = 0; i < exprs->list.count; i++) {
        rtval_t* result = eval(exprs->list.cells[i]);
        rtval_print(result);
        printf("\n");
    }
    return 0;
}
