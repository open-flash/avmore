use ::std::collections::hash_map::HashMap;
use std::convert::TryFrom;

use scoped_gc::{Gc, GcAllocErr, GcRefCell, GcScope};

use crate::avm1::Scope;
use crate::context::{AvmResult, CallContext, Context};
use crate::values::{AvmBoolean, AvmConvert, AvmNull, AvmNumber, AvmPrimitive, AvmString, ToPrimitiveHint};

use self::super::AvmValue;

#[derive(Debug, Clone, Trace)]
pub struct AvmObjectProperty<'gc> {
  pub read_only: bool,
  pub enumerable: bool,
  pub deletable: bool,
  pub internal: bool,
  pub value: AvmValue<'gc>,
}

#[derive(Debug, Clone, Trace)]
pub enum AvmObjectPrototype<'gc> {
  Null(AvmNull),
  Object(AvmObjectRef<'gc>),
}

impl<'gc> TryFrom<AvmValue<'gc>> for AvmObjectPrototype<'gc> {
  type Error = ();

  fn try_from(value: AvmValue<'gc>) -> Result<Self, Self::Error> {
    match value {
      AvmValue::Undefined(_) => Err(()),
      AvmValue::Null(v) => Ok(AvmObjectPrototype::Null(v)),
      AvmValue::Boolean(_) => Err(()),
      AvmValue::Number(_) => Err(()),
      AvmValue::String(_) => Err(()),
      AvmValue::Object(v) => Ok(AvmObjectPrototype::Object(v)),
    }
  }
}

#[derive(Debug, Trace)]
pub struct AvmObject<'gc> {
  // Internal `[[class]]`
  pub class: &'static str,

  // internal `[[prototype]]` (`__proto__`), not `prototype` property
  pub prototype: AvmObjectPrototype<'gc>,

  // TODO: Insertion order
  pub properties: HashMap<String, AvmObjectProperty<'gc>>,

  pub callable: Option<AvmCallable<'gc>>,
}

impl<'gc> AvmObject<'gc> {
  pub fn new(gc: &'gc GcScope<'gc>, prototype: Option<AvmObjectRef<'gc>>) -> Result<AvmObjectRef<'gc>, GcAllocErr> {
    gc
      .alloc(GcRefCell::new(AvmObject {
        class: "Object",
        prototype: match prototype {
          Some(p) => AvmObjectPrototype::Object(p),
          None => AvmObjectPrototype::Null(AvmNull),
        },
        properties: HashMap::new(),
        callable: None,
      }))
      .map(AvmObjectRef)
  }

  pub fn new_callable(gc: &'gc GcScope<'gc>, callable: AvmCallable<'gc>) -> Result<AvmObjectRef<'gc>, GcAllocErr> {
    gc
      .alloc(GcRefCell::new(AvmObject {
        class: "Function",
        prototype: AvmObjectPrototype::Null(AvmNull),
        properties: HashMap::new(),
        callable: Some(callable),
      }))
      .map(AvmObjectRef)
  }

  pub fn set(&mut self, key: String, value: AvmValue<'gc>) {
    let property = AvmObjectProperty {
      read_only: false,
      enumerable: true,
      deletable: true,
      internal: true,
      value,
    };
    self.properties.insert(key, property);
  }

  pub fn get(&self, key: &str) -> Option<AvmValue<'gc>> {
    let mut result: Option<AvmValue<'gc>> = self.get_local(key);
    // TODO: Recurse (needs loop detection?)
    if result.is_none() {
      result = match &self.prototype {
        AvmObjectPrototype::Null(_) => result,
        AvmObjectPrototype::Object(p) => p.0.borrow().get_local(key),
      };
    }
    result
  }

  pub fn get_local(&self, key: &str) -> Option<AvmValue<'gc>> {
    self.properties.get(key)
      .map(|prop| prop.value.clone())
  }

  pub fn get_local_property(&self, key: &str) -> Option<&AvmObjectProperty<'gc>> {
    self.properties.get(key)
  }
}

#[derive(Debug, Clone, Trace)]
pub struct AvmObjectRef<'gc>(pub Gc<'gc, GcRefCell<AvmObject<'gc>>>);

