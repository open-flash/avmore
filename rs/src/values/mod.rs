use ::scoped_gc::{Gc, GcAllocErr, GcRefCell, GcScope, Trace};
pub use self::object::AvmObject;
pub use self::string::AvmString;
use avm1_tree as avm1;

mod object;
mod string;

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct AvmUndefined;

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct AvmNull;

#[derive(Copy, Clone, Debug, PartialEq)]
pub struct AvmNumber(f64);

impl AvmNumber {
  pub fn new(value: f64) -> AvmNumber {
    // TODO: Handle normalization of `NaN` and `-0` to canonical `NaN` and `+0`.
    AvmNumber(value)
  }

  pub fn value(&self) -> f64 {
    self.0
  }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AvmBoolean(bool);

impl AvmBoolean {
  pub const fn new(value: bool) -> AvmBoolean {
    AvmBoolean(value)
  }

  pub fn inner(&self) -> bool {
    self.0
  }
}

#[derive(Debug, Clone)]
pub enum AvmValue<'gc> {
  Boolean(AvmBoolean),
  Undefined(AvmUndefined),
  Null(AvmNull),
  Number(AvmNumber),
  Object(Gc<'gc, GcRefCell<AvmObject<'gc>>>),
  String(Gc<'gc, AvmString>),
}

//pub const AVM_UNDEFINED: AvmValue = AvmValue::Undefined(AvmUndefined);

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
  unsafe fn mark(&self) {}

  unsafe fn root(&self) {}

  unsafe fn unroot(&self) {}
}

impl<'gc> AvmValue<'gc> {
  pub const fn undefined() -> Self {
    AvmValue::Undefined(AvmUndefined)
  }

  pub fn legacy_boolean(value: bool, swf_version: u8) -> AvmValue<'gc> {
    if swf_version < 5 {
      AvmValue::Number(AvmNumber::new(if value { 1f64 } else { 0f64 }))
    } else {
      AvmValue::Boolean(AvmBoolean::new(value))
    }
  }

  pub fn string(gc_scope: &GcScope<'gc>, value: String) -> Result<AvmValue<'gc>, GcAllocErr> {
    AvmString::new(gc_scope, value).map(|s| AvmValue::String(s))
  }

  pub fn number(value: f64) -> AvmValue<'gc> {
    AvmValue::Number(AvmNumber::new(value))
  }

  pub fn from_ast(gc_scope: &GcScope<'gc>, value: &avm1::Value) -> Result<AvmValue<'gc>, GcAllocErr> {
    match value {
      &avm1::Value::String(ref s) => AvmString::new(gc_scope, s.clone())
        .map(|avm_string| AvmValue::String(avm_string)),
      &avm1::Value::Float64(n) => Ok(AvmValue::Number(AvmNumber::new(n.into()))),
      &avm1::Value::Sint32(n) => Ok(AvmValue::Number(AvmNumber::new(n.into()))),
      _ => unimplemented!(),
    }
  }

  pub fn to_avm_string(&self, gc_scope: &GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    match self {
      &AvmValue::Undefined(_) => AvmString::new(gc_scope, String::from(if swf_version >= 7 { "undefined" } else { "" })),
      &AvmValue::Null(_) => AvmString::new(gc_scope, String::from("null")),
      &AvmValue::String(ref avm_string) => Ok(Gc::clone(&avm_string)),
      &AvmValue::Number(ref avm_number) => AvmString::new(gc_scope, format!("{}", avm_number.value())),
      _ => unimplemented!(),
    }
  }

  /// Converts the current value to an `AvmNumber` using ES3 rules.
  ///
  /// The conversion follows ES-262-3 section 9.3 ("ToNumber")
  pub fn to_avm_number(&self) -> AvmNumber {
    match self {
      &AvmValue::Undefined(_) => AvmNumber::new(::std::f64::NAN),
      &AvmValue::Null(_) => AvmNumber::new(0f64),
      &AvmValue::Boolean(_) => unimplemented!(),
      &AvmValue::Number(avm_number) => avm_number,
      &AvmValue::String(_) => unimplemented!(),
      &AvmValue::Object(_) => unimplemented!(),
    }
  }

  /// Converts the current value to an `AvmNumber` using legacy rules.
  ///
  /// `AvmNumber` are returned as-is, other types return `AvmNumber::new(0f64)`.
  ///
  /// TODO: Check how strings are handled (parseFloat?)
  pub fn legacy_to_avm_number(&self) -> AvmNumber {
    match self {
      &AvmValue::Number(avm_number) => avm_number,
      _ => AvmNumber::new(0f64),
    }
  }
}
