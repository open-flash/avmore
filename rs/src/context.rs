use ::std::collections::hash_map::HashMap;

use ::scoped_gc::GcScope;
use avm1_tree;

use crate::host::Host;
use crate::values::{AvmString, AvmValue};
use scoped_gc::{Gc, GcAllocErr};

// Ok: normal return
// Err: throw value
pub type AvmResult<'gc> = Result<AvmValue<'gc>, AvmValue<'gc>>;

pub trait Context<'gc> {
  fn apply(&mut self, callable: AvmValue<'gc>, this_arg: AvmValue<'gc>, args: &[AvmValue<'gc>]) -> AvmResult<'gc>;

  fn string(&mut self, s: String) -> Result<Gc<'gc, AvmString>, GcAllocErr>;

  fn swf_version(&self) -> u8;
}

// Struct passed to native functions to handle context-sensitive operations
pub(crate) struct FunctionContext<'gc> {
  pub(crate) gc: &'gc GcScope<'gc>,
  pub(crate) _swf_version: u8,
}

impl<'gc> Context<'gc> for FunctionContext<'gc> {
  fn apply(&mut self, callable: AvmValue<'gc>, this_arg: AvmValue<'gc>, args: &[AvmValue<'gc>]) -> AvmResult<'gc> {
    unimplemented!()
  }

  fn string(&mut self, s: String) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    AvmString::new(self.gc, s)
  }

  fn swf_version(&self) -> u8 {
    self._swf_version
  }
}
