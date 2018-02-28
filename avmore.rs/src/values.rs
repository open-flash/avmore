use swf_tree::avm1;
use scope::Scope;

#[derive(Debug, Eq, PartialEq)]
pub struct AvmUndefined();

#[derive(Debug, Eq, PartialEq)]
pub struct AvmNull();

#[derive(Debug, Eq, PartialEq, Copy, Clone)]
pub struct AvmString<'a>(&'a str);

impl<'a> AvmString<'a> {
  pub fn new(scope: &'a Scope, value: &str) -> AvmString<'a> {
    AvmString(scope.alloc_string(value))
  }

  pub fn to_str(&self) -> &'a str {
    self.0
  }
}

#[derive(Debug, PartialEq)]
pub struct AvmNumber(f64);

impl AvmNumber {
  pub fn new(_: &Scope, value: f64) -> AvmNumber {
    AvmNumber(value)
  }

  pub fn to_f64(&self) -> f64 {
    self.0
  }
}

#[derive(Debug, Eq, PartialEq)]
pub struct AvmBoolean(bool);

impl AvmBoolean {
  pub fn new(_: &Scope, value: bool) -> AvmBoolean {
    AvmBoolean(value)
  }

  pub fn to_bool(&self) -> bool {
    self.0
  }
}

#[derive(Debug, PartialEq)]
pub enum AvmValue<'a> {
  Undefined(AvmUndefined),
  Null(AvmNull),
  Boolean(AvmBoolean),
  String(AvmString<'a>),
  Number(AvmNumber),
  Object,
}

impl<'a> AvmValue<'a> {
  pub fn from_ast(scope: &'a Scope, value: &avm1::actions::Value) -> AvmValue<'a> {
    match value {
      &avm1::actions::Value::CString(ref s) => AvmValue::String(AvmString::new(scope, s)),
      &avm1::actions::Value::I32(n) => AvmValue::Number(AvmNumber::new(scope, n.into())),
      _ => unimplemented!(),
    }
  }

  pub fn to_avm_string(&self, scope: &'a Scope, swf_version: u8) -> AvmString {
    match self {
      &AvmValue::Undefined(_) => AvmString(if swf_version >= 7 { "undefined" } else { "" }),
      &AvmValue::Null(_) => AvmString("null"),
      &AvmValue::String(avm_string) => avm_string,
      &AvmValue::Number(ref avm_number) => AvmString::new(scope, &format!("{}", avm_number.to_f64())),
      _ => unimplemented!(),
    }
  }
}
