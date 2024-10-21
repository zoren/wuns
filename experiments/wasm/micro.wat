(func $f (export "f") (result))
(func $g (export "g") (result i32 i32)
  (i32.const 1)
  (i32.const 2))

(func $id_i32 (export "id_i32") (param i32) (result i32)
  (local.get 0))
(func $id_i64 (export "id_i64") (param i64) (result i64)
  (local.get 0))

(func $id_f32 (export "id_f32") (param f32) (result f32)
  (local.get 0))
(func $id_f64 (export "id_f64") (param f64) (result f64)
  (local.get 0))

(global $1 (export "1") i32 (i32.const 1))

(export "number1" (global $1))
