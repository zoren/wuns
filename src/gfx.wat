(module
  (import "env" "memory" (memory 0))
  (func (export "red") (param $p i32) (param $w i32) (param $h i32)
    (local $end i32)
    (local.set $end
      (i32.add (local.get $p)
        (i32.mul (i32.const 4)
          (i32.mul (local.get $w) (local.get $h)))))
    (loop $l
      (i32.store (local.get $p) (i32.const 0xff0000ff))
      (local.set $p (i32.add (local.get $p) (i32.const 4)))
      (if (i32.ge_u (local.get $p) (local.get $end))
        (return)
        (br $l))
      ))

  (func (export "fill") (param $p i32) (param $w i32) (param $h i32) (param $color i32)
    (local $end i32)
    (local.set $end
      (i32.add (local.get $p)
        (i32.mul (i32.const 4)
          (i32.mul (local.get $w) (local.get $h)))))
    (local.set $color (i32.or (local.get $color) (i32.const 0xff000000)))
    (loop $l
      (i32.store align=2 offset=0 (local.get $p) (local.get $color))
      (local.set $p (i32.add (local.get $p) (i32.const 4)))
      (if (i32.ge_u (local.get $p) (local.get $end))
        (return)
        (br $l))))


)
