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
        char* word;
        struct {
            int count;
            struct form** cells;
        } list;
    };
} form_t;

/* Memory allocation tracking, quake-style */
void* safe_malloc(size_t size) {
    void* ptr = malloc(size);
    if (!ptr) {
        fprintf(stderr, "Out of memory!\n");
        exit(1);
    }
    return ptr;
}

/* Constructors */
form_t* lval_word(const char* sym) {
    form_t* v = safe_malloc(sizeof(form_t));
    v->type = T_WORD;
    v->word = strdup(sym);
    return v;
}

form_t* lval_list(void) {
    form_t* v = safe_malloc(sizeof(form_t));
    v->type = T_LIST;
    v->list.count = 0;
    v->list.cells = NULL;
    return v;
}

/* List management */
void lval_add(form_t* list, form_t* x) {
    list->list.count++;
    list->list.cells = realloc(list->list.cells, sizeof(form_t*) * list->list.count);
    list->list.cells[list->list.count - 1] = x;
}

/* Parsing functions */
char* read_token(char* input, char* token) {
    while (*input == ' ' || *input == '\n' || *input == '\t') input++;
    char* tok_start = token;

    if (*input == '[' || *input == ']') {
        *token++ = *input++;
    } else {
        while (*input != ' ' && *input != '[' && *input != ']' && *input != '\0') {
            *token++ = *input++;
        }
    }
    *token = '\0';
    return input;
}

/* Tokenize input and parse into lval_t structures */
form_t* parse_input(char* input) {
    char token[MAX_TOKEN_LENGTH];
    char* cur = input;
    form_t* stack[MAX_LIST_DEPTH];
    int depth = 0;

    form_t* current = lval_list();

    while (*cur) {
        cur = read_token(cur, token);
        if (token[0] == '\0') continue;

        if (token[0] == '[') {
            stack[depth++] = current;
            current = lval_list();
        } else if (token[0] == ']') {
            if (depth == 0) {
                fprintf(stderr, "Unexpected ']'!\n");
                exit(1);
            }
            form_t* parent = stack[--depth];
            lval_add(parent, current);
            current = parent;
        } else {
            lval_add(current, lval_word(token));
        }
    }

    if (depth != 0) {
        fprintf(stderr, "Unexpected end of input!\n");
        exit(1);
    }

    return current;
}

/* Memory cleanup */
void lval_del(form_t* v) {
    if (v->type == T_LIST) {
        for (int i = 0; i < v->list.count; i++) {
            lval_del(v->list.cells[i]);
        }
        free(v->list.cells);
    } else if (v->type == T_WORD) {
        free(v->word);
    }
    free(v);
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
    struct rtenv* parent;
} rtenv_t;

rtenv_t* rtenv_new(void) {
    rtenv_t* env = safe_malloc(sizeof(rtenv_t));
    env->count = 0;
    env->syms = NULL;
    env->vals = NULL;
    env->parent = NULL;
    return env;
}

/* Eval function */
rtval_t* lval_eval(rtenv_t* env, form_t* v) {
    if (v->type == T_WORD) {
        for (int i = 0; i < env->count; i++) {
            if (strcmp(env->syms[i], v->word) == 0) return env->vals[i];
        }
        fprintf(stderr, "Error: Unbound symbol '%s'!\n", v->word);
        exit(1);
    }
    assert(v->type == T_LIST);
    int count = v->list.count;
    assert(count > 0);

    form_t* first = v->list.cells[0];
    if (first->type != T_WORD) {
        fprintf(stderr, "Error: list does not start with symbol, was %d\n", first->type);
        lval_del(v);
        exit(1);
    }
    char* first_word = first->word;

    if (strcmp(first_word, "i32") == 0) {
        if (v->list.count != 2) {
            fprintf(stderr, "Error: 'i32' expects exactly one argument!\n");
            lval_del(v);
            exit(1);
        }
        form_t* arg = v->list.cells[1];
        assert(arg->type == T_WORD);
        char* endptr;
        errno = 0;
        const long result = strtol(arg->word, &endptr, 10);
        if (errno != 0) {
            perror("strtol");
            lval_del(v);
            exit(1);
        }
        if (*endptr != '\0') {
            fprintf(stderr, "Error: non-integer argument for 'i32'!\n");
            lval_del(v);
            exit(1);
        }
        if (result < INT32_MIN || result > INT32_MAX) {
            fprintf(stderr, "Error: integer out of range for 'i32'!\n");
            lval_del(v);
            exit(1);
        }
        // int32_t result = atoi(arg->word);
        return rtval_i32(result);
    }

    /* Unknown symbol */
    fprintf(stderr, "Unknown symbol: %s\n", first->word);
    lval_del(v);
    exit(1);
}

/* Main */
int main(int argc, char** argv) {
    if (argc != 2) {
        printf("Usage: %s <expression>\n", argv[0]);
        return 1;
    }

    form_t* exprs = parse_input(argv[1]);
    assert(exprs->type == T_LIST && exprs->list.count == 1);
    form_t* expr = exprs->list.cells[0];
    rtval_t* result = lval_eval(rtenv_new(), expr);
    rtval_print(result);
    printf("\n");
    return 0;
}
