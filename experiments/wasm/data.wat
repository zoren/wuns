
(import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
(import "wasi_snapshot_preview1" "proc_exit" (func $proc_exit (param i32)))

(memory 1)
(export "memory" (memory 0))

(data (i32.const 8) "hello-active\n")
(data $passive "hello-passive\n")
(data (i32.const 80) "HELLO-ACTIVE\n")

(func (export "_start")
  (i32.store (i32.const 0) (i32.const 8))
  (i32.store (i32.const 4) (i32.const 13))

  (drop (call $fd_write
      (i32.const 1)
      (i32.const 0)
      (i32.const 1)
      (i32.const 20)))

  ;; overwrite the string in memory
  (memory.init 1
    (i32.const 8) ;; dst
    (i32.const 0) ;; offset
    (i32.const 14) ;; strlen("hello-passive\n")
)
  (i32.store (i32.const 4) (i32.const 14))

  (drop (call $fd_write
      (i32.const 1)
      (i32.const 0)
      (i32.const 1)
      (i32.const 20)))
  (call $proc_exit (i32.const 0)))
