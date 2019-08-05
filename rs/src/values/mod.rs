use ::scoped_gc::{Gc, GcAllocErr, GcRefCell, GcScope};
pub use self::object::AvmObject;
pub use self::string::AvmString;
use avm1_tree as avm1;

pub mod object;
mod string;

pub trait AvmConvert {
  fn to_avm_boolean(&self) -> AvmBoolean;
  fn to_avm_number(&self) -> AvmNumber;
  fn to_avm_primitive<'gc>(&self, hint: ToPrimitiveHint) -> AvmPrimitive<'gc>;
  fn to_avm_string<'gc>(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr>;
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Trace)]
pub struct AvmUndefined;

impl AvmConvert for AvmUndefined {
  fn to_avm_boolean(&self) -> AvmBoolean {
    AvmBoolean::FALSE
  }

  fn to_avm_number(&self) -> AvmNumber {
    AvmNumber::NAN
  }

  fn to_avm_primitive<'gc>(&self, _: ToPrimitiveHint) -> AvmPrimitive<'gc> {
    AvmPrimitive::UNDEFINED
  }

  fn to_avm_string<'gc>(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    AvmString::new(gc, String::from(if swf_version >= 7 { "undefined" } else { "" }))
  }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Trace)]
pub struct AvmNull;

impl AvmConvert for AvmNull {
  fn to_avm_boolean(&self) -> AvmBoolean {
    AvmBoolean::FALSE
  }

  fn to_avm_number(&self) -> AvmNumber {
    AvmNumber::ZERO
  }

  fn to_avm_primitive<'gc>(&self, _: ToPrimitiveHint) -> AvmPrimitive<'gc> {
    AvmPrimitive::NULL
  }

  fn to_avm_string<'gc>(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    AvmString::new(gc, String::from("null"))
  }
}

#[derive(Copy, Clone, Debug, PartialEq, Trace)]
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

  fn to_avm_primitive<'gc>(&self, _: ToPrimitiveHint) -> AvmPrimitive<'gc> {
    AvmPrimitive::Number(self.clone())
  }

  fn to_avm_string<'gc>(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    AvmString::new(gc, format!("{}", self.0))
  }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Trace)]
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

  fn to_avm_primitive<'gc>(&self, _: ToPrimitiveHint) -> AvmPrimitive<'gc> {
    AvmPrimitive::Boolean(self.clone())
  }

  fn to_avm_string<'gc>(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    AvmString::new(gc, String::from(if self.0 { "true" } else { "false" }))
  }
}

#[derive(Debug, Clone, Trace)]
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

  pub fn to_avm_boolean(&self) -> AvmBoolean {
    match self {
      &AvmValue::Undefined(ref v) => v.to_avm_boolean(),
      &AvmValue::Null(ref v) => v.to_avm_boolean(),
      &AvmValue::Boolean(ref v) => v.to_avm_boolean(),
      &AvmValue::Number(ref v) => v.to_avm_boolean(),
      &AvmValue::String(ref v) => v.to_avm_boolean(),
      &AvmValue::Object(_) => unimplemented!("ToBoolean(Object)"),
    }
  }

  pub fn to_avm_string(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    match self {
      &AvmValue::Undefined(ref v) => v.to_avm_string(gc, swf_version),
      &AvmValue::Null(ref v) => v.to_avm_string(gc, swf_version),
      &AvmValue::Boolean(ref v) => v.to_avm_string(gc, swf_version),
      &AvmValue::Number(ref v) => v.to_avm_string(gc, swf_version),
      &AvmValue::String(ref v) => v.to_avm_string(gc, swf_version),
      &AvmValue::Object(ref v) => v.borrow().to_avm_string(gc, swf_version),
    }
  }

  /// Converts the current value to an `AvmNumber` using ES3 rules.
  ///
  /// The conversion follows ES-262-3 section 9.3 ("ToNumber")
  pub fn to_avm_number(&self) -> AvmNumber {
    match self {
      &AvmValue::Undefined(ref v) => v.to_avm_number(),
      &AvmValue::Null(ref v) => v.to_avm_number(),
      &AvmValue::Boolean(ref v) => v.to_avm_number(),
      &AvmValue::Number(ref v) => v.to_avm_number(),
      &AvmValue::String(ref v) => v.to_avm_number(),
      &AvmValue::Object(_) => unimplemented!("ToNumber(Object)"),
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
      &AvmValue::Boolean(AvmBoolean(false)) => AvmNumber::ZERO,
      &AvmValue::Boolean(AvmBoolean(true)) => AvmNumber::ONE,
      _ => AvmNumber::ZERO,
    }
  }

  pub fn to_avm_primitive(&self, hint: ToPrimitiveHint) -> AvmPrimitive<'gc> {
    match self {
      &AvmValue::Undefined(ref v) => v.to_avm_primitive(hint),
      &AvmValue::Null(ref v) => v.to_avm_primitive(hint),
      &AvmValue::Boolean(ref v) => v.to_avm_primitive(hint),
      &AvmValue::Number(ref v) => v.to_avm_primitive(hint),
      &AvmValue::String(ref v) => v.to_avm_primitive(hint),
      &AvmValue::Object(_) => unimplemented!("ToPrimitive(Object)"),
    }
  }
}

