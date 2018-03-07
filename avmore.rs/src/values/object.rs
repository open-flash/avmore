use ::std::collections::hash_map::HashMap;
use gc::{Gc, GcAllocErr, GcRootScope, Trace};
use self::super::AvmValue;

struct AvmObjectProperty<'gc> {
  read_only: bool,
  enumerable: bool,
  deletable: bool,
  intermal: bool,
  value: AvmValue<'gc>,
}

pub struct AvmObject<'gc> {
  // TODO: Insertion order
  properties: HashMap<String, AvmValue<'gc>>,
}

impl<'gc> AvmObject<'gc> {
  pub fn new<'r, 's: 'r>(gc_scope: &'s GcRootScope<'gc>) -> Result<Gc<'r, AvmObject<'gc>>, GcAllocErr> {
    gc_scope.alloc(AvmObject {
      properties: HashMap::new(),
    })
  }
}

impl<'gc> Trace for AvmObject<'gc> {
  fn trace(&self) {}

  fn root(&self) {}

  fn unroot(&self) {}
}
