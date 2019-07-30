use ::scoped_gc::{Gc, GcAllocErr, GcScope};

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
