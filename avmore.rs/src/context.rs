use values::{AvmValue, AvmString};
use scope::Scope;
use host::Host;

pub struct Context<'a> {
  pub swf_version: u8,
  pub scope: Scope,
  host: &'a Host,
}

impl<'a> Context<'a> {
  pub fn new(swf_version: u8, host: &Host) -> Context {
    Context {
      swf_version,
      scope: Scope::new(),
      host,
    }
  }

  pub fn trace(&self, message: &str) -> () {
    self.host.trace(message);
  }
}
