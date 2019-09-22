use scoped_gc::{Gc, GcAllocErr, GcScope};

use crate::values::{AvmString, AvmValue};
use crate::values::object::AvmCallable;

// Ok: normal return
// Err: throw value
pub type AvmResult<'gc> = Result<AvmValue<'gc>, AvmValue<'gc>>;

pub trait Context<'gc> {
  fn apply(&mut self, callable: AvmValue<'gc>, this_arg: AvmValue<'gc>, args: &[AvmValue<'gc>]) -> AvmResult<'gc>;

  fn string(&mut self, s: String) -> Result<Gc<'gc, AvmString>, GcAllocErr>;

  fn swf_version(&self) -> u8;
}

pub trait CallContext<'gc>: Context<'gc> {
  /// Returns the current `this` value.
  // TODO: Allow only `Object` and `Undefined` as `this` values
  fn this(&mut self) -> AvmValue<'gc>;
}

// Struct passed to native functions to handle context-sensitive operations
pub(crate) struct ContextImpl<'gc> {
  pub(crate) gc: &'gc GcScope<'gc>,
  pub(crate) _swf_version: u8,
  pub(crate) _this: AvmValue<'gc>,
}

impl<'gc> Context<'gc> for ContextImpl<'gc> {
  fn apply(&mut self, callable: AvmValue<'gc>, this_arg: AvmValue<'gc>, _args: &[AvmValue<'gc>]) -> AvmResult<'gc> {
    match callable {
      AvmValue::Object(obj) => {
        match &obj.0.borrow().callable {
          Some(AvmCallable::HostFunction(f)) => {
            let mut sub_ctx = ContextImpl {
              gc: self.gc,
              _swf_version: self._swf_version,
              _this: this_arg,
            };

            (f.func)(&mut sub_ctx)
          },
          _ => unimplemented!("Apply(non-HostFunction)")
        }
      },
      _ => unimplemented!("Apply(non-Object)")
    }
  }

  fn string(&mut self, s: String) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    AvmString::new(self.gc, s)
  }

  fn swf_version(&self) -> u8 {
    self._swf_version
  }
}

impl<'gc> CallContext<'gc> for ContextImpl<'gc> {
  fn this(&mut self) -> AvmValue<'gc> {
    self._this.clone()
  }
}
