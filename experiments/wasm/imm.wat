(module
  (import "env" "memory" (memory 0))
  (import "env" "memory2" (memory $mem2 1))
  (memory $j 2)
  (memory $h 3)

(func
  (drop (i32.load (memory 0) offset=10 align=1 (i32.const 0x7f)))
  (drop (i32.load (memory $j) offset=11 align=2 (i32.const 0x7f)))
  (drop (i32.load $h offset=12 align=4 (i32.const 0x7f)))

  ))