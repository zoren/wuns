(module
  ;; comparison operations
  (func (export "eqz") (param i32) (result i32)
    (i32.eqz (local.get 0)))

  (func (export "eq") (param i32) (param i32) (result i32)
    (i32.eq (local.get 0) (local.get 1)))

  (func (export "ne") (param i32) (param i32) (result i32)
    (i32.ne (local.get 0) (local.get 1)))

  (func (export "lt") (param i32) (param i32) (result i32)
    (i32.lt_s (local.get 0) (local.get 1)))

  (func (export "lt-unsigned") (param i32) (param i32) (result i32)
    (i32.lt_u (local.get 0) (local.get 1)))

  (func (export "gt") (param i32) (param i32) (result i32)
    (i32.gt_s (local.get 0) (local.get 1)))

  (func (export "gt-unsigned") (param i32) (param i32) (result i32)
    (i32.gt_u (local.get 0) (local.get 1)))

  (func (export "le") (param i32) (param i32) (result i32)
    (i32.le_s (local.get 0) (local.get 1)))

  (func (export "le-unsigned") (param i32) (param i32) (result i32)
    (i32.le_u (local.get 0) (local.get 1)))

  (func (export "ge") (param i32) (param i32) (result i32)
    (i32.ge_s (local.get 0) (local.get 1)))

  (func (export "ge-unsigned") (param i32) (param i32) (result i32)
    (i32.ge_u (local.get 0) (local.get 1)))

  ;; bit operations
  ;; maybe call them bitwise-* as in Prescheme?
  (func (export "bit-and") (param i32) (param i32) (result i32)
    (i32.and (local.get 0) (local.get 1)))

  ;; maybe call it bitwise-ior?
  ;; as in https://thintz.com/resources/prescheme-documentation#Pre_002dScheme-bitwise-manipulation
  (func (export "bit-or") (param i32) (param i32) (result i32)
    (i32.or (local.get 0) (local.get 1)))

  (func (export "bit-xor") (param i32) (param i32) (result i32)
    (i32.xor (local.get 0) (local.get 1)))

  (func (export "bit-shift-left") (param i32) (param i32) (result i32)
    (i32.shl (local.get 0) (local.get 1)))

  (func (export "bit-shift-right-signed") (param i32) (param i32) (result i32)
    (i32.shr_s (local.get 0) (local.get 1)))

  (func (export "bit-shift-right-unsigned") (param i32) (param i32) (result i32)
    (i32.shr_u (local.get 0) (local.get 1)))

  (func (export "bit-rotate-left") (param i32) (param i32) (result i32)
    (i32.rotl (local.get 0) (local.get 1)))

  (func (export "bit-rotate-right") (param i32) (param i32) (result i32)
    (i32.rotr (local.get 0) (local.get 1)))

  ;; arithmetic operations
  (func (export "bit-count-leading-zero-bits") (param i32) (result i32)
    (i32.clz (local.get 0)))

  (func (export "bit-count-trailing-zero-bits") (param i32) (result i32)
    (i32.ctz (local.get 0)))

  (func (export "bit-population-count") (param i32) (result i32)
    (i32.popcnt (local.get 0)))

  (func (export "add") (param i32) (param i32) (result i32)
    (i32.add (local.get 0) (local.get 1)))

  (func (export "sub") (param i32) (param i32) (result i32)
    (i32.sub (local.get 0) (local.get 1)))

  (func (export "mul") (param i32) (param i32) (result i32)
    (i32.mul (local.get 0) (local.get 1)))

  (func (export "div") (param i32) (param i32) (result i32)
    (i32.div_s (local.get 0) (local.get 1)))

  (func (export "div-unsigned") (param i32) (param i32) (result i32)
    (i32.div_u (local.get 0) (local.get 1)))

  (func (export "rem") (param i32) (param i32) (result i32)
    (i32.rem_s (local.get 0) (local.get 1)))

  (func (export "rem-unsigned") (param i32) (param i32) (result i32)
    (i32.rem_u (local.get 0) (local.get 1)))
)
