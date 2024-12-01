(import "env" "mem" (memory $m1 1))
(import "env" "mem2" (memory $m2 1))
(memory $m4 1)
(memory $m5 2)
(memory $m6 0)

(data (i32.const 16) "hello-active")
(data "hello-passive")

(func (export "f") (result i32)
  (i32.load $m5 (i32.const 0)))
