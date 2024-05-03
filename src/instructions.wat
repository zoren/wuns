(module
  ;; arithmetic operations
  (func (export "add") (param i32) (param i32) (result i32)
    (i32.add (local.get 0) (local.get 1)))

  (func (export "sub") (param i32) (param i32) (result i32)
    (i32.sub (local.get 0) (local.get 1)))

  (func (export "mul") (param i32) (param i32) (result i32)
    (i32.mul (local.get 0) (local.get 1)))

  ;; bit operations
  (func (export "bit-and") (param i32) (param i32) (result i32)
    (i32.and (local.get 0) (local.get 1)))

  (func (export "bit-or") (param i32) (param i32) (result i32)
    (i32.or (local.get 0) (local.get 1)))

  (func (export "bit-xor") (param i32) (param i32) (result i32)
    (i32.xor (local.get 0) (local.get 1)))

  ;; comparison operations
  (func (export "eq") (param i32) (param i32) (result i32)
    (i32.eq (local.get 0) (local.get 1)))
  
  (func (export "lt") (param i32) (param i32) (result i32)
    (i32.lt_s (local.get 0) (local.get 1)))

  (func (export "gt") (param i32) (param i32) (result i32)
    (i32.gt_s (local.get 0) (local.get 1)))
  
  (func (export "le") (param i32) (param i32) (result i32)
    (i32.le_s (local.get 0) (local.get 1)))

  (func (export "ge") (param i32) (param i32) (result i32)
    (i32.ge_s (local.get 0) (local.get 1)))
)
