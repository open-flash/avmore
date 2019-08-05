use ::scoped_gc::{Gc, GcAllocErr, GcScope};
use crate::values::{AvmConvert, AvmBoolean, AvmNumber, ToPrimitiveHint, AvmPrimitive};

#[derive(Debug, Eq, PartialEq, Clone, Trace)]
pub struct AvmString(String);

impl AvmString {
  pub fn new<'gc>(gc: &'gc GcScope<'gc>, value: String) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    gc.alloc(AvmString(value))
  }

  pub fn value(&self) -> &str {
    &self.0
  }
}

impl AvmConvert for AvmString {
  fn to_avm_boolean(&self) -> AvmBoolean {
    unimplemented!("ToBoolean(String)")
  }

  fn to_avm_number(&self) -> AvmNumber {
    unimplemented!("ToNumber(String)")
  }

  fn to_avm_primitive<'gc>(&self, _: ToPrimitiveHint) -> AvmPrimitive<'gc> {
    unimplemented!("ToPrimitive(String)")
  }

  fn to_avm_string<'gc>(&self, gc: &'gc GcScope<'gc>, swf_version: u8) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    AvmString::new(gc, self.0.clone())
  }
}
