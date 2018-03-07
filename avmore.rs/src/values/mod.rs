use gc::{Gc, GcAllocErr, GcRootScope};
pub use self::object::AvmObject;
pub use self::string::AvmString;
use swf_tree::avm1;

mod object;
mod string;

#[derive(Debug, Eq, PartialEq)]
pub struct AvmUndefined;

#[derive(Debug, Eq, PartialEq)]
pub struct AvmNull;

#[derive(Debug, PartialEq)]
pub struct AvmNumber(f64);

impl AvmNumber {
  pub fn new(value: f64) -> AvmNumber {
    AvmNumber(value)
  }

  pub fn value(&self) -> f64 {
    self.0
  }
}

#[derive(Debug, Eq, PartialEq)]
pub struct AvmBoolean(bool);

impl AvmBoolean {
  pub fn new(value: bool) -> AvmBoolean {
    AvmBoolean(value)
  }

  pub fn inner(&self) -> bool {
    self.0
  }
}

#[derive(Debug)]
pub enum AvmValue<'gc> {
  Boolean(AvmBoolean),
  Undefined(AvmUndefined),
  Null(AvmNull),
  Number(AvmNumber),
  Object,
  String(Gc<'gc, AvmString>),
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

  fn ne(&self, other: &AvmValue) -> bool {
    !self.eq(other)
  }
}

impl<'gc> AvmValue<'gc> {
  pub fn from_ast(gc_scope: &'gc GcRootScope, value: &avm1::actions::Value) -> Result<AvmValue<'gc>, GcAllocErr> {
    match value {
      &avm1::actions::Value::CString(ref s) => AvmString::new(gc_scope, s.clone())
        .map(|avm_string| AvmValue::String(avm_string)),
      &avm1::actions::Value::F64(n) => Ok(AvmValue::Number(AvmNumber::new(n.into()))),
      &avm1::actions::Value::I32(n) => Ok(AvmValue::Number(AvmNumber::new(n.into()))),
      _ => unimplemented!(),
    }
  }

  pub fn to_avm_string(&self, gc_scope: &'gc GcRootScope, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    match self {
      &AvmValue::Undefined(_) => AvmString::new(gc_scope, String::from(if swf_version >= 7 { "undefined" } else { "" })),
      &AvmValue::Null(_) => AvmString::new(gc_scope, String::from("null")),
      &AvmValue::String(ref avm_string) => Ok(Gc::clone(&avm_string)),
      &AvmValue::Number(ref avm_number) => AvmString::new(gc_scope, format!("{}", avm_number.value())),
      _ => unimplemented!(),
    }
  }
}
