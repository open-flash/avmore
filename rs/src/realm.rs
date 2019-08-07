use std::collections::HashMap;

use scoped_gc::{GcRefCell, GcScope};

use crate::values::{AvmNull, AvmObject, AvmValue};
use crate::values::object::{AvmObjectPrototype, AvmObjectRef, HostFunction, AvmCallable};

pub struct Realm<'gc> {
  /// `Object.prototype`
  pub obj_p: AvmObjectRef<'gc>,
}

impl<'gc> Realm<'gc> {
  pub fn new(gc: &'gc GcScope<'gc>) -> Self {
    let obj_p = AvmObject {
      class: "Object",
      prototype: AvmObjectPrototype::Null(AvmNull),
      properties: HashMap::new(),
      callable: None,
    };
    let obj_p = gc.alloc(GcRefCell::new(obj_p)).map(AvmObjectRef).unwrap();

    let func_p = AvmObject {
      class: "Object",
      prototype: AvmObjectPrototype::Object(obj_p.clone()),
      properties: HashMap::new(),
      callable: None,
    };
    let func_p = gc.alloc(GcRefCell::new(func_p)).map(AvmObjectRef).unwrap();

    let obj = AvmObject {
      class: "Object",
      prototype: AvmObjectPrototype::Object(func_p.clone()),
      properties: HashMap::new(),
      callable: None, // TODO: `Some(...)`
    };
    let _obj = gc.alloc(GcRefCell::new(obj)).map(AvmObjectRef).unwrap();

    let func = AvmObject {
      class: "Object",
      prototype: AvmObjectPrototype::Object(func_p.clone()),
      properties: HashMap::new(),
      callable: None, // TODO: `Some(...)`
    };
    let _func = gc.alloc(GcRefCell::new(func)).map(AvmObjectRef).unwrap();

    let obj_p_to_string = HostFunction { func: obj_p::to_string };
    let obj_p_to_string = AvmObject {
      class: "Function",
      prototype: AvmObjectPrototype::Object(func_p.clone()),
      properties: HashMap::new(),
      callable: Some(AvmCallable::HostFunction(obj_p_to_string)),
    };
    let obj_p_to_string = gc.alloc(GcRefCell::new(obj_p_to_string)).map(AvmObjectRef).unwrap();
    let obj_p_to_string = AvmValue::Object(obj_p_to_string);

    obj_p.0.borrow_mut().set(String::from("toString"), obj_p_to_string);

    Realm { obj_p }
  }
}

mod obj_p {
  use crate::context::{AvmResult, CallContext};
  use crate::values::AvmValue;

  pub(crate) fn to_string<'gc>(ctx: &mut dyn CallContext<'gc>) -> AvmResult<'gc> {
    // 15.2.4.2 Object.prototype.toString ( )
    // When the toString method is called, the following steps are taken:
    // 1. Get the [[Class]] property of this object.
    // 2. Compute a string value by concatenating the three strings "[object ", Result(1), and "]".
    // 3. Return Result(2).
    let class: &'static str = match ctx.this() {
      AvmValue::Object(v) => v.0.borrow().class,
      _ => unimplemented!("Non-object `this`"),
    };
    let result = format!("[object {}]", class);
    let result = ctx.string(result).unwrap();
    Ok(AvmValue::String(result))
  }
}
