use ::std::collections::hash_map::HashMap;

use ::scoped_gc::GcScope;
use avm1_tree;

use crate::host::Host;
use crate::values::AvmValue;

// Ok: normal return
// Err: throw value
pub type AvmResult<'gc> = Result<AvmValue<'gc>, AvmValue<'gc>>;

// Struct passed to native functions to handle context-sensitive operations
//pub struct Context<'gc> {}
//
//impl<'gc> Context<'gc> {
//  pub fn apply(&mut self, callable: AvmValue<'gc>, this_arg: AvmValue<'gc>, args: &[AvmValue<'gc>]) -> AvmResult<'gc> {
//    unimplemented!()
//  }
//}
