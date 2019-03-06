use ::std::collections::hash_map::HashMap;
use ::scoped_gc::GcScope;
use crate::host::Host;
use avm1_tree;
use values::AvmValue;

pub struct Context<'gc> {
  pub swf_version: u8,
  // TEMPORARY
  pub globals: HashMap<String, AvmValue<'gc>>,
  pub host: &'gc Host,
  pub gc_scope: &'gc GcScope<'gc>,
}

impl<'gc> Context<'gc> {
  pub fn new(host: &'gc Host, gc_scope: &'gc GcScope<'gc>, swf_version: u8) -> Context<'gc> {
    Context {
      swf_version,
      globals: HashMap::new(),
      host,
      gc_scope,
    }
  }

  pub fn trace(&self, message: &str) -> () {
    self.host.trace(message);
  }

  pub fn set_var(&mut self, key: String, value: String) {
    self.globals.insert(key, AvmValue::from_ast(self.gc_scope, &avm1_tree::Value::String(value)).unwrap());
  }

  pub fn get_var(&mut self, key: String) -> &AvmValue<'gc> {
    self.globals.get(&key).unwrap()
  }
}
