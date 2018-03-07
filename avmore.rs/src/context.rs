use ::std::collections::hash_map::HashMap;
use gc::GcRootScope;
use host::Host;
use swf_tree::avm1 as avm1_tree;
use values::AvmValue;

pub struct Context<'gc, 'gcstatic: 'gc> {
  pub swf_version: u8,
  pub globals: HashMap<String, AvmValue<'gc>>,
  // TEMPORARY
  pub host: &'gc Host,
  pub gc_scope: &'gc GcRootScope<'gcstatic>,
}

impl<'gc, 'gcstatic: 'gc> Context<'gc, 'gcstatic> {
  pub fn new(host: &'gc Host, gc_scope: &'gc GcRootScope<'gcstatic>, swf_version: u8) -> Context<'gc, 'gcstatic> {
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
    self.globals.insert(key, AvmValue::from_ast(self.gc_scope, &avm1_tree::actions::Value::CString(value)).unwrap());
  }

  pub fn get_var(&mut self, key: String) -> &AvmValue<'gc> {
    self.globals.get(&key).unwrap()
  }
}
