use gc::{Gc, GcAllocErr, GcRootScope, Trace};

#[derive(Debug, Eq, PartialEq, Clone)]
pub struct AvmString(String);

impl AvmString {
  pub fn new<'r, 's: 'r, 'gc: 's>(gc_scope: &'s GcRootScope<'gc>, value: String) -> Result<Gc<'r, AvmString>, GcAllocErr> {
    gc_scope.alloc(AvmString(value))
  }

  pub fn value(&self) -> &str {
    &self.0
  }
}

impl Trace for AvmString {
  fn trace(&self) {}

  fn root(&self) {}

  fn unroot(&self) {}
}
