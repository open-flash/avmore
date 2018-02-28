use values::{AvmValue, AvmString};
use scope::Scope;

pub struct Context {
  pub swf_version: u8,
  pub scope: Scope,
}

impl Context {
  pub fn new(swf_version: u8) -> Context {
    Context {
      swf_version,
      scope: Scope::new(),
    }
  }

  pub fn trace(&self, message: &str) -> () {
    println!("{}", message);
  }
}
