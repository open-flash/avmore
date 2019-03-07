use ::std::collections::hash_map::HashMap;
use scoped_gc::{Gc, GcAllocErr, GcRefCell, GcScope};
use self::super::{AvmUndefined, AvmValue};

#[derive(Debug, Clone, Trace)]
pub struct AvmObjectProperty<'gc> {
  pub read_only: bool,
  pub enumerable: bool,
  pub deletable: bool,
  pub intermal: bool,
  pub value: AvmValue<'gc>,
}

#[derive(Debug, Trace)]
pub struct AvmObject<'gc> {
  // TODO: Insertion order
  properties: HashMap<String, AvmObjectProperty<'gc>>,
}

impl<'gc> AvmObject<'gc> {
  pub fn new(gc_scope: &'gc GcScope<'gc>) -> Result<Gc<'gc, GcRefCell<AvmObject<'gc>>>, GcAllocErr> {
    gc_scope.alloc(GcRefCell::new(AvmObject {
      properties: HashMap::new(),
    }))
  }

  pub fn set(&mut self, key: String, value: AvmValue<'gc>) {
    let property = AvmObjectProperty {
      read_only: false,
      enumerable: true,
      deletable: true,
      intermal: true,
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
