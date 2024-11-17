all: shell web

i2.o: interpreter2.c special_forms.h intrinsics.h
	emcc interpreter2.c -std=c2x -c -o i2.o

web: i2.o
	emcc i2.o -o i2.js \
	-sMODULARIZE \
	-sEXPORTED_FUNCTIONS="['_parse_one_string', '_get_f64', '_get_type', '_rt_get_list', '_rt_get_size', '_parse_eval', '_parse_eval_top_forms']" \
	-sEXPORTED_RUNTIME_METHODS="['ccall', 'cwrap']"

shell: interpreter2.c main.c special_forms.h intrinsics.h
	clang -Wall -Wextra -std=c2x interpreter2.c main.c -o i2

special_forms.h: special_forms.gperf
	gperf special_forms.gperf > special_forms.h

intrinsics.h: intrinsics.gperf
	gperf intrinsics.gperf > intrinsics.h

clean:
	rm -f special_forms.h intrinsics.h i2 i2.o i2.js i2.wasm i2.js