#[derive(Debug, Copy, Clone)]
pub enum ToPrimitiveHint {
  Default,
  Number,
  String,
}

// TODO: Use a single common type with `AvmValue`
#[derive(Debug, Clone, Trace)]
pub enum AvmPrimitive<'gc> {
  Boolean(AvmBoolean),
  Null(AvmNull),
  Number(AvmNumber),
  String(Gc<'gc, AvmString>),
  Undefined(AvmUndefined),
}

impl<'gc> AvmPrimitive<'gc> {
  pub const UNDEFINED: Self = AvmPrimitive::Undefined(AvmUndefined);
  pub const NULL: Self = AvmPrimitive::Null(AvmNull);
  pub const ZERO: Self = AvmPrimitive::Number(AvmNumber::ZERO);
  pub const ONE: Self = AvmPrimitive::Number(AvmNumber::ONE);
  pub const NAN: Self = AvmPrimitive::Number(AvmNumber::NAN);
  pub const FALSE: Self = AvmPrimitive::Boolean(AvmBoolean::FALSE);
  pub const TRUE: Self = AvmPrimitive::Boolean(AvmBoolean::TRUE);

  pub fn to_avm_string(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    match self {
      &AvmPrimitive::Boolean(AvmBoolean(false)) => AvmString::new(gc, String::from("false")),
      &AvmPrimitive::Boolean(AvmBoolean(true)) => AvmString::new(gc, String::from("true")),
      &AvmPrimitive::Undefined(_) => AvmString::new(gc, String::from(if swf_version >= 7 { "undefined" } else { "" })),
      &AvmPrimitive::Null(_) => AvmString::new(gc, String::from("null")),
      &AvmPrimitive::String(ref avm_string) => Ok(Gc::clone(avm_string)),
      &AvmPrimitive::Number(ref avm_number) => AvmString::new(gc, format!("{}", avm_number.value())),
    }
  }

  /// Converts the current value to an `AvmNumber` using ES3 rules.
  ///
  /// The conversion follows ES-262-3 section 9.3 ("ToNumber")
  pub fn to_avm_number(&self) -> AvmNumber {
    match self {
      &AvmPrimitive::Undefined(ref v) => v.to_avm_number(),
      &AvmPrimitive::Null(ref v) => v.to_avm_number(),
      &AvmPrimitive::Boolean(ref v) => v.to_avm_number(),
      &AvmPrimitive::Number(ref v) => v.to_avm_number(),
      &AvmPrimitive::String(ref v) => v.to_avm_number(),
    }
  }
}
