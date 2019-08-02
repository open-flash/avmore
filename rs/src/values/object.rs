use ::std::collections::hash_map::HashMap;
use scoped_gc::{Gc, GcAllocErr, GcRefCell, GcScope};
use self::super::{AvmUndefined, AvmValue};
use crate::avm1::Scope;

#[derive(Debug, Clone, Trace)]
pub struct AvmObjectProperty<'gc> {
  pub read_only: bool,
  pub enumerable: bool,
  pub deletable: bool,
  pub internal: bool,
  pub value: AvmValue<'gc>,
}

#[derive(Debug, Trace)]
pub struct AvmObject<'gc> {
  // TODO: Insertion order
  properties: HashMap<String, AvmObjectProperty<'gc>>,

  pub callable: Option<AvmFunction<'gc>>,
}

impl<'gc> AvmObject<'gc> {
  pub fn new(gc: &'gc GcScope<'gc>) -> Result<Gc<'gc, GcRefCell<AvmObject<'gc>>>, GcAllocErr> {
    gc.alloc(GcRefCell::new(AvmObject {
      properties: HashMap::new(),
      callable: None,
    }))
  }

  pub fn new_callable(gc: &'gc GcScope<'gc>, callable: AvmFunction<'gc>) -> Result<Gc<'gc, GcRefCell<AvmObject<'gc>>>, GcAllocErr> {
    gc.alloc(GcRefCell::new(AvmObject {
      properties: HashMap::new(),
      callable: Some(callable),
    }))
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

  pub fn get(&self, key: String) -> AvmValue<'gc> {
    self.properties.get(&key)
      .map(|prop| prop.value.clone())
      .unwrap_or(AvmValue::Undefined(AvmUndefined))
  }

  pub fn get_property(&self, key: String) -> Option<AvmObjectProperty<'gc>> {
    self.properties.get(&key).map(|prop| prop.clone())
  }
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
}
