use typed_arena::Arena;
use std::marker;

pub struct Scope {
  strings: Arena<String>,
}

impl Scope {
  pub fn new() -> Scope {
    Scope {
      strings: Arena::new(),
    }
  }

  pub fn alloc_string(&self, value: &str) -> &str {
    self.strings.alloc(value.to_string())
  }
}