//impl<'gc> AvmObjectRef<'gc> {
//
//}

impl<'gc> AvmConvert<'gc> for AvmObjectRef<'gc> {
  fn to_avm_boolean(&self) -> AvmBoolean {
    unimplemented!("ToBoolean(Object)")
  }

  fn to_avm_number(&self) -> AvmNumber {
    unimplemented!("ToNumber(Object)")
  }

  // ECMA 262-3 8.6.2.6: [[DefaultValue]] (hint)
  fn to_avm_primitive<C: Context<'gc>>(&self, ctx: &mut C, hint: ToPrimitiveHint) -> Result<AvmPrimitive<'gc>, ()> {
    let obj = &self.0;
    match hint {
      // TODO: `Date` objects use `Number` as the default hint
      ToPrimitiveHint::Default | ToPrimitiveHint::String => {
        // 1. Call the [[Get]] method of object O with argument "toString".
        let to_string_method = obj.borrow().get("toString").unwrap_or(AvmValue::UNDEFINED);
        // 2. If Result(1) is not an object, go to step 5.
        match to_string_method {
          v @ AvmValue::Object(_) => {
            // 3. Call the [[Call]] method of Result(1), with O as the this value and an empty argument list.
            let result = ctx.apply(v, AvmValue::Object(self.clone()), &[]).map_err(|_| ())?;
            // 4. If Result(3) is a primitive value, return Result(3).
            match AvmPrimitive::try_from(result) {
              Ok(p) => return Ok(p),
              Err(_) => {}
            }
          }
          _ => {}
        }
        // 5. Call the [[Get]] method of object O with argument "valueOf".
        let value_of_method = obj.borrow().get("valueOf").unwrap_or(AvmValue::UNDEFINED);
        // 6. If Result(5) is not an object, go to step 9.
        match value_of_method {
          v @ AvmValue::Object(_) => {
            // 7. Call the [[Call]] method of Result(5), with O as the this value and an empty argument list.
            let result = ctx.apply(v, AvmValue::Object(self.clone()), &[]).map_err(|_| ())?;
            // 8. If Result(7) is a primitive value, return Result(7).
            match AvmPrimitive::try_from(result) {
              Ok(p) => return Ok(p),
              Err(_) => {}
            }
          }
          _ => {}
        }
        // 9. Throw a TypeError exception.
        Err(()) // AvmValue::String(ctx.string(String::from("TypeError")).unwrap()))
      }
      ToPrimitiveHint::Number => {
        unimplemented!("ToPrimitive(Object, Hint::Number)")
      }
    }
  }

  fn to_avm_string<C: Context<'gc>>(&self, ctx: &mut C) -> Result<Gc<'gc, AvmString>, GcAllocErr> {
    let primitive = self.to_avm_primitive(ctx, ToPrimitiveHint::String).unwrap();
    primitive.to_avm_string(ctx)
  }
}

#[derive(Debug, Trace)]
pub enum AvmCallable<'gc> {
  AvmFunction(AvmFunction<'gc>),
  HostFunction(HostFunction<'gc>),
}

#[derive(Debug, Trace)]
pub struct AvmFunction<'gc> {
  /// Id of the script containing the code
  //  script_id: Avm1ScriptId,

  // /// Range of the function body AVM1 byte code inside the script.
  /// Function body
  pub code: Vec<u8>,

  /// Parent scope
  pub scope: Gc<'gc, GcRefCell<Scope<'gc>>>,

  pub register_count: u8,
}

pub struct HostFunction<'gc> {
  pub func: fn(&mut dyn CallContext<'gc>) -> AvmResult<'gc>,
}

impl<'gc> std::fmt::Debug for HostFunction<'gc> {
  fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
    write!(f, "HostFunction(...)")
  }
}

unsafe impl<'gc> scoped_gc::Trace for HostFunction<'gc> {
  #[inline]
  unsafe fn mark(&self) {}
  #[inline]
  unsafe fn root(&self) {}
  #[inline]
  unsafe fn unroot(&self) {}
}
