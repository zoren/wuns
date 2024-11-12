# gperf special_forms.gperf > special_forms.h && gperf intrinsics.gperf > intrinsics.h && clang -Wall -Wextra -std=c2x interpreter2.c -o i2
all: interpreter2.c special_forms.h intrinsics.h
	clang -Wall -Wextra -std=c2x interpreter2.c -o i2

special_forms.h: special_forms.gperf
	gperf special_forms.gperf > special_forms.h

intrinsics.h: intrinsics.gperf
	gperf intrinsics.gperf > intrinsics.h

clean:
	rm -f special_forms.h intrinsics.h i2

