use ::scoped_gc::{Gc, GcAllocErr, GcScope};

use crate::context::Context;
use crate::values::{AvmBoolean, AvmConvert, AvmNumber, AvmPrimitive, ToPrimitiveHint};

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

impl<'gc> AvmConvert<'gc> for AvmString {
  fn to_avm_boolean(&self) -> AvmBoolean {
    unimplemented!("ToBoolean(String)")
  }

  fn to_avm_number(&self) -> AvmNumber {
    unimplemented!("ToNumber(String)")
  }

  fn to_avm_primitive<C: Context<'gc>>(&self, _: &mut C, _: ToPrimitiveHint) -> Result<AvmPrimitive<'gc>, ()> {
    unimplemented!("ToPrimitive(String)")
  }

  fn to_avm_string<C: Context<'gc>>(&self, ctx: &mut C) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    ctx.string(self.0.clone())
  }
}
