use ::scoped_gc::{Gc, GcAllocErr, GcRefCell, GcScope, Trace};
pub use self::object::AvmObject;
pub use self::string::AvmString;
use avm1_tree as avm1;

mod object;
mod string;

pub trait AvmConvert {
  // TODO: to_avm_string, to_avm_primitive, etc.
  fn to_avm_boolean(&self) -> AvmBoolean;
  fn to_avm_number(&self) -> AvmNumber;
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct AvmUndefined;

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct AvmNull;

#[derive(Copy, Clone, Debug, PartialEq)]
pub struct AvmNumber(f64);

impl AvmNumber {
  const ZERO: Self = AvmNumber(0f64);
  const ONE: Self = AvmNumber(1f64);
  const NAN: Self = AvmNumber(::std::f64::NAN);

  pub const fn new(value: f64) -> AvmNumber {
    // TODO: Handle normalization of `NaN` and `-0` to canonical `NaN` and `+0`.
    AvmNumber(value)
  }

  pub fn value(&self) -> f64 {
    self.0
  }
}

impl AvmConvert for AvmNumber {
  fn to_avm_boolean(&self) -> AvmBoolean {
    AvmBoolean(!(self.0.is_nan() || self.0 == 0f64))
  }

  fn to_avm_number(&self) -> AvmNumber {
    self.clone()
  }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct AvmBoolean(bool);

impl AvmBoolean {
  const FALSE: Self = AvmBoolean(false);
  const TRUE: Self = AvmBoolean(true);

  pub const fn new(value: bool) -> AvmBoolean {
    AvmBoolean(value)
  }

  pub fn value(&self) -> bool {
    self.0
  }
}

impl AvmConvert for AvmBoolean {
  fn to_avm_boolean(&self) -> AvmBoolean {
    self.clone()
  }

  fn to_avm_number(&self) -> AvmNumber {
    if self.0 {
      AvmNumber::ONE
    } else {
      AvmNumber::ZERO
    }
  }
}

#[derive(Debug, Clone)]
pub enum AvmValue<'gc> {
  Boolean(AvmBoolean),
  Null(AvmNull),
  Number(AvmNumber),
  Object(Gc<'gc, GcRefCell<AvmObject<'gc>>>),
  String(Gc<'gc, AvmString>),
  Undefined(AvmUndefined),
}

// Corresponds to a data equality (NaN is equal to NaN)
impl<'gc> PartialEq for AvmValue<'gc> {
  fn eq(&self, other: &AvmValue) -> bool {
    match (self, other) {
      (&AvmValue::Boolean(ref left), &AvmValue::Boolean(ref right)) => left == right,
      (&AvmValue::Undefined(_), &AvmValue::Undefined(_)) => true,
      (&AvmValue::String(ref left), &AvmValue::String(ref right)) => left.value() == right.value(),
      (_, _) => false,
    }
  }

  fn ne(&self, other: &AvmValue<'gc>) -> bool {
    !self.eq(other)
  }
}

unsafe impl<'gc> Trace for AvmValue<'gc> {
  unsafe fn mark(&self) {
    match self {
      AvmValue::Object(gc) => Gc::mark(gc),
      AvmValue::String(gc) => Gc::mark(gc),
      _ => (),
    }
  }

  unsafe fn root(&self) {
    match self {
      AvmValue::Object(gc) => Gc::root(gc),
      AvmValue::String(gc) => Gc::root(gc),
      _ => (),
    }
  }

  unsafe fn unroot(&self) {
    match self {
      AvmValue::Object(gc) => Gc::unroot(gc),
      AvmValue::String(gc) => Gc::unroot(gc),
      _ => (),
    }
  }
}

impl<'gc> AvmValue<'gc> {
  pub const UNDEFINED: Self = AvmValue::Undefined(AvmUndefined);
  pub const NULL: Self = AvmValue::Null(AvmNull);
  pub const ZERO: Self = AvmValue::Number(AvmNumber::ZERO);
  pub const ONE: Self = AvmValue::Number(AvmNumber::ONE);
  pub const NAN: Self = AvmValue::Number(AvmNumber::NAN);
  pub const FALSE: Self = AvmValue::Boolean(AvmBoolean::FALSE);
  pub const TRUE: Self = AvmValue::Boolean(AvmBoolean::TRUE);

  pub fn legacy_boolean(value: bool, swf_version: u8) -> AvmValue<'gc> {
    if swf_version < 5 {
      if value {
        AvmValue::ONE
      } else {
        AvmValue::ZERO
      }
    } else {
      AvmValue::Boolean(AvmBoolean::new(value))
    }
  }

  pub fn string(gc: &'gc GcScope<'gc>, value: String) -> Result<AvmValue<'gc>, GcAllocErr> {
    AvmString::new(gc, value).map(|s| AvmValue::String(s))
  }

  pub fn boolean(value: bool) -> AvmValue<'gc> {
    AvmValue::Boolean(AvmBoolean::new(value))
  }

  pub fn number(value: f64) -> AvmValue<'gc> {
    AvmValue::Number(AvmNumber::new(value))
  }

  pub fn from_ast(gc: &'gc GcScope<'gc>, value: &avm1::Value) -> Result<AvmValue<'gc>, GcAllocErr> {
    match value {
      &avm1::Value::String(ref s) => AvmString::new(gc, s.clone())
        .map(|avm_string| AvmValue::String(avm_string)),
      &avm1::Value::Float64(n) => Ok(AvmValue::Number(AvmNumber::new(n.into()))),
      &avm1::Value::Sint32(n) => Ok(AvmValue::Number(AvmNumber::new(n.into()))),
      _ => unimplemented!(),
    }
  }

  pub fn to_avm_string(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    match self {
      &AvmValue::Boolean(AvmBoolean(false)) => AvmString::new(gc, String::from("false")),
      &AvmValue::Boolean(AvmBoolean(true)) => AvmString::new(gc, String::from("true")),
      &AvmValue::Undefined(_) => AvmString::new(gc, String::from(if swf_version >= 7 { "undefined" } else { "" })),
      &AvmValue::Null(_) => AvmString::new(gc, String::from("null")),
      &AvmValue::String(ref avm_string) => Ok(Gc::clone(avm_string)),
      &AvmValue::Number(ref avm_number) => AvmString::new(gc, format!("{}", avm_number.value())),
      _ => unimplemented!(),
    }
  }

  /// Converts the current value to an `AvmNumber` using ES3 rules.
  ///
  /// The conversion follows ES-262-3 section 9.3 ("ToNumber")
  pub fn to_avm_number(&self) -> AvmNumber {
    match self {
      &AvmValue::Undefined(_) => AvmNumber::NAN,
      &AvmValue::Null(_) => AvmNumber::ZERO,
      &AvmValue::Boolean(ref v) => v.to_avm_number(),
      &AvmValue::Number(ref v) => v.to_avm_number(),
      &AvmValue::String(ref v) => v.to_avm_number(),
      &AvmValue::Object(_) => unimplemented!(),
    }
  }

  /// Converts the current value to an `AvmNumber` using legacy rules.
  ///
  /// `AvmNumber` are returned as-is, other types return `AvmNumber::ZERO`.
  ///
  /// TODO: Check how strings are handled (parseFloat?)
  pub fn legacy_to_avm_number(&self) -> AvmNumber {
    match self {
      &AvmValue::Number(avm_number) => avm_number,
      _ => AvmNumber::ZERO,
    }
  }
}
